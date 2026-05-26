import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

export class CitaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CitaError";
  }
}

export async function nextCitaFolio(
  tx: Tx,
  sucursalId: string,
  sucursalCodigo: string,
): Promise<string> {
  const counter = await tx.citaFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `CT-${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

const TRANSICIONES_VALIDAS: Record<string, ReadonlyArray<string>> = {
  programada: ["confirmada", "checkin", "cancelada", "no_asistio"],
  confirmada: ["checkin", "cancelada", "no_asistio"],
  checkin: ["en_consulta", "cancelada", "no_asistio"],
  en_consulta: ["completada", "cancelada"],
  completada: [],
  cancelada: [],
  no_asistio: [],
};

export function assertTransicionEstadoCita(actual: string, siguiente: string): void {
  const permitidas = TRANSICIONES_VALIDAS[actual];
  if (!permitidas) {
    throw new CitaError(409, `Estado "${actual}" desconocido`);
  }
  if (!permitidas.includes(siguiente)) {
    throw new CitaError(409, `No se puede pasar de "${actual}" a "${siguiente}"`, {
      transicionesValidas: permitidas,
    });
  }
}
