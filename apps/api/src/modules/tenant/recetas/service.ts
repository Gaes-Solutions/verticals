import { randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

export class RecetaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RecetaError";
  }
}

export async function nextRecetaFolio(
  tx: Tx,
  sucursalId: string,
  sucursalCodigo: string,
): Promise<string> {
  const counter = await tx.recetaFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `RX-${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

export function generateRecetaToken(): string {
  return randomBytes(24).toString("hex");
}
