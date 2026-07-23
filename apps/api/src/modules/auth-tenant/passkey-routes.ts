import { createHmac, timingSafeEqual } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import {
  buildTenantPrincipal,
  findTenantBySlug,
  loadTenantUserById,
  updateLastLogin,
} from "./service.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function rp() {
  return {
    rpID: process.env.WEBAUTHN_RP_ID?.trim() || "app.angaes.com",
    rpName: process.env.WEBAUTHN_RP_NAME?.trim() || "GaesSoft",
    origin: process.env.WEBAUTHN_ORIGIN?.trim() || "https://app.angaes.com",
  };
}

interface ChallengePayload {
  challenge: string;
  purpose: "reg" | "login";
  tenantSlug: string;
  usuarioId?: string;
  exp: number;
}

// El challenge viaja firmado (HMAC) al cliente y regresa en /verify: sin estado
// en servidor, a prueba de manipulación y con expiración corta.
function firmarChallenge(payload: ChallengePayload): string {
  const secret = process.env.JWT_SECRET ?? "";
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verificarChallenge(token: string): ChallengePayload | null {
  const secret = process.env.JWT_SECRET ?? "";
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const esperado = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as ChallengePayload;
    return payload.exp < Date.now() ? null : payload;
  } catch {
    return null;
  }
}

function transportsToArray(csv: string | null): AuthenticatorTransportFuture[] | undefined {
  return csv ? (csv.split(",") as AuthenticatorTransportFuture[]) : undefined;
}

function unauthorized(reply: FastifyReply, message = "No se pudo verificar la huella") {
  return reply.code(401).send({ statusCode: 401, error: "Unauthorized", message });
}

const regVerifySchema = z.object({
  response: z.unknown(),
  challengeToken: z.string(),
  deviceName: z.string().max(60).optional(),
});
const loginOptSchema = z.object({ tenantSlug: z.string().min(3).max(40) });
const loginVerifySchema = z.object({
  tenantSlug: z.string().min(3).max(40),
  response: z.unknown(),
  challengeToken: z.string(),
});

const passkeyRoutes: FastifyPluginAsync = async (app) => {
  // ── Registro (el usuario ya está dentro): asocia una huella a su cuenta ──
  app.post(
    "/passkey/register/options",
    { preHandler: app.authenticateTenant },
    async (req, reply) => {
      if (req.user.kind !== "tenant") return unauthorized(reply);
      const { sub: usuarioId, tenantSlug, email } = req.user;
      const existentes = await app.masterPrisma.webauthnCredential.findMany({
        where: { tenantSlug, usuarioId },
        select: { credentialId: true, transports: true },
      });
      const { rpID, rpName } = rp();
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: email,
        userID: new TextEncoder().encode(usuarioId),
        attestationType: "none",
        excludeCredentials: existentes.map((c) => {
          const t = transportsToArray(c.transports);
          return { id: c.credentialId, ...(t ? { transports: t } : {}) };
        }),
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      });
      const challengeToken = firmarChallenge({
        challenge: options.challenge,
        purpose: "reg",
        tenantSlug,
        usuarioId,
        exp: Date.now() + CHALLENGE_TTL_MS,
      });
      return { options, challengeToken };
    },
  );

  app.post(
    "/passkey/register/verify",
    { preHandler: app.authenticateTenant },
    async (req, reply) => {
      if (req.user.kind !== "tenant") return unauthorized(reply);
      const body = regVerifySchema.parse(req.body);
      const ch = verificarChallenge(body.challengeToken);
      if (
        !ch ||
        ch.purpose !== "reg" ||
        ch.tenantSlug !== req.user.tenantSlug ||
        ch.usuarioId !== req.user.sub
      ) {
        return reply
          .code(400)
          .send({ statusCode: 400, error: "Bad Request", message: "Challenge inválido" });
      }
      const { rpID, origin } = rp();
      try {
        const verification = await verifyRegistrationResponse({
          response: body.response as RegistrationResponseJSON,
          expectedChallenge: ch.challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
        });
        if (!verification.verified || !verification.registrationInfo) {
          return reply
            .code(400)
            .send({ statusCode: 400, error: "Bad Request", message: "Credencial no verificada" });
        }
        const cred = verification.registrationInfo.credential;
        await app.masterPrisma.webauthnCredential.create({
          data: {
            tenantSlug: req.user.tenantSlug,
            usuarioId: req.user.sub,
            credentialId: cred.id,
            publicKey: Buffer.from(cred.publicKey).toString("base64url"),
            counter: BigInt(cred.counter),
            transports: cred.transports?.join(",") ?? null,
            deviceName: body.deviceName ?? null,
          },
        });
        return { ok: true };
      } catch {
        return reply.code(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "No se pudo registrar la huella",
        });
      }
    },
  );

  // ── Login con huella (público) ──
  app.post("/passkey/login/options", async (req) => {
    const { tenantSlug } = loginOptSchema.parse(req.body);
    const { rpID } = rp();
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials: [],
    });
    const challengeToken = firmarChallenge({
      challenge: options.challenge,
      purpose: "login",
      tenantSlug,
      exp: Date.now() + CHALLENGE_TTL_MS,
    });
    return { options, challengeToken };
  });

  app.post(
    "/passkey/login/verify",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = loginVerifySchema.parse(req.body);
      const ch = verificarChallenge(body.challengeToken);
      if (!ch || ch.purpose !== "login" || ch.tenantSlug !== body.tenantSlug) {
        return unauthorized(reply);
      }
      const response = body.response as AuthenticationResponseJSON;
      const cred = await app.masterPrisma.webauthnCredential.findUnique({
        where: { credentialId: response.id },
      });
      if (!cred || cred.tenantSlug !== body.tenantSlug) return unauthorized(reply);

      const { rpID, origin } = rp();
      const trans = transportsToArray(cred.transports);
      let verified = false;
      let newCounter = 0;
      try {
        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: ch.challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          credential: {
            id: cred.credentialId,
            publicKey: new Uint8Array(Buffer.from(cred.publicKey, "base64url")),
            counter: Number(cred.counter),
            ...(trans ? { transports: trans } : {}),
          },
        });
        verified = verification.verified;
        newCounter = verification.authenticationInfo.newCounter;
      } catch {
        return unauthorized(reply);
      }
      if (!verified) return unauthorized(reply);

      await app.masterPrisma.webauthnCredential.update({
        where: { id: cred.id },
        data: { counter: BigInt(newCounter), lastUsedAt: new Date() },
      });

      const tenant = await findTenantBySlug(body.tenantSlug, app.masterPrisma);
      if (!tenant || tenant.status === "cancelled") return unauthorized(reply);
      const tenantPrisma = getTenantClient(body.tenantSlug);
      const user = await loadTenantUserById(cred.usuarioId, tenantPrisma);
      if (!user || !user.isActive) return unauthorized(reply);

      const principal = buildTenantPrincipal(user, body.tenantSlug);
      await updateLastLogin(body.tenantSlug, principal.id, undefined);
      const accessToken = await reply.jwtSign({
        sub: principal.id,
        email: principal.email,
        tenantSlug: principal.tenantSlug,
        permissions: principal.isOwner ? ["*"] : principal.permissions,
        kind: "tenant",
      });
      return {
        accessToken,
        user: {
          id: principal.id,
          email: principal.email,
          nombre: principal.nombre,
          apellidos: principal.apellidos,
          tipoUsuario: principal.tipoUsuario,
          isOwner: principal.isOwner,
          roleCodes: principal.roleCodes,
          permissions: principal.isOwner ? ["*"] : principal.permissions,
        },
        tenant: { slug: body.tenantSlug },
      };
    },
  );

  // ── Gestión de huellas del propio usuario (Seguridad) ──
  app.get("/passkey/list", { preHandler: app.authenticateTenant }, async (req, reply) => {
    if (req.user.kind !== "tenant") return unauthorized(reply);
    return app.masterPrisma.webauthnCredential.findMany({
      where: { tenantSlug: req.user.tenantSlug, usuarioId: req.user.sub },
      select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.delete("/passkey/:id", { preHandler: app.authenticateTenant }, async (req, reply) => {
    if (req.user.kind !== "tenant") return unauthorized(reply);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await app.masterPrisma.webauthnCredential.deleteMany({
      where: { id, tenantSlug: req.user.tenantSlug, usuarioId: req.user.sub },
    });
    return { ok: true };
  });
};

export default passkeyRoutes;
