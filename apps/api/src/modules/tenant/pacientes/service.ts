import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

export class PacienteError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PacienteError";
  }
}

export async function nextNumeroExpediente(client: TenantClient): Promise<string> {
  // Patrón EXP-NNNNNN derivado del count actual + 1.
  // En V2 con muchos tenants/concurrencia migrar a tabla counter dedicada.
  const count = await client.paciente.count();
  return `EXP-${String(count + 1).padStart(6, "0")}`;
}
