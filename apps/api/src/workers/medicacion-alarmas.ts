import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

export interface AlarmaPayload {
  kardexId: string;
  medicacionProgramadaId: string;
  hospitalizacionId: string;
  medicamentoNombre: string;
  dosis: string;
  via: string;
  horaProgramada: Date;
  pacienteNombre: string | null;
  mascotaNombre: string | null;
  sucursalId: string;
}

export interface AlarmChannel {
  enviar(payload: AlarmaPayload): Promise<void>;
}

export interface EscanearOptions {
  /** ahora desde el cual se calcula la ventana — default `new Date()` */
  ahora?: Date;
  /** minutos antes de horaProgramada en los que se dispara la alarma — default 15 */
  ventanaMinutosAntes?: number;
  /** máximo de kardex a procesar por escaneo — default 200 */
  maxBatch?: number;
}

export interface EscanearResult {
  candidatos: number;
  enviadas: number;
  errores: number;
}

const DEFAULT_VENTANA_MIN = 15;
const DEFAULT_MAX_BATCH = 200;

export async function escanearKardexParaAlarmar(
  client: TenantClient,
  channel: AlarmChannel,
  opts: EscanearOptions = {},
): Promise<EscanearResult> {
  const ahora = opts.ahora ?? new Date();
  const ventana = opts.ventanaMinutosAntes ?? DEFAULT_VENTANA_MIN;
  const max = opts.maxBatch ?? DEFAULT_MAX_BATCH;
  const horizonte = new Date(ahora.getTime() + ventana * 60_000);

  const kardexes = await client.kardexAplicacion.findMany({
    where: {
      estado: "pendiente",
      alertaEnviadaAt: null,
      horaProgramada: { gte: ahora, lte: horizonte },
    },
    include: {
      medicacionProgramada: {
        include: {
          hospitalizacion: {
            include: {
              paciente: { select: { nombre: true, apellidoPaterno: true } },
              mascota: { select: { nombre: true } },
            },
          },
        },
      },
    },
    orderBy: { horaProgramada: "asc" },
    take: max,
  });

  let enviadas = 0;
  let errores = 0;
  for (const k of kardexes) {
    const med = k.medicacionProgramada;
    const hosp = med.hospitalizacion;
    if (med.estado !== "activa" || hosp.estado !== "activa") continue;
    const payload: AlarmaPayload = {
      kardexId: k.id,
      medicacionProgramadaId: med.id,
      hospitalizacionId: hosp.id,
      medicamentoNombre: med.medicamentoNombreSnapshot,
      dosis: med.dosis,
      via: med.via,
      horaProgramada: k.horaProgramada,
      pacienteNombre: hosp.paciente
        ? `${hosp.paciente.nombre} ${hosp.paciente.apellidoPaterno ?? ""}`.trim()
        : null,
      mascotaNombre: hosp.mascota ? hosp.mascota.nombre : null,
      sucursalId: hosp.sucursalId,
    };
    try {
      await channel.enviar(payload);
      await client.kardexAplicacion.update({
        where: { id: k.id },
        data: { alertaEnviadaAt: ahora },
      });
      enviadas++;
    } catch {
      errores++;
    }
  }

  return { candidatos: kardexes.length, enviadas, errores };
}

export class InMemoryAlarmChannel implements AlarmChannel {
  public readonly enviadas: AlarmaPayload[] = [];
  async enviar(payload: AlarmaPayload): Promise<void> {
    this.enviadas.push(payload);
  }
}
