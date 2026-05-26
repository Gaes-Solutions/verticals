import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

export class VacunacionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VacunacionError";
  }
}

export function validateSujetoXor(input: {
  pacienteId?: string | undefined;
  mascotaId?: string | undefined;
}): void {
  const tieneP = Boolean(input.pacienteId);
  const tieneM = Boolean(input.mascotaId);
  if (tieneP === tieneM) {
    throw new VacunacionError(400, "Indica exactamente uno: pacienteId (humano) o mascotaId (vet)");
  }
}

/**
 * Calcula próxima fecha de vacunación basada en intervaloRefuerzosDias del catálogo.
 * Si el catálogo no define intervalo, retorna null.
 */
export function calcularProximaFecha(
  fechaAplicacion: Date,
  intervaloRefuerzosDias: number | null,
): Date | null {
  if (!intervaloRefuerzosDias || intervaloRefuerzosDias <= 0) return null;
  const proxima = new Date(fechaAplicacion);
  proxima.setDate(proxima.getDate() + intervaloRefuerzosDias);
  return proxima;
}

export interface CartillaResultado {
  sujeto: { tipo: "paciente" | "mascota"; id: string; nombre: string };
  vacunacionesAplicadas: Array<{
    id: string;
    vacunaNombre: string;
    fechaAplicacion: Date;
    numeroLote: string;
    proximaAplicacionFecha: Date | null;
    estado: "vigente" | "proxima" | "vencida";
  }>;
  proximasDosis: Array<{ vacunaNombre: string; fechaProgramada: Date; diasFaltantes: number }>;
}

const DIAS_PROXIMA = 30;

export async function obtenerCartilla(
  client: TenantClient,
  sujeto: { pacienteId?: string; mascotaId?: string },
): Promise<CartillaResultado> {
  validateSujetoXor(sujeto);
  const where: Record<string, string> = sujeto.pacienteId
    ? { pacienteId: sujeto.pacienteId }
    : { mascotaId: sujeto.mascotaId as string };
  const vacunaciones = await client.vacunacion.findMany({
    where,
    include: {
      vacuna: { select: { nombreComercial: true } },
    },
    orderBy: { fechaAplicacion: "desc" },
  });

  let nombre = "";
  let tipo: "paciente" | "mascota" = "mascota";
  let id = "";
  if (sujeto.pacienteId) {
    const p = await client.paciente.findUnique({
      where: { id: sujeto.pacienteId },
      select: { id: true, nombre: true, apellidoPaterno: true },
    });
    if (!p) throw new VacunacionError(404, "Paciente no encontrado");
    tipo = "paciente";
    id = p.id;
    nombre = `${p.nombre} ${p.apellidoPaterno ?? ""}`.trim();
  } else if (sujeto.mascotaId) {
    const m = await client.mascota.findUnique({
      where: { id: sujeto.mascotaId },
      select: { id: true, nombre: true },
    });
    if (!m) throw new VacunacionError(404, "Mascota no encontrada");
    id = m.id;
    nombre = m.nombre;
  }

  const ahora = new Date();
  const vacunacionesAplicadas = vacunaciones.map((v) => {
    const proxima = v.proximaAplicacionFecha;
    let estado: "vigente" | "proxima" | "vencida" = "vigente";
    if (proxima) {
      if (proxima < ahora) estado = "vencida";
      else if (proxima.getTime() - ahora.getTime() < DIAS_PROXIMA * 86400000) estado = "proxima";
    }
    return {
      id: v.id,
      vacunaNombre: v.vacuna.nombreComercial,
      fechaAplicacion: v.fechaAplicacion,
      numeroLote: v.numeroLote,
      proximaAplicacionFecha: proxima ?? null,
      estado,
    };
  });

  const proximasDosis = vacunacionesAplicadas
    .filter((v) => v.proximaAplicacionFecha && v.proximaAplicacionFecha > ahora)
    .map((v) => ({
      vacunaNombre: v.vacunaNombre,
      fechaProgramada: v.proximaAplicacionFecha as Date,
      diasFaltantes: Math.ceil((v.proximaAplicacionFecha!.getTime() - ahora.getTime()) / 86400000),
    }))
    .sort((a, b) => a.fechaProgramada.getTime() - b.fechaProgramada.getTime());

  return { sujeto: { tipo, id, nombre }, vacunacionesAplicadas, proximasDosis };
}
