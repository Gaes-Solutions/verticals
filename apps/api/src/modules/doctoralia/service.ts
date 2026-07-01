import type {
  MasterPrismaClient,
  PacienteMaster,
  PublicProfessional,
  PublicProfessionalLocation,
  PublicProfessionalSearchIndex,
  PublicReview,
} from "@gaespos/db";
import Decimal from "decimal.js";

export class DoctoraliaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DoctoraliaError";
  }
}

export type ProfesionalTipo =
  | "medico_humano"
  | "veterinario"
  | "dentista"
  | "nutriologo"
  | "psicologo";

const SLUG_RANDOM_LEN = 6;

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Moderación heurística determinística (V1). Detecta spam/lenguaje ofensivo
 * y datos de contacto (los reviews no deben volverse canal de spam). Lo que
 * no pasa limpio se manda a `revision_humana`. Reemplazable por IA real sin
 * tocar callers — mantiene la línea "NO IA decisional clínica": esto modera
 * texto público, no contenido clínico.
 */
const PALABRAS_BLOQUEADAS = [
  "puto",
  "puta",
  "pendejo",
  "imbecil",
  "estafa",
  "fraude",
  "matasanos",
  "charlatan",
];
const REGEX_CONTACTO = /(\b\d{10}\b|https?:\/\/|www\.|@[a-z0-9]+\.)/i;

export interface ModeracionResult {
  status: "auto_aprobado_ia" | "revision_humana";
  flags: string[];
  score: number;
}

export function moderarTextoResena(texto?: string | null): ModeracionResult {
  const flags: string[] = [];
  if (texto && texto.trim().length > 0) {
    const lower = texto.toLowerCase();
    for (const palabra of PALABRAS_BLOQUEADAS) {
      if (lower.includes(palabra)) {
        flags.push(`palabra_bloqueada:${palabra}`);
      }
    }
    if (REGEX_CONTACTO.test(texto)) flags.push("datos_contacto");
    if (texto.length > 1500) flags.push("longitud_excesiva");
  }
  const status = flags.length === 0 ? "auto_aprobado_ia" : "revision_humana";
  const score = flags.length === 0 ? 1 : Math.max(0, 1 - flags.length * 0.34);
  return { status, flags, score };
}

function rankingFromScore(scorePromedio: Decimal, totalResenas: number): Decimal {
  const boost = Math.log(1 + totalResenas) / 10;
  return scorePromedio.mul(new Decimal(1).add(boost)).toDecimalPlaces(4);
}

async function generarSlugUnico(master: MasterPrismaClient, base: string): Promise<string> {
  const root = slugify(base) || "profesional";
  let candidate = root;
  let intento = 0;
  while (await master.publicProfessional.findUnique({ where: { slugSeo: candidate } })) {
    intento += 1;
    const suffix = Math.random()
      .toString(36)
      .slice(2, 2 + SLUG_RANDOM_LEN);
    candidate = `${root}-${suffix}`;
    if (intento > 5) break;
  }
  return candidate;
}

export interface UpsertPerfilInput {
  tenantId: string;
  medicoIdLocal: string;
  tipo: ProfesionalTipo;
  nombrePublico: string;
  cedulaProfesional?: string | undefined;
  cedulaEspecialidad?: string | undefined;
  especialidades?: string[] | undefined;
  fotoPerfilUrl?: string | undefined;
  bioCorta?: string | undefined;
  bioLarga?: string | undefined;
  anosExperiencia?: number | undefined;
  idiomas?: string[] | undefined;
  genero?: string | undefined;
  atiendeNinos?: boolean | undefined;
  atiendeAdultos?: boolean | undefined;
  aceptaTelemedicina?: boolean | undefined;
  aceptaMismoDia?: boolean | undefined;
}

export async function upsertPerfilProfesional(
  master: MasterPrismaClient,
  input: UpsertPerfilInput,
): Promise<PublicProfessional> {
  const existing = await master.publicProfessional.findUnique({
    where: {
      tenantIdPrincipal_medicoIdLocal: {
        tenantIdPrincipal: input.tenantId,
        medicoIdLocal: input.medicoIdLocal,
      },
    },
  });

  const datos = {
    tipo: input.tipo,
    nombrePublico: input.nombrePublico,
    ...(input.cedulaProfesional !== undefined
      ? { cedulaProfesional: input.cedulaProfesional }
      : {}),
    ...(input.cedulaEspecialidad !== undefined
      ? { cedulaEspecialidad: input.cedulaEspecialidad }
      : {}),
    ...(input.especialidades !== undefined ? { especialidades: input.especialidades } : {}),
    ...(input.fotoPerfilUrl !== undefined ? { fotoPerfilUrl: input.fotoPerfilUrl } : {}),
    ...(input.bioCorta !== undefined ? { bioCorta: input.bioCorta } : {}),
    ...(input.bioLarga !== undefined ? { bioLarga: input.bioLarga } : {}),
    ...(input.anosExperiencia !== undefined ? { anosExperiencia: input.anosExperiencia } : {}),
    ...(input.idiomas !== undefined ? { idiomas: input.idiomas } : {}),
    ...(input.genero !== undefined ? { genero: input.genero } : {}),
    ...(input.atiendeNinos !== undefined ? { atiendeNinos: input.atiendeNinos } : {}),
    ...(input.atiendeAdultos !== undefined ? { atiendeAdultos: input.atiendeAdultos } : {}),
    ...(input.aceptaTelemedicina !== undefined
      ? { aceptaTelemedicina: input.aceptaTelemedicina }
      : {}),
    ...(input.aceptaMismoDia !== undefined ? { aceptaMismoDia: input.aceptaMismoDia } : {}),
  };

  if (existing) {
    const updated = await master.publicProfessional.update({
      where: { id: existing.id },
      data: datos,
    });
    if (existing.status === "publicado") await refreshSearchIndex(master, updated.id);
    return updated;
  }

  const slugSeo = await generarSlugUnico(master, input.nombrePublico);
  return master.publicProfessional.create({
    data: {
      tenantIdPrincipal: input.tenantId,
      medicoIdLocal: input.medicoIdLocal,
      slugSeo,
      ...datos,
    },
  });
}

async function getProfesionalDelTenant(
  master: MasterPrismaClient,
  professionalId: string,
  tenantId: string,
): Promise<PublicProfessional> {
  const prof = await master.publicProfessional.findUnique({ where: { id: professionalId } });
  if (!prof) throw new DoctoraliaError(404, "Perfil no encontrado");
  if (prof.tenantIdPrincipal !== tenantId) {
    throw new DoctoraliaError(403, "El perfil no pertenece a este tenant");
  }
  return prof;
}

export async function enviarPerfilARevision(
  master: MasterPrismaClient,
  professionalId: string,
  tenantId: string,
): Promise<PublicProfessional> {
  const prof = await getProfesionalDelTenant(master, professionalId, tenantId);
  if (!prof.cedulaProfesional) {
    throw new DoctoraliaError(409, "No se puede enviar a revisión sin cédula profesional");
  }
  if (prof.status !== "borrador" && prof.status !== "suspendido") {
    throw new DoctoraliaError(409, `No se puede enviar a revisión desde estado ${prof.status}`);
  }
  return master.publicProfessional.update({
    where: { id: professionalId },
    data: { status: "en_revision" },
  });
}

export interface ValidarAdminInput {
  adminId: string;
  cedulaValidaSsa: boolean;
  aprobar: boolean;
  motivoRechazo?: string | undefined;
}

export async function validarPerfilPorAdmin(
  master: MasterPrismaClient,
  professionalId: string,
  input: ValidarAdminInput,
): Promise<PublicProfessional> {
  const prof = await master.publicProfessional.findUnique({ where: { id: professionalId } });
  if (!prof) throw new DoctoraliaError(404, "Perfil no encontrado");
  if (prof.status !== "en_revision") {
    throw new DoctoraliaError(409, `Solo se valida un perfil en_revision (actual: ${prof.status})`);
  }
  const now = new Date();
  if (!input.aprobar) {
    return master.publicProfessional.update({
      where: { id: professionalId },
      data: { status: "borrador" },
    });
  }
  const updated = await master.publicProfessional.update({
    where: { id: professionalId },
    data: {
      status: "publicado",
      validadaPorAdminAt: now,
      ...(input.cedulaValidaSsa ? { validadaSsaAt: now } : {}),
    },
  });
  await refreshSearchIndex(master, professionalId);
  return updated;
}

export async function suspenderPerfil(
  master: MasterPrismaClient,
  professionalId: string,
): Promise<PublicProfessional> {
  const prof = await master.publicProfessional.findUnique({ where: { id: professionalId } });
  if (!prof) throw new DoctoraliaError(404, "Perfil no encontrado");
  await master.publicProfessionalSearchIndex
    .delete({ where: { professionalId } })
    .catch(() => undefined);
  return master.publicProfessional.update({
    where: { id: professionalId },
    data: { status: "suspendido" },
  });
}

export interface UbicacionInput {
  nombreLugar: string;
  direccion?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  ciudad: string;
  estado: string;
  colonia?: string | undefined;
  cp?: string | undefined;
  telefonoPublico?: string | undefined;
  esPrincipal?: boolean | undefined;
}

export async function agregarUbicacion(
  master: MasterPrismaClient,
  professionalId: string,
  tenantId: string,
  input: UbicacionInput,
): Promise<PublicProfessionalLocation> {
  const prof = await getProfesionalDelTenant(master, professionalId, tenantId);
  if (input.esPrincipal) {
    await master.publicProfessionalLocation.updateMany({
      where: { professionalId },
      data: { esPrincipal: false },
    });
  }
  const ubicacion = await master.publicProfessionalLocation.create({
    data: {
      professionalId,
      tenantId,
      nombreLugar: input.nombreLugar,
      ciudad: input.ciudad,
      estado: input.estado,
      esPrincipal: input.esPrincipal ?? false,
      ...(input.direccion !== undefined ? { direccion: input.direccion } : {}),
      ...(input.lat !== undefined ? { lat: new Decimal(input.lat) } : {}),
      ...(input.lng !== undefined ? { lng: new Decimal(input.lng) } : {}),
      ...(input.colonia !== undefined ? { colonia: input.colonia } : {}),
      ...(input.cp !== undefined ? { cp: input.cp } : {}),
      ...(input.telefonoPublico !== undefined ? { telefonoPublico: input.telefonoPublico } : {}),
    },
  });
  if (prof.status === "publicado") await refreshSearchIndex(master, professionalId);
  return ubicacion;
}

/**
 * Reconstruye el índice de búsqueda denormalizado del profesional. Concentra
 * el texto buscable (nombre + especialidades + ciudades) en `searchText` para
 * un FTS por `contains` (V1, sin extensión PostGIS/tsvector).
 */
export async function refreshSearchIndex(
  master: MasterPrismaClient,
  professionalId: string,
): Promise<PublicProfessionalSearchIndex | null> {
  const prof = await master.publicProfessional.findUnique({
    where: { id: professionalId },
    include: { ubicaciones: { where: { activa: true } } },
  });
  if (!prof) throw new DoctoraliaError(404, "Perfil no encontrado");

  if (prof.status !== "publicado") {
    await master.publicProfessionalSearchIndex
      .delete({ where: { professionalId } })
      .catch(() => undefined);
    return null;
  }

  const especialidades = Array.isArray(prof.especialidades)
    ? (prof.especialidades as string[])
    : [];
  const principal = prof.ubicaciones.find((u) => u.esPrincipal) ?? prof.ubicaciones[0];
  const ciudades = prof.ubicaciones.map((u) => u.ciudad);
  const estados = prof.ubicaciones.map((u) => u.estado);
  const searchText = [prof.nombrePublico, ...especialidades, ...ciudades, ...estados]
    .join(" ")
    .toLowerCase();
  const scoreRanking = rankingFromScore(
    new Decimal(prof.scorePromedio.toString()),
    prof.totalResenas,
  );

  return master.publicProfessionalSearchIndex.upsert({
    where: { professionalId },
    create: {
      professionalId,
      searchText,
      tipo: prof.tipo,
      scoreRanking,
      aceptaTelemedicina: prof.aceptaTelemedicina,
      aceptaMismoDia: prof.aceptaMismoDia,
      idiomas: prof.idiomas as object,
      atiendeNinos: prof.atiendeNinos,
      atiendeAdultos: prof.atiendeAdultos,
      ...(principal?.ciudad ? { ciudad: principal.ciudad } : {}),
      ...(principal?.estado ? { estado: principal.estado } : {}),
    },
    update: {
      searchText,
      tipo: prof.tipo,
      scoreRanking,
      aceptaTelemedicina: prof.aceptaTelemedicina,
      aceptaMismoDia: prof.aceptaMismoDia,
      idiomas: prof.idiomas as object,
      atiendeNinos: prof.atiendeNinos,
      atiendeAdultos: prof.atiendeAdultos,
      refreshedAt: new Date(),
      ...(principal?.ciudad ? { ciudad: principal.ciudad } : {}),
      ...(principal?.estado ? { estado: principal.estado } : {}),
    },
  });
}

export interface BusquedaFiltros {
  q?: string | undefined;
  tipo?: ProfesionalTipo | undefined;
  ciudad?: string | undefined;
  estado?: string | undefined;
  aceptaTelemedicina?: boolean | undefined;
  atiendeNinos?: boolean | undefined;
  page: number;
  pageSize: number;
}

export interface BusquedaResultado {
  items: unknown[];
  total: number;
  page: number;
  pageSize: number;
}

export async function buscarProfesionales(
  master: MasterPrismaClient,
  filtros: BusquedaFiltros,
): Promise<BusquedaResultado> {
  const where: Record<string, unknown> = {};
  if (filtros.q) where.searchText = { contains: filtros.q.toLowerCase() };
  if (filtros.tipo) where.tipo = filtros.tipo;
  if (filtros.ciudad) where.ciudad = { equals: filtros.ciudad, mode: "insensitive" };
  if (filtros.estado) where.estado = { equals: filtros.estado, mode: "insensitive" };
  if (filtros.aceptaTelemedicina !== undefined) {
    where.aceptaTelemedicina = filtros.aceptaTelemedicina;
  }
  if (filtros.atiendeNinos !== undefined) where.atiendeNinos = filtros.atiendeNinos;

  const [total, items] = await Promise.all([
    master.publicProfessionalSearchIndex.count({ where }),
    master.publicProfessionalSearchIndex.findMany({
      where,
      include: {
        professional: {
          select: {
            id: true,
            slugSeo: true,
            nombrePublico: true,
            tipo: true,
            especialidades: true,
            fotoPerfilUrl: true,
            bioCorta: true,
            scorePromedio: true,
            totalResenas: true,
            validadaSsaAt: true,
            aceptaTelemedicina: true,
            aceptaMismoDia: true,
          },
        },
      },
      orderBy: { scoreRanking: "desc" },
      skip: (filtros.page - 1) * filtros.pageSize,
      take: filtros.pageSize,
    }),
  ]);
  return {
    items: items.map((i) => i.professional),
    total,
    page: filtros.page,
    pageSize: filtros.pageSize,
  };
}

export async function obtenerPerfilPublico(
  master: MasterPrismaClient,
  slug: string,
): Promise<unknown> {
  const prof = await master.publicProfessional.findUnique({
    where: { slugSeo: slug },
    include: {
      ubicaciones: { where: { activa: true }, orderBy: { esPrincipal: "desc" } },
      reviews: {
        where: { moderacionStatus: "publicado" },
        orderBy: { publicadaAt: "desc" },
        take: 50,
        select: {
          id: true,
          verificada: true,
          ratingGeneral: true,
          ratingPuntualidad: true,
          ratingExplicacion: true,
          ratingTrato: true,
          comentario: true,
          respuestaMedico: true,
          publicadaAt: true,
          helpfulCount: true,
        },
      },
    },
  });
  if (!prof || prof.status !== "publicado") {
    throw new DoctoraliaError(404, "Profesional no encontrado");
  }
  return prof;
}

export async function registrarPacienteMaster(
  master: MasterPrismaClient,
  input: {
    email: string;
    nombre: string;
    apellidos?: string | undefined;
    telefono?: string | undefined;
  },
): Promise<PacienteMaster> {
  return master.pacienteMaster.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      nombre: input.nombre,
      ...(input.apellidos !== undefined ? { apellidos: input.apellidos } : {}),
      ...(input.telefono !== undefined ? { telefono: input.telefono } : {}),
    },
    update: {
      nombre: input.nombre,
      ...(input.apellidos !== undefined ? { apellidos: input.apellidos } : {}),
      ...(input.telefono !== undefined ? { telefono: input.telefono } : {}),
    },
  });
}

/**
 * V1 stub de verificación. El reto OTP real (envío + storage del código) vive
 * en el portal paciente (Hito 4.4); aquí solo marca el email como verificado
 * para habilitar reseñas verificadas. Idempotente.
 */
export async function confirmarPacienteMaster(
  master: MasterPrismaClient,
  email: string,
): Promise<PacienteMaster> {
  const paciente = await master.pacienteMaster.findUnique({ where: { email } });
  if (!paciente) throw new DoctoraliaError(404, "Paciente no registrado");
  if (paciente.otpVerificadoAt) return paciente;
  return master.pacienteMaster.update({
    where: { email },
    data: { otpVerificadoAt: new Date() },
  });
}

async function recalcularScoreProfesional(master: MasterPrismaClient, professionalId: string) {
  const agg = await master.publicReview.aggregate({
    where: { professionalId, moderacionStatus: "publicado" },
    _avg: { ratingGeneral: true },
    _count: { _all: true },
  });
  const promedio = agg._avg.ratingGeneral ?? 0;
  const total = agg._count._all;
  await master.publicProfessional.update({
    where: { id: professionalId },
    data: {
      scorePromedio: new Decimal(promedio).toDecimalPlaces(2),
      totalResenas: total,
    },
  });
  await refreshSearchIndex(master, professionalId).catch(() => undefined);
}

export interface CrearResenaInput {
  professionalId: string;
  pacienteEmail: string;
  bookingId?: string | undefined;
  ratingGeneral: number;
  ratingPuntualidad?: number | undefined;
  ratingExplicacion?: number | undefined;
  ratingTrato?: number | undefined;
  comentario?: string | undefined;
}

export async function crearResena(
  master: MasterPrismaClient,
  input: CrearResenaInput,
): Promise<PublicReview> {
  const prof = await master.publicProfessional.findUnique({
    where: { id: input.professionalId },
    select: { id: true, status: true },
  });
  if (!prof || prof.status !== "publicado") {
    throw new DoctoraliaError(404, "Profesional no disponible para reseñas");
  }
  const paciente = await master.pacienteMaster.findUnique({
    where: { email: input.pacienteEmail },
  });
  if (!paciente) throw new DoctoraliaError(404, "Paciente no registrado");
  if (!paciente.otpVerificadoAt) {
    throw new DoctoraliaError(403, "El paciente debe verificar su identidad antes de reseñar");
  }

  const existente = await master.publicReview.findFirst({
    where: { professionalId: input.professionalId, pacienteMasterId: paciente.id },
  });
  if (existente) {
    throw new DoctoraliaError(409, "El paciente ya reseñó a este profesional");
  }

  const moderacion = moderarTextoResena(input.comentario);
  const publicada = moderacion.status === "auto_aprobado_ia";
  const review = await master.publicReview.create({
    data: {
      professionalId: input.professionalId,
      pacienteMasterId: paciente.id,
      verificada: Boolean(input.bookingId),
      ratingGeneral: input.ratingGeneral,
      moderacionStatus: publicada ? "publicado" : "revision_humana",
      moderacionIaScore: {
        decision: moderacion.status,
        score: moderacion.score,
        flags: moderacion.flags,
      } as object,
      ...(input.bookingId !== undefined ? { bookingId: input.bookingId } : {}),
      ...(input.ratingPuntualidad !== undefined
        ? { ratingPuntualidad: input.ratingPuntualidad }
        : {}),
      ...(input.ratingExplicacion !== undefined
        ? { ratingExplicacion: input.ratingExplicacion }
        : {}),
      ...(input.ratingTrato !== undefined ? { ratingTrato: input.ratingTrato } : {}),
      ...(input.comentario !== undefined ? { comentario: input.comentario } : {}),
      ...(publicada ? { publicadaAt: new Date() } : {}),
    },
  });
  if (publicada) await recalcularScoreProfesional(master, input.professionalId);
  return review;
}

async function getReviewDelProfesional(
  master: MasterPrismaClient,
  reviewId: string,
  professionalId: string,
): Promise<PublicReview> {
  const review = await master.publicReview.findUnique({ where: { id: reviewId } });
  if (!review) throw new DoctoraliaError(404, "Reseña no encontrada");
  if (review.professionalId !== professionalId) {
    throw new DoctoraliaError(403, "La reseña no pertenece a este profesional");
  }
  return review;
}

export async function responderResena(
  master: MasterPrismaClient,
  reviewId: string,
  professionalId: string,
  respuesta: string,
): Promise<PublicReview> {
  const review = await getReviewDelProfesional(master, reviewId, professionalId);
  if (review.moderacionStatus !== "publicado") {
    throw new DoctoraliaError(409, "Solo se puede responder una reseña publicada");
  }
  return master.publicReview.update({
    where: { id: reviewId },
    data: { respuestaMedico: respuesta },
  });
}

export async function denunciarResena(
  master: MasterPrismaClient,
  reviewId: string,
  professionalId: string,
): Promise<PublicReview> {
  const review = await getReviewDelProfesional(master, reviewId, professionalId);
  const updated = await master.publicReview.update({
    where: { id: reviewId },
    data: {
      moderacionStatus: "denunciado_medico",
      reportadaCount: { increment: 1 },
      publicadaAt: null,
    },
  });
  if (review.moderacionStatus === "publicado") {
    await recalcularScoreProfesional(master, professionalId);
  }
  return updated;
}

export async function moderarResenaAdmin(
  master: MasterPrismaClient,
  reviewId: string,
  aprobar: boolean,
): Promise<PublicReview> {
  const review = await master.publicReview.findUnique({ where: { id: reviewId } });
  if (!review) throw new DoctoraliaError(404, "Reseña no encontrada");
  const updated = await master.publicReview.update({
    where: { id: reviewId },
    data: aprobar
      ? { moderacionStatus: "publicado", publicadaAt: new Date() }
      : { moderacionStatus: "rechazado", publicadaAt: null },
  });
  await recalcularScoreProfesional(master, review.professionalId);
  return updated;
}

// ─────────────────────────── Reservas (bookings) ────────────────────────────

import type { TenantPrismaClient } from "@gaespos/db";
import { nextCitaFolio } from "../tenant/citas/service.js";
import { nextNumeroExpediente } from "../tenant/pacientes/service.js";

export interface ReservarCitaInput {
  professionalId: string;
  pacienteMasterId: string;
  locationId?: string | undefined;
  fechaHora: string;
  modalidad: "presencial" | "telemedicina";
  motivo?: string | undefined;
}

/** Un paciente verificado reserva una cita con un profesional publicado. */
export async function reservarCita(master: MasterPrismaClient, input: ReservarCitaInput) {
  const prof = await master.publicProfessional.findUnique({
    where: { id: input.professionalId },
  });
  if (!prof || prof.status !== "publicado") {
    throw new DoctoraliaError(404, "Profesional no encontrado");
  }
  const paciente = await master.pacienteMaster.findUnique({
    where: { id: input.pacienteMasterId },
  });
  if (!paciente) throw new DoctoraliaError(404, "Paciente no registrado");
  if (!paciente.otpVerificadoAt) {
    throw new DoctoraliaError(403, "El paciente debe verificar su cuenta antes de reservar");
  }
  if (input.modalidad === "telemedicina" && !prof.aceptaTelemedicina) {
    throw new DoctoraliaError(409, "Este profesional no ofrece telemedicina");
  }
  return master.publicBooking.create({
    data: {
      professionalId: prof.id,
      tenantId: prof.tenantIdPrincipal,
      medicoIdLocal: prof.medicoIdLocal,
      pacienteMasterId: paciente.id,
      pacienteNombre: [paciente.nombre, paciente.apellidos].filter(Boolean).join(" "),
      pacienteTelefono: paciente.telefono ?? paciente.phoneE164,
      pacienteEmail: paciente.email,
      fechaHora: new Date(input.fechaHora),
      modalidad: input.modalidad,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(input.motivo ? { motivo: input.motivo } : {}),
    },
  });
}

export async function listarReservasPaciente(master: MasterPrismaClient, pacienteMasterId: string) {
  return master.publicBooking.findMany({
    where: { pacienteMasterId },
    orderBy: { fechaHora: "desc" },
    include: { professional: { select: { nombrePublico: true, slugSeo: true } } },
  });
}

export async function listarReservasTenant(
  master: MasterPrismaClient,
  tenantId: string,
  status?: string,
) {
  return master.publicBooking.findMany({
    where: { tenantId, ...(status ? { status: status as never } : {}) },
    orderBy: { fechaHora: "asc" },
    include: { professional: { select: { nombrePublico: true } } },
  });
}

// Reusa o crea un paciente LOCAL del tenant a partir del snapshot del booking.
// Empata por email para no duplicar en reservas sucesivas del mismo paciente.
async function upsertPacienteLocal(
  tenant: TenantPrismaClient,
  booking: {
    pacienteNombre: string;
    pacienteEmail: string | null;
    pacienteTelefono: string | null;
  },
): Promise<string> {
  if (booking.pacienteEmail) {
    const existente = await tenant.paciente.findFirst({
      where: { emailPrincipal: booking.pacienteEmail },
      select: { id: true },
    });
    if (existente) return existente.id;
  }
  const [nombre, ...resto] = booking.pacienteNombre.split(" ");
  const numeroExpediente = await nextNumeroExpediente(tenant);
  const creado = await tenant.paciente.create({
    data: {
      numeroExpediente,
      nombre: nombre || booking.pacienteNombre,
      ...(resto.length ? { apellidoPaterno: resto.join(" ") } : {}),
      ...(booking.pacienteTelefono ? { telefonoPrincipal: booking.pacienteTelefono } : {}),
      ...(booking.pacienteEmail ? { emailPrincipal: booking.pacienteEmail } : {}),
      fechaPrimeraVisita: new Date(),
    },
    select: { id: true },
  });
  return creado.id;
}

/**
 * El tenant del profesional confirma la reserva: crea (o reusa) el paciente
 * local, genera una Cita en su agenda y liga la reserva a esa Cita.
 */
export async function confirmarReserva(
  master: MasterPrismaClient,
  tenant: TenantPrismaClient,
  tenantId: string,
  bookingId: string,
  medicoUsuarioIdOverride?: string,
): Promise<{ bookingId: string; citaId: string; folio: string; pacienteId: string }> {
  const booking = await master.publicBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.tenantId !== tenantId) {
    throw new DoctoraliaError(404, "Reserva no encontrada");
  }
  if (booking.status !== "pendiente") {
    throw new DoctoraliaError(409, `La reserva ya está "${booking.status}"`);
  }
  const medicoUsuarioId = medicoUsuarioIdOverride ?? booking.medicoIdLocal;
  if (!medicoUsuarioId) {
    throw new DoctoraliaError(400, "No se pudo determinar el médico; indica medicoUsuarioId");
  }
  const sucursal = await tenant.sucursal.findFirst({ select: { id: true, codigo: true } });
  if (!sucursal) throw new DoctoraliaError(400, "El tenant no tiene sucursal configurada");

  const pacienteId = await upsertPacienteLocal(tenant, booking);
  const cita = await tenant.$transaction(async (tx) => {
    const folio = await nextCitaFolio(tx, sucursal.id, sucursal.codigo);
    return tx.cita.create({
      data: {
        folio,
        pacienteId,
        medicoUsuarioId,
        sucursalId: sucursal.id,
        fechaProgramada: booking.fechaHora,
        estado: "confirmada",
        motivoTexto: booking.motivo ?? "Cita agendada desde Doctoralia",
      },
      select: { id: true, folio: true },
    });
  });

  await master.publicBooking.update({
    where: { id: bookingId },
    data: { status: "confirmada", confirmadaAt: new Date(), citaIdLocal: cita.id },
  });
  return { bookingId, citaId: cita.id, folio: cita.folio, pacienteId };
}

export async function rechazarReserva(
  master: MasterPrismaClient,
  tenantId: string,
  bookingId: string,
  motivo: string,
) {
  const booking = await master.publicBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.tenantId !== tenantId) {
    throw new DoctoraliaError(404, "Reserva no encontrada");
  }
  if (booking.status !== "pendiente") {
    throw new DoctoraliaError(409, `La reserva ya está "${booking.status}"`);
  }
  return master.publicBooking.update({
    where: { id: bookingId },
    data: { status: "rechazada", rechazadaAt: new Date(), motivoRechazo: motivo },
  });
}
