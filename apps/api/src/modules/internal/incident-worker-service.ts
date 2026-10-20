import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { MasterPrismaClient, Prisma } from "@gaespos/db";
import { z } from "zod";
import {
  sanitizeIncidentRoute,
  sanitizeIncidentText,
} from "../../observability/incident-sanitizer.js";

const LEASE_MS = 90 * 60_000;
const RETRY_MS = 15 * 60_000;
const proposalSchema = z.object({
  summary: z.string().trim().min(1),
  requiresHumanApproval: z.literal(true),
  autoFixAllowed: z.literal(false),
  testPlan: z.array(z.string().trim().min(1)).min(1),
});
export type IncidentWorkerProposal = z.infer<typeof proposalSchema>;
export interface IncidentWorkerPayload {
  version: 1;
  incidentId: string;
  provider: "codex";
  service: string;
  message: string;
  stack: string | null;
  route: string | null;
  proposal: IncidentWorkerProposal;
  applied: false;
  requiresReview: true;
  execution: "external-isolated-worker-required";
}
export interface IncidentWorkerHandoff extends IncidentWorkerPayload {
  handoffId: string;
  claimId: string;
  leaseExpiresAt: string;
  payloadDigest: string;
}

const sha40 = z.string().regex(/^[a-f0-9]{40}$/);
const sha64 = z.string().regex(/^[a-f0-9]{64}$/);
const runUrl = z
  .union([
    z.string().regex(/^https:\/\/github\.com\/Gaes-Solutions\/verticals\/actions\/runs\/[1-9]\d*$/),
    z
      .string()
      .regex(
        /^urn:gaes:incident-worker:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
  ])
  // JavaScript's $ also matches before a trailing line break; do not normalize callback identities.
  .refine((value) => value === value.trim());
const resultCommon = z.object({
  incidentId: z.string().min(1).max(100),
  claimId: z.string().uuid(),
  payloadDigest: sha64,
  runUrl,
});
const prUrl = z
  .string()
  .regex(/^https:\/\/github\.com\/Gaes-Solutions\/verticals\/pull\/[1-9]\d*$/)
  .refine((value) => value === value.trim());
export const incidentWorkerResultSchema = z.discriminatedUnion("outcome", [
  resultCommon
    .extend({ outcome: z.literal("pr_created"), prUrl, baseSha: sha40, patchSha: sha64 })
    .strict(),
  resultCommon
    .extend({ outcome: z.literal("failed"), baseSha: sha40.optional(), patchSha: sha64.optional() })
    .strict(),
  resultCommon
    .extend({
      outcome: z.literal("blocked"),
      baseSha: sha40.optional(),
      patchSha: sha64.optional(),
    })
    .strict(),
]);
export type IncidentWorkerResult = z.infer<typeof incidentWorkerResultSchema>;
export type IncidentWorkerReceipt = { accepted: true; idempotent: boolean };

/** Recursively sorted JSON; worker implementations must hash precisely these UTF-8 bytes. */
export function canonicalIncidentJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalIncidentJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalIncidentJson(item)}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("El payload no es JSON serializable");
  return serialized;
}

export function incidentWorkerPayloadDigest(payload: IncidentWorkerPayload): string {
  return createHash("sha256").update(canonicalIncidentJson(payload), "utf8").digest("hex");
}

/** Bound JSON-encoded UTF-8, including escaped controls and supplementary Unicode. */
function boundedText(value: string, bytes: number): string {
  let result = "";
  let remaining = bytes;
  for (const char of sanitizeIncidentText(value)) {
    const size = Buffer.byteLength(JSON.stringify(char), "utf8") - 2;
    if (size > remaining) break;
    result += char;
    remaining -= size;
  }
  return result;
}

function payloadFor(
  incident: {
    id: string;
    service: string;
    message: string;
    stack: string | null;
    route: string | null;
  },
  proposal: IncidentWorkerProposal,
): IncidentWorkerPayload {
  return {
    version: 1,
    incidentId: incident.id,
    provider: "codex",
    service: boundedText(incident.service, 200),
    message: boundedText(incident.message, 2000),
    stack: incident.stack ? boundedText(incident.stack, 5000) : null,
    route: incident.route ? boundedText(sanitizeIncidentRoute(incident.route), 1000) : null,
    proposal: {
      summary: boundedText(proposal.summary, 1000),
      requiresHumanApproval: true,
      autoFixAllowed: false,
      testPlan: proposal.testPlan.slice(0, 10).map((step) => boundedText(step, 100)),
    },
    applied: false,
    requiresReview: true,
    execution: "external-isolated-worker-required",
  };
}

export async function claimIncidentWork(
  master: MasterPrismaClient,
  now = new Date(),
): Promise<IncidentWorkerHandoff | null> {
  return master.$transaction(async (tx) => {
    // Invalid historical approvals cannot permanently starve the valid queue behind them.
    for (let inspected = 0; inspected < 10; inspected++) {
      const incident = await tx.systemIncident.findFirst({
        where: {
          status: "audited",
          auditDecision: { in: ["approved", "approved_handoff"] },
          resolvedAt: null,
          nextReviewAt: { lte: now },
        },
        orderBy: [{ nextReviewAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          auditDecision: true,
          updatedAt: true,
          nextReviewAt: true,
          service: true,
          message: true,
          stack: true,
          route: true,
          aiProposal: true,
        },
      });
      if (!incident) return null;
      const where = {
        id: incident.id,
        status: "audited" as const,
        auditDecision: incident.auditDecision,
        resolvedAt: null,
        updatedAt: incident.updatedAt,
        nextReviewAt: { equals: incident.nextReviewAt, lte: now },
      };
      const parsed = proposalSchema.safeParse(incident.aiProposal);
      if (!parsed.success) {
        const invalidated = await tx.systemIncident.updateMany({
          where,
          data: { auditDecision: "approved_blocked" },
        });
        if (!invalidated.count) return null;
        await tx.systemIncidentEvent.create({
          data: {
            incidentId: incident.id,
            kind: "agent_worker_blocked",
            payload: { reason: "invalid_proposal", applied: false, requiresReview: true },
          },
        });
        continue;
      }
      const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
      const payload = payloadFor(incident, parsed.data);
      const handoff: IncidentWorkerHandoff = {
        ...payload,
        handoffId: `c${randomBytes(12).toString("hex")}`,
        claimId: randomUUID(),
        leaseExpiresAt: leaseExpiresAt.toISOString(),
        payloadDigest: incidentWorkerPayloadDigest(payload),
      };
      const claimed = await tx.systemIncident.updateMany({
        where,
        data: { auditDecision: "approved_handoff", nextReviewAt: leaseExpiresAt },
      });
      if (!claimed.count) return null;
      await tx.systemIncidentEvent.create({
        data: {
          id: handoff.handoffId,
          incidentId: incident.id,
          kind: "agent_worker_claimed",
          payload: handoff as unknown as Prisma.InputJsonValue,
        },
      });
      return handoff;
    }
    return null;
  });
}

const claimIdentity = z.object({
  incidentId: z.string(),
  claimId: z.string().uuid(),
  payloadDigest: sha64,
  leaseExpiresAt: z.string().datetime(),
});
const recordedResult = z.object({ result: incidentWorkerResultSchema });
type Transaction = Prisma.TransactionClient;

async function existingReceipt(
  tx: Transaction,
  result: IncidentWorkerResult,
): Promise<IncidentWorkerReceipt | null> {
  const previous = await tx.systemIncidentEvent.findFirst({
    where: {
      incidentId: result.incidentId,
      kind: "agent_worker_result",
      payload: { path: ["result", "claimId"], equals: result.claimId },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { payload: true },
  });
  if (!previous) return null;
  const parsed = recordedResult.safeParse(previous.payload);
  if (
    !parsed.success ||
    canonicalIncidentJson(parsed.data.result) !== canonicalIncidentJson(result)
  )
    return null;
  return { accepted: true, idempotent: true };
}

async function latestClaimMatches(tx: Transaction, result: IncidentWorkerResult) {
  const latest = await tx.systemIncidentEvent.findFirst({
    where: { incidentId: result.incidentId, kind: "agent_worker_claimed" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { payload: true },
  });
  const parsed = claimIdentity.safeParse(latest?.payload);
  if (!parsed.success) return null;
  const claim = parsed.data;
  if (
    claim.incidentId !== result.incidentId ||
    claim.claimId !== result.claimId ||
    claim.payloadDigest !== result.payloadDigest
  )
    return null;
  return claim;
}

export async function recordIncidentWorkResult(
  master: MasterPrismaClient,
  result: IncidentWorkerResult,
  now = new Date(),
): Promise<IncidentWorkerReceipt | null> {
  return master.$transaction(async (tx) => {
    const claim = await latestClaimMatches(tx, result);
    if (!claim) return null;
    const previous = await existingReceipt(tx, result);
    if (previous) return previous;
    const incident = await tx.systemIncident.findUnique({
      where: { id: result.incidentId },
      select: { updatedAt: true },
    });
    if (!incident) return null;
    const leaseExpiresAt = new Date(claim.leaseExpiresAt);
    const retryExhausted = await failedRetryExhausted(tx, result);
    const data = resultState(result, now, retryExhausted);
    const changed = await tx.systemIncident.updateMany({
      where: {
        id: result.incidentId,
        status: "audited",
        auditDecision: "approved_handoff",
        resolvedAt: null,
        updatedAt: incident.updatedAt,
        nextReviewAt: { equals: leaseExpiresAt, gt: now },
      },
      data,
    });
    // A simultaneous duplicate may have completed while this UPDATE waited on its row lock.
    if (!changed.count) return existingReceipt(tx, result);
    await tx.systemIncidentEvent.create({
      data: {
        incidentId: result.incidentId,
        kind: "agent_worker_result",
        payload: {
          result,
          applied: false,
          requiresReview: true,
          receivedAt: now.toISOString(),
          retryExhausted,
          ...(retryExhausted ? { reason: "retry_budget_exhausted" } : {}),
        },
      },
    });
    return { accepted: true, idempotent: false };
  });
}

async function failedRetryExhausted(
  tx: Transaction,
  result: IncidentWorkerResult,
): Promise<boolean> {
  if (result.outcome !== "failed") return false;
  const previousFailures = await tx.systemIncidentEvent.count({
    where: {
      incidentId: result.incidentId,
      kind: "agent_worker_result",
      AND: [
        { payload: { path: ["result", "payloadDigest"], equals: result.payloadDigest } },
        { payload: { path: ["result", "outcome"], equals: "failed" } },
      ],
    },
  });
  return previousFailures >= 2;
}

function resultState(result: IncidentWorkerResult, now: Date, retryExhausted: boolean) {
  if (retryExhausted) return { auditDecision: "approved_blocked" };
  if (result.outcome === "failed")
    return { auditDecision: "approved_handoff", nextReviewAt: new Date(now.getTime() + RETRY_MS) };
  if (result.outcome === "blocked") return { auditDecision: "approved_blocked" };
  return { auditDecision: "approved_pr" };
}
