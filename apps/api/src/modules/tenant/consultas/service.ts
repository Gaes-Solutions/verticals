import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

export class ConsultaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ConsultaError";
  }
}

/**
 * NOM-024 — Consulta firmada es inmutable.
 * Para corregir: crear nueva consulta con consultaOriginalId apuntando a la original
 * + estado=borrador (luego firmar) y marcar la original como enmendada.
 */
export async function asegurarConsultaMutable(
  client: TenantClient,
  consultaId: string,
): Promise<{ id: string; estado: string }> {
  const c = await client.consulta.findUnique({
    where: { id: consultaId },
    select: { id: true, estado: true },
  });
  if (!c) throw new ConsultaError(404, "Consulta no encontrada");
  if (c.estado !== "borrador") {
    throw new ConsultaError(
      409,
      `Consulta en estado "${c.estado}" no se puede modificar — usar enmienda`,
    );
  }
  return c;
}
