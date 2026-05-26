import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

export class MascotaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MascotaError";
  }
}

export async function nextMascotaExpediente(client: TenantClient): Promise<string> {
  const count = await client.mascota.count();
  return `MAS-${String(count + 1).padStart(6, "0")}`;
}
