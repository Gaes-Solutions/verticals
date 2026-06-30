import { randomBytes } from "node:crypto";
import type { EmailProvider } from "@gaespos/email";
import { type MessagingProvider, renderHandlebars } from "@gaespos/mensajeria";
import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

export class RecordatorioError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "RecordatorioError";
  }
}

export type CanalRecordatorio = "whatsapp" | "sms" | "email";

export interface RecordatoriosConfig {
  citasActivo: boolean;
  citasHorasAntes: number;
  citasCanal: CanalRecordatorio;
  citasPlantilla: string;
}

// Plantilla recomendada por el sistema (el dueño puede sobreescribirla). Usa
// {{var}} (mismo render que campañas). Incluye el link de confirmación.
export const PLANTILLA_CITA_DEFAULT =
  "Hola 👋 Te recordamos la cita de {{sujeto}} en {{clinica}} el {{fecha}} a las {{hora}}. " +
  "Confirma o reagenda aquí: {{link}}";

const CANALES: ReadonlyArray<CanalRecordatorio> = ["whatsapp", "sms", "email"];

function normalizaConfig(row: {
  citasActivo: boolean;
  citasHorasAntes: number;
  citasCanal: string;
  citasPlantilla: string | null;
}): RecordatoriosConfig {
  const canal = CANALES.includes(row.citasCanal as CanalRecordatorio)
    ? (row.citasCanal as CanalRecordatorio)
    : "whatsapp";
  return {
    citasActivo: row.citasActivo,
    citasHorasAntes: row.citasHorasAntes,
    citasCanal: canal,
    citasPlantilla: row.citasPlantilla ?? PLANTILLA_CITA_DEFAULT,
  };
}

/** Lee la config (singleton). La crea con defaults recomendados si no existe. */
export async function getConfigRecordatorios(prisma: TenantClient): Promise<RecordatoriosConfig> {
  const row =
    (await prisma.configRecordatorios.findFirst()) ??
    (await prisma.configRecordatorios.create({ data: {} }));
  return normalizaConfig(row);
}

export interface ConfigRecordatoriosUpdate {
  citasActivo?: boolean | undefined;
  citasHorasAntes?: number | undefined;
  citasCanal?: CanalRecordatorio | undefined;
  citasPlantilla?: string | null | undefined;
}

export async function updateConfigRecordatorios(
  prisma: TenantClient,
  input: ConfigRecordatoriosUpdate,
): Promise<RecordatoriosConfig> {
  const actual = await prisma.configRecordatorios.findFirst();
  const data = {
    ...(input.citasActivo !== undefined ? { citasActivo: input.citasActivo } : {}),
    ...(input.citasHorasAntes !== undefined ? { citasHorasAntes: input.citasHorasAntes } : {}),
    ...(input.citasCanal !== undefined ? { citasCanal: input.citasCanal } : {}),
    // "" desde la UI = volver a la plantilla recomendada (guardamos null).
    ...(input.citasPlantilla !== undefined
      ? { citasPlantilla: input.citasPlantilla ? input.citasPlantilla : null }
      : {}),
  };
  const row = actual
    ? await prisma.configRecordatorios.update({ where: { id: actual.id }, data })
    : await prisma.configRecordatorios.create({ data });
  return normalizaConfig(row);
}

export interface EnviarRecordatoriosResult {
  evaluadas: number;
  enviadas: number;
  omitidasSinContacto: number;
  fallidas: number;
}

export interface RecordatorioProviders {
  whatsapp?: MessagingProvider | undefined;
  sms?: MessagingProvider | undefined;
  email?: EmailProvider | undefined;
}

function fmtFecha(d: Date): string {
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}
function fmtHora(d: Date): string {
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Manda el recordatorio de las citas próximas que entran en la ventana
 * `citasHorasAntes` y aún no se han avisado. Genera un token de confirmación
 * por cita para el link público. Idempotente: marca `recordatorioEnviadoAt` y
 * filtra por él, así que correrlo de más no duplica envíos.
 */
export async function enviarRecordatoriosCitas(
  prisma: TenantClient,
  providers: RecordatorioProviders,
  opts: { tenantSlug: string; clinicaNombre: string; baseUrl: string; ahora?: Date },
): Promise<EnviarRecordatoriosResult> {
  const cfg = await getConfigRecordatorios(prisma);
  const res: EnviarRecordatoriosResult = {
    evaluadas: 0,
    enviadas: 0,
    omitidasSinContacto: 0,
    fallidas: 0,
  };
  if (!cfg.citasActivo) return res;

  const ahora = opts.ahora ?? new Date();
  const limite = new Date(ahora.getTime() + cfg.citasHorasAntes * 3_600_000);
  const citas = await prisma.cita.findMany({
    where: {
      estado: { in: ["programada", "confirmada"] },
      recordatorioEnviadoAt: null,
      fechaProgramada: { gt: ahora, lte: limite },
    },
    include: {
      mascota: {
        select: {
          nombre: true,
          tutorClienteId: true,
          tutor: { select: { telefonoPrincipal: true, emailPrincipal: true } },
        },
      },
      paciente: {
        select: {
          nombre: true,
          tutorClienteId: true,
          telefonoPrincipal: true,
          emailPrincipal: true,
        },
      },
      sucursal: { select: { nombre: true } },
    },
    orderBy: { fechaProgramada: "asc" },
  });
  res.evaluadas = citas.length;

  for (const cita of citas) {
    const r = await procesarCita(prisma, providers, cfg, opts, cita);
    if (r === "enviada") res.enviadas += 1;
    else if (r === "omitida") res.omitidasSinContacto += 1;
    else res.fallidas += 1;
  }
  return res;
}

interface CitaParaRecordatorio {
  id: string;
  fechaProgramada: Date;
  confirmacionToken: string | null;
  mascota: {
    nombre: string;
    tutorClienteId: string | null;
    tutor: { telefonoPrincipal: string | null; emailPrincipal: string | null } | null;
  } | null;
  paciente: {
    nombre: string;
    tutorClienteId: string | null;
    telefonoPrincipal: string | null;
    emailPrincipal: string | null;
  } | null;
  sucursal: { nombre: string } | null;
}

function contactoTutor(cita: CitaParaRecordatorio): { tel: string | null; mail: string | null } {
  return {
    tel: cita.mascota?.tutor?.telefonoPrincipal ?? cita.paciente?.telefonoPrincipal ?? null,
    mail: cita.mascota?.tutor?.emailPrincipal ?? cita.paciente?.emailPrincipal ?? null,
  };
}

async function despachar(
  providers: RecordatorioProviders,
  canal: CanalRecordatorio,
  destino: string,
  contenido: string,
  asunto: string,
): Promise<void> {
  if (canal === "email") {
    if (!providers.email) throw new RecordatorioError(400, "Sin provider de email");
    await providers.email.enviar({
      para: destino,
      asunto,
      html: `<p>${contenido}</p>`,
      texto: contenido,
    });
    return;
  }
  const prov = canal === "whatsapp" ? providers.whatsapp : providers.sms;
  if (!prov) throw new RecordatorioError(400, `Sin provider para canal ${canal}`);
  await prov.enviar({ destino, contenido });
}

async function procesarCita(
  prisma: TenantClient,
  providers: RecordatorioProviders,
  cfg: RecordatoriosConfig,
  opts: { tenantSlug: string; clinicaNombre: string; baseUrl: string },
  cita: CitaParaRecordatorio,
): Promise<"enviada" | "omitida" | "fallida"> {
  const { tel, mail } = contactoTutor(cita);
  const destino = cfg.citasCanal === "email" ? mail : tel;
  if (!destino) return "omitida";

  const token = cita.confirmacionToken ?? `cita_${randomBytes(16).toString("hex")}`;
  const variables = {
    sujeto: cita.mascota?.nombre ?? cita.paciente?.nombre ?? "tu mascota",
    clinica: opts.clinicaNombre || cita.sucursal?.nombre || "la clínica",
    fecha: fmtFecha(cita.fechaProgramada),
    hora: fmtHora(cita.fechaProgramada),
    link: `${opts.baseUrl}/citas-publico/${opts.tenantSlug}/${token}`,
  };
  const contenido = renderHandlebars(cfg.citasPlantilla, variables);

  try {
    await despachar(
      providers,
      cfg.citasCanal,
      destino,
      contenido,
      `Recordatorio de cita — ${variables.fecha}`,
    );
  } catch {
    return "fallida";
  }

  await prisma.cita.update({
    where: { id: cita.id },
    data: {
      recordatorioEnviadoAt: new Date(),
      recordatorioCanal: cfg.citasCanal,
      confirmacionToken: token,
    },
  });
  const clienteId = cita.mascota?.tutorClienteId ?? cita.paciente?.tutorClienteId ?? null;
  if (clienteId) {
    await prisma.notificacion.create({
      data: {
        destinatarioTipo: "cliente",
        clienteId,
        tipo: "recordatorio_cita",
        titulo: "Recordatorio de cita enviado",
        cuerpo: contenido,
        metadata: { citaId: cita.id, canal: cfg.citasCanal, destino },
      },
    });
  }
  return "enviada";
}

// ───────────────────── Confirmación pública (link del tutor) ─────────────────

const TRANSICIONES_PUBLICAS: Record<string, ReadonlyArray<string>> = {
  programada: ["confirmada", "cancelada"],
  confirmada: ["cancelada"],
};

export interface CitaPublicaVista {
  estado: string;
  sujeto: string;
  fechaProgramada: string;
  clinica: string;
  puedeConfirmar: boolean;
  puedeCancelar: boolean;
}

async function citaPorTokenOrThrow(prisma: TenantClient, token: string) {
  const cita = await prisma.cita.findUnique({
    where: { confirmacionToken: token },
    include: {
      mascota: { select: { nombre: true } },
      paciente: { select: { nombre: true } },
      sucursal: { select: { nombre: true } },
    },
  });
  if (!cita) throw new RecordatorioError(404, "Cita no encontrada");
  return cita;
}

export async function citaPublicaPorToken(
  prisma: TenantClient,
  token: string,
): Promise<CitaPublicaVista> {
  const cita = await citaPorTokenOrThrow(prisma, token);
  const permitidas = TRANSICIONES_PUBLICAS[cita.estado] ?? [];
  return {
    estado: cita.estado,
    sujeto: cita.mascota?.nombre ?? cita.paciente?.nombre ?? "tu mascota",
    fechaProgramada: cita.fechaProgramada.toISOString(),
    clinica: cita.sucursal?.nombre ?? "la clínica",
    puedeConfirmar: permitidas.includes("confirmada"),
    puedeCancelar: permitidas.includes("cancelada"),
  };
}

export async function confirmarCitaPublica(
  prisma: TenantClient,
  token: string,
): Promise<CitaPublicaVista> {
  const cita = await citaPorTokenOrThrow(prisma, token);
  if (cita.estado === "confirmada") return citaPublicaPorToken(prisma, token);
  if (!(TRANSICIONES_PUBLICAS[cita.estado] ?? []).includes("confirmada")) {
    throw new RecordatorioError(409, `La cita ya está "${cita.estado}", no se puede confirmar`);
  }
  await prisma.cita.update({ where: { id: cita.id }, data: { estado: "confirmada" } });
  return citaPublicaPorToken(prisma, token);
}

export async function cancelarCitaPublica(
  prisma: TenantClient,
  token: string,
  motivo: string,
): Promise<CitaPublicaVista> {
  const cita = await citaPorTokenOrThrow(prisma, token);
  if (cita.estado === "cancelada") return citaPublicaPorToken(prisma, token);
  if (!(TRANSICIONES_PUBLICAS[cita.estado] ?? []).includes("cancelada")) {
    throw new RecordatorioError(409, `La cita ya está "${cita.estado}", no se puede cancelar`);
  }
  await prisma.cita.update({
    where: { id: cita.id },
    data: {
      estado: "cancelada",
      canceladoAt: new Date(),
      canceladoMotivo: `Cancelada por el tutor: ${motivo}`.slice(0, 500),
    },
  });
  return citaPublicaPorToken(prisma, token);
}
