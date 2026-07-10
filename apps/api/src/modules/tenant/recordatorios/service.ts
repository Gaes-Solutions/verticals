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
  vacunasActivo: boolean;
  vacunasDiasAntes: number;
  vacunasCanal: CanalRecordatorio;
  vacunasPlantilla: string;
}

// Plantillas recomendadas por el sistema (el dueño puede sobreescribirlas). Usan
// {{var}} (mismo render que campañas). La de cita incluye el link de confirmación.
export const PLANTILLA_CITA_DEFAULT =
  "Hola 👋 Te recordamos la cita de {{sujeto}} en {{clinica}} el {{fecha}} a las {{hora}}. " +
  "Confirma o reagenda aquí: {{link}}";
export const PLANTILLA_VACUNA_DEFAULT =
  "Hola 👋 A {{sujeto}} le toca su vacuna {{vacuna}} el {{fecha}}. " +
  "Agenda su cita en {{clinica}} 🐾";

const CANALES: ReadonlyArray<CanalRecordatorio> = ["whatsapp", "sms", "email"];
function canalValido(c: string): CanalRecordatorio {
  return CANALES.includes(c as CanalRecordatorio) ? (c as CanalRecordatorio) : "whatsapp";
}

function normalizaConfig(row: {
  citasActivo: boolean;
  citasHorasAntes: number;
  citasCanal: string;
  citasPlantilla: string | null;
  vacunasActivo: boolean;
  vacunasDiasAntes: number;
  vacunasCanal: string;
  vacunasPlantilla: string | null;
}): RecordatoriosConfig {
  return {
    citasActivo: row.citasActivo,
    citasHorasAntes: row.citasHorasAntes,
    citasCanal: canalValido(row.citasCanal),
    citasPlantilla: row.citasPlantilla ?? PLANTILLA_CITA_DEFAULT,
    vacunasActivo: row.vacunasActivo,
    vacunasDiasAntes: row.vacunasDiasAntes,
    vacunasCanal: canalValido(row.vacunasCanal),
    vacunasPlantilla: row.vacunasPlantilla ?? PLANTILLA_VACUNA_DEFAULT,
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
  vacunasActivo?: boolean | undefined;
  vacunasDiasAntes?: number | undefined;
  vacunasCanal?: CanalRecordatorio | undefined;
  vacunasPlantilla?: string | null | undefined;
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
    ...(input.vacunasActivo !== undefined ? { vacunasActivo: input.vacunasActivo } : {}),
    ...(input.vacunasDiasAntes !== undefined ? { vacunasDiasAntes: input.vacunasDiasAntes } : {}),
    ...(input.vacunasCanal !== undefined ? { vacunasCanal: input.vacunasCanal } : {}),
    ...(input.vacunasPlantilla !== undefined
      ? { vacunasPlantilla: input.vacunasPlantilla ? input.vacunasPlantilla : null }
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

// ───────────────────── Recordatorios de próxima vacuna ───────────────────────

interface VacunacionParaRecordatorio {
  id: string;
  fechaAplicacion: Date;
  proximaAplicacionFecha: Date | null;
  vacunaCatalogoId: string;
  mascotaId: string | null;
  pacienteId: string | null;
  vacuna: { nombreComercial: string } | null;
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
}

// El tutor/mascota puede reutilizar los mismos helpers de contacto que las citas.
function contactoVacuna(v: VacunacionParaRecordatorio): {
  tel: string | null;
  mail: string | null;
} {
  return {
    tel: v.mascota?.tutor?.telefonoPrincipal ?? v.paciente?.telefonoPrincipal ?? null,
    mail: v.mascota?.tutor?.emailPrincipal ?? v.paciente?.emailPrincipal ?? null,
  };
}

/**
 * Manda el recordatorio de la PRÓXIMA vacuna a los sujetos cuya siguiente dosis
 * cae dentro de la ventana `vacunasDiasAntes` (incluye vencidas). Solo la
 * vacunación vigente por (sujeto, vacuna): si ya hay una posterior, esa dosis se
 * considera cumplida y se marca sin enviar. Idempotente por
 * `recordatorioProximaEnviadoAt`.
 */
export async function enviarRecordatoriosVacunas(
  prisma: TenantClient,
  providers: RecordatorioProviders,
  opts: { clinicaNombre: string; ahora?: Date },
): Promise<EnviarRecordatoriosResult> {
  const cfg = await getConfigRecordatorios(prisma);
  const res: EnviarRecordatoriosResult = {
    evaluadas: 0,
    enviadas: 0,
    omitidasSinContacto: 0,
    fallidas: 0,
  };
  if (!cfg.vacunasActivo) return res;

  const ahora = opts.ahora ?? new Date();
  const limite = new Date(ahora.getTime() + cfg.vacunasDiasAntes * 86_400_000);
  const vacunaciones = await prisma.vacunacion.findMany({
    where: {
      recordatorioProximaEnviadoAt: null,
      proximaAplicacionFecha: { not: null, lte: limite },
    },
    select: {
      id: true,
      fechaAplicacion: true,
      proximaAplicacionFecha: true,
      vacunaCatalogoId: true,
      mascotaId: true,
      pacienteId: true,
      vacuna: { select: { nombreComercial: true } },
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
    },
    orderBy: { proximaAplicacionFecha: "asc" },
  });
  res.evaluadas = vacunaciones.length;

  for (const v of vacunaciones) {
    const r = await procesarVacuna(prisma, providers, cfg, opts.clinicaNombre, v);
    if (r === "enviada") res.enviadas += 1;
    else if (r === "omitida") res.omitidasSinContacto += 1;
    else if (r === "fallida") res.fallidas += 1;
    // "superada" no cuenta: es una dosis ya cumplida por una aplicación posterior.
  }
  return res;
}

async function procesarVacuna(
  prisma: TenantClient,
  providers: RecordatorioProviders,
  cfg: RecordatoriosConfig,
  clinicaNombre: string,
  v: VacunacionParaRecordatorio,
): Promise<"enviada" | "omitida" | "fallida" | "superada"> {
  // ¿Hay una aplicación posterior de la misma vacuna al mismo sujeto? Entonces
  // esta "próxima dosis" ya se cumplió: la marcamos para no re-evaluarla.
  const posterior = await prisma.vacunacion.findFirst({
    where: {
      vacunaCatalogoId: v.vacunaCatalogoId,
      fechaAplicacion: { gt: v.fechaAplicacion },
      ...(v.mascotaId ? { mascotaId: v.mascotaId } : {}),
      ...(v.pacienteId ? { pacienteId: v.pacienteId } : {}),
    },
    select: { id: true },
  });
  if (posterior) {
    await prisma.vacunacion.update({
      where: { id: v.id },
      data: { recordatorioProximaEnviadoAt: new Date() },
    });
    return "superada";
  }

  const { tel, mail } = contactoVacuna(v);
  const destino = cfg.vacunasCanal === "email" ? mail : tel;
  if (!destino) return "omitida";

  const proxima = v.proximaAplicacionFecha ?? new Date();
  const variables = {
    sujeto: v.mascota?.nombre ?? v.paciente?.nombre ?? "tu mascota",
    vacuna: v.vacuna?.nombreComercial ?? "de refuerzo",
    clinica: clinicaNombre || "la clínica",
    fecha: fmtFecha(proxima),
  };
  const contenido = renderHandlebars(cfg.vacunasPlantilla, variables);

  try {
    await despachar(
      providers,
      cfg.vacunasCanal,
      destino,
      contenido,
      `Recordatorio de vacuna — ${variables.sujeto}`,
    );
  } catch {
    return "fallida";
  }

  await prisma.vacunacion.update({
    where: { id: v.id },
    data: { recordatorioProximaEnviadoAt: new Date() },
  });
  const clienteId = v.mascota?.tutorClienteId ?? v.paciente?.tutorClienteId ?? null;
  if (clienteId) {
    await prisma.notificacion.create({
      data: {
        destinatarioTipo: "cliente",
        clienteId,
        tipo: "recordatorio_vacuna",
        titulo: "Recordatorio de vacuna enviado",
        cuerpo: contenido,
        metadata: { vacunacionId: v.id, canal: cfg.vacunasCanal, destino },
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
