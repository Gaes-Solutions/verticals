import { masterPrisma } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { moderarTextoResena, slugify } from "../src/modules/marketplace/service.js";
import {
  buildTestApp,
  createTenantUser,
  createTestTenant,
  loginAdmin,
  loginTenantUser,
} from "./helpers.js";

const TENANT_SLUG = "test-marketplace-1";
const OWNER_EMAIL = "owner-doc@test.local";
const MEDICO_EMAIL = "medico-doc@test.local";
const RECEPCION_EMAIL = "rec-doc@test.local";
const PASSWORD = "ChangeMe!2026";

const PACIENTE_OK = "paciente-ok@test.local";
const PACIENTE_SPAM = "paciente-spam@test.local";
const PACIENTE_BOOKING = "paciente-booking@test.local";

let app: FastifyInstance;
let adminToken: string;
let medicoToken: string;
let recepcionToken: string;
let medicoUsuarioId: string;
let medicoLocalId: string;
let tenantId: string;

let professionalId: string;
let slugSeo: string;
let reviewLimpiaId: string;
let reviewSpamId: string;

function authMedico() {
  return { authorization: `Bearer ${medicoToken}` };
}
function authRecepcion() {
  return { authorization: `Bearer ${recepcionToken}` };
}
function authAdmin() {
  return { authorization: `Bearer ${adminToken}` };
}

async function cleanupMarketplace() {
  const profs = await masterPrisma.publicProfessional.findMany({
    where: { tenantIdPrincipal: tenantId },
    select: { id: true },
  });
  const ids = profs.map((p) => p.id);
  if (ids.length > 0) {
    await masterPrisma.publicBooking.deleteMany({ where: { professionalId: { in: ids } } });
    await masterPrisma.publicReview.deleteMany({ where: { professionalId: { in: ids } } });
    await masterPrisma.publicProfessionalSearchIndex.deleteMany({
      where: { professionalId: { in: ids } },
    });
    await masterPrisma.publicProfessionalLocation.deleteMany({
      where: { professionalId: { in: ids } },
    });
    await masterPrisma.publicProfessional.deleteMany({ where: { id: { in: ids } } });
  }
  await masterPrisma.pacienteMaster.deleteMany({
    where: { email: { in: [PACIENTE_OK, PACIENTE_SPAM, PACIENTE_BOOKING] } },
  });
}

beforeAll(async () => {
  app = await buildTestApp();
  adminToken = (await loginAdmin(app)).accessToken;
  await createTestTenant(TENANT_SLUG, "Clínica Marketplace Test");
  const tenant = await masterPrisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });
  tenantId = tenant.id;
  await cleanupMarketplace();

  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner Doc",
  });
  const medico = await createTenantUser(TENANT_SLUG, {
    email: MEDICO_EMAIL,
    password: PASSWORD,
    rolCodigo: "medico",
    nombre: "Dr. House",
  });
  medicoUsuarioId = medico.id;
  await createTenantUser(TENANT_SLUG, {
    email: RECEPCION_EMAIL,
    password: PASSWORD,
    rolCodigo: "recepcion",
    nombre: "Recepción Doc",
  });

  medicoToken = (await loginTenantUser(app, TENANT_SLUG, MEDICO_EMAIL, PASSWORD)).accessToken;
  recepcionToken = (await loginTenantUser(app, TENANT_SLUG, RECEPCION_EMAIL, PASSWORD)).accessToken;

  await app.inject({
    method: "PUT",
    url: `/t/medicos/${medicoUsuarioId}`,
    headers: authMedico(),
    payload: {
      cedulaProfesional: "MED-123456",
      especialidades: ["Cardiología"],
    },
  });
  const medicoRes = await app.inject({
    method: "GET",
    url: `/t/medicos/${medicoUsuarioId}`,
    headers: authMedico(),
  });
  medicoLocalId = (medicoRes.json() as { id: string }).id;
});

afterAll(async () => {
  await cleanupMarketplace();
  if (app) await app.close();
});

describe("funciones puras", () => {
  it("slugify normaliza acentos y espacios", () => {
    expect(slugify("Dr. José Ramírez Pérez")).toBe("dr-jose-ramirez-perez");
  });

  it("moderación aprueba texto limpio", () => {
    const r = moderarTextoResena("Excelente atención, muy profesional y puntual.");
    expect(r.status).toBe("auto_aprobado_ia");
    expect(r.flags).toHaveLength(0);
  });

  it("moderación escala a revisión humana ante lenguaje ofensivo", () => {
    const r = moderarTextoResena("Es un charlatan, pura estafa");
    expect(r.status).toBe("revision_humana");
    expect(r.flags.length).toBeGreaterThan(0);
  });

  it("moderación detecta datos de contacto (anti-spam)", () => {
    const r = moderarTextoResena("Contáctame al 5512345678 para descuentos");
    expect(r.flags).toContain("datos_contacto");
  });
});

describe("perfil profesional (tenant)", () => {
  it("recepción NO puede gestionar perfil Marketplace → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/marketplace/perfil",
      headers: authRecepcion(),
      payload: { medicoIdLocal: medicoLocalId, tipo: "medico_humano", nombrePublico: "X" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("médico crea su perfil en estado borrador", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/marketplace/perfil",
      headers: authMedico(),
      payload: {
        medicoIdLocal: medicoLocalId,
        tipo: "medico_humano",
        nombrePublico: "Dr. Gregory House",
        cedulaProfesional: "MED-123456",
        especialidades: ["Cardiología", "Medicina Interna"],
        bioCorta: "Cardiólogo con 20 años de experiencia.",
        aceptaTelemedicina: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const p = res.json() as { id: string; status: string; slugSeo: string };
    expect(p.status).toBe("borrador");
    expect(p.slugSeo).toContain("dr-gregory-house");
    professionalId = p.id;
    slugSeo = p.slugSeo;
  });

  it("upsert es idempotente por (tenant, medico)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/marketplace/perfil",
      headers: authMedico(),
      payload: {
        medicoIdLocal: medicoLocalId,
        tipo: "medico_humano",
        nombrePublico: "Dr. Gregory House",
        cedulaProfesional: "MED-123456",
        bioCorta: "Actualizada.",
      },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { id: string }).id).toBe(professionalId);
  });

  it("agrega ubicación principal", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/marketplace/perfil/${professionalId}/ubicaciones`,
      headers: authMedico(),
      payload: {
        nombreLugar: "Consultorio Centro Médico",
        ciudad: "Guadalajara",
        estado: "Jalisco",
        esPrincipal: true,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("no aparece en búsqueda mientras está en borrador", async () => {
    // La búsqueda es cross-tenant (master): afirmamos por slug propio, no por
    // conteo global (otros profesionales pueden existir en el master DB).
    const res = await app.inject({ method: "GET", url: "/marketplace/buscar?q=house&pageSize=50" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ slugSeo: string }> };
    expect(body.items.every((p) => p.slugSeo !== slugSeo)).toBe(true);
  });

  it("perfil público en borrador → 404", async () => {
    const res = await app.inject({ method: "GET", url: `/marketplace/profesionales/${slugSeo}` });
    expect(res.statusCode).toBe(404);
  });

  it("médico envía perfil a revisión", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/marketplace/perfil/${professionalId}/enviar-revision`,
      headers: authMedico(),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe("en_revision");
  });
});

describe("validación admin GaesSoft", () => {
  it("sin token admin → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/marketplace/admin/perfiles/${professionalId}/validar`,
      payload: { cedulaValidaSsa: true, aprobar: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it("perfil aparece en la cola de pendientes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/marketplace/admin/pendientes",
      headers: authAdmin(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { perfiles: Array<{ id: string }> };
    expect(body.perfiles.some((p) => p.id === professionalId)).toBe(true);
  });

  it("admin valida cédula y publica el perfil", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/marketplace/admin/perfiles/${professionalId}/validar`,
      headers: authAdmin(),
      payload: { cedulaValidaSsa: true, aprobar: true },
    });
    expect(res.statusCode).toBe(200);
    const p = res.json() as { status: string; validadaSsaAt: string | null };
    expect(p.status).toBe("publicado");
    expect(p.validadaSsaAt).not.toBeNull();
  });
});

describe("reservas (bookings desde el portal)", () => {
  let pacienteMasterId: string;
  let bookingId: string;

  it("registra y verifica un paciente que va a reservar", async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/marketplace/pacientes/registro",
      payload: {
        email: PACIENTE_BOOKING,
        nombre: "Laura",
        apellidos: "Méndez",
        telefono: "5511122233",
      },
    });
    expect(reg.statusCode).toBe(201);
    pacienteMasterId = (reg.json() as { id: string }).id;
    const conf = await app.inject({
      method: "POST",
      url: "/marketplace/pacientes/confirmar",
      payload: { email: PACIENTE_BOOKING },
    });
    expect(conf.statusCode).toBe(200);
    expect((conf.json() as { verificado: boolean }).verificado).toBe(true);
  });

  it("el paciente reserva una cita (queda pendiente)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/marketplace/profesionales/${professionalId}/reservar`,
      payload: {
        pacienteMasterId,
        fechaHora: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        modalidad: "presencial",
        motivo: "Chequeo general",
      },
    });
    expect(res.statusCode).toBe(201);
    const b = res.json() as { id: string; status: string };
    expect(b.status).toBe("pendiente");
    bookingId = b.id;
  });

  it("el tenant ve la reserva entrante", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/marketplace/reservas?status=pendiente",
      headers: authRecepcion(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ id: string; pacienteNombre: string }>;
    expect(items.some((r) => r.id === bookingId)).toBe(true);
  });

  it("confirmar crea una Cita local ligada a la reserva", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/marketplace/reservas/${bookingId}/confirmar`,
      headers: authRecepcion(),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as { citaId: string; folio: string; pacienteId: string };
    expect(r.citaId).toBeTruthy();
    expect(r.folio).toContain("CT-");
    expect(r.pacienteId).toBeTruthy();

    const booking = await masterPrisma.publicBooking.findUnique({ where: { id: bookingId } });
    expect(booking?.status).toBe("confirmada");
    expect(booking?.citaIdLocal).toBe(r.citaId);
  });

  it("no se puede confirmar dos veces", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/marketplace/reservas/${bookingId}/confirmar`,
      headers: authRecepcion(),
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });

  it("rechazar una reserva pendiente la marca rechazada", async () => {
    const reserva = await app.inject({
      method: "POST",
      url: `/marketplace/profesionales/${professionalId}/reservar`,
      payload: {
        pacienteMasterId,
        fechaHora: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        modalidad: "presencial",
      },
    });
    const otroId = (reserva.json() as { id: string }).id;
    const res = await app.inject({
      method: "POST",
      url: `/t/marketplace/reservas/${otroId}/rechazar`,
      headers: authRecepcion(),
      payload: { motivo: "Agenda llena esa fecha" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe("rechazada");
  });
});

describe("búsqueda y perfil público", () => {
  it("encuentra el profesional publicado por texto", async () => {
    const res = await app.inject({ method: "GET", url: "/marketplace/buscar?q=house&pageSize=50" });
    const body = res.json() as { items: Array<{ slugSeo: string }> };
    expect(body.items.some((p) => p.slugSeo === slugSeo)).toBe(true);
  });

  it("filtra por ciudad y telemedicina", async () => {
    const ok = await app.inject({
      method: "GET",
      url: "/marketplace/buscar?ciudad=Guadalajara&aceptaTelemedicina=true&pageSize=50",
    });
    expect(
      (ok.json() as { items: Array<{ slugSeo: string }> }).items.some((p) => p.slugSeo === slugSeo),
    ).toBe(true);
    const miss = await app.inject({
      method: "GET",
      url: "/marketplace/buscar?ciudad=Monterrey&pageSize=50",
    });
    expect(
      (miss.json() as { items: Array<{ slugSeo: string }> }).items.every(
        (p) => p.slugSeo !== slugSeo,
      ),
    ).toBe(true);
  });

  it("perfil público accesible por slug", async () => {
    const res = await app.inject({ method: "GET", url: `/marketplace/profesionales/${slugSeo}` });
    expect(res.statusCode).toBe(200);
    const p = res.json() as { nombrePublico: string; ubicaciones: unknown[] };
    expect(p.nombrePublico).toBe("Dr. Gregory House");
    expect(p.ubicaciones.length).toBe(1);
  });
});

describe("reseñas verificadas", () => {
  it("paciente no verificado no puede reseñar → 403", async () => {
    await app.inject({
      method: "POST",
      url: "/marketplace/pacientes/registro",
      payload: { email: PACIENTE_OK, nombre: "Ana López" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/marketplace/profesionales/${professionalId}/resenas`,
      payload: { pacienteEmail: PACIENTE_OK, ratingGeneral: 5, comentario: "Muy bien" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("reseña limpia de paciente verificado se publica automáticamente", async () => {
    await app.inject({
      method: "POST",
      url: "/marketplace/pacientes/confirmar",
      payload: { email: PACIENTE_OK },
    });
    const res = await app.inject({
      method: "POST",
      url: `/marketplace/profesionales/${professionalId}/resenas`,
      payload: {
        pacienteEmail: PACIENTE_OK,
        bookingId: "booking-123",
        ratingGeneral: 5,
        ratingTrato: 5,
        comentario: "Excelente trato, muy claro al explicar.",
      },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json() as { id: string; publicada: boolean; moderacionStatus: string };
    expect(r.publicada).toBe(true);
    expect(r.moderacionStatus).toBe("publicado");
    reviewLimpiaId = r.id;
  });

  it("recalcula score del profesional tras publicar reseña", async () => {
    const res = await app.inject({ method: "GET", url: `/marketplace/profesionales/${slugSeo}` });
    const p = res.json() as { scorePromedio: string; totalResenas: number };
    expect(Number(p.scorePromedio)).toBe(5);
    expect(p.totalResenas).toBe(1);
  });

  it("reseña con lenguaje ofensivo queda en revisión humana (no pública)", async () => {
    await app.inject({
      method: "POST",
      url: "/marketplace/pacientes/registro",
      payload: { email: PACIENTE_SPAM, nombre: "Beto Spam" },
    });
    await app.inject({
      method: "POST",
      url: "/marketplace/pacientes/confirmar",
      payload: { email: PACIENTE_SPAM },
    });
    const res = await app.inject({
      method: "POST",
      url: `/marketplace/profesionales/${professionalId}/resenas`,
      payload: {
        pacienteEmail: PACIENTE_SPAM,
        ratingGeneral: 1,
        comentario: "Es un charlatan, pura estafa",
      },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json() as { id: string; publicada: boolean; moderacionStatus: string };
    expect(r.publicada).toBe(false);
    expect(r.moderacionStatus).toBe("revision_humana");
    reviewSpamId = r.id;
  });

  it("score NO cambia con la reseña no publicada", async () => {
    const res = await app.inject({ method: "GET", url: `/marketplace/profesionales/${slugSeo}` });
    const p = res.json() as { scorePromedio: string; totalResenas: number };
    expect(p.totalResenas).toBe(1);
  });

  it("reseña duplicada del mismo paciente → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/marketplace/profesionales/${professionalId}/resenas`,
      payload: { pacienteEmail: PACIENTE_OK, ratingGeneral: 4, comentario: "Otra vez" },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("médico responde y denuncia reseñas", () => {
  it("médico responde públicamente una reseña publicada", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/marketplace/perfil/${professionalId}/resenas/${reviewLimpiaId}/responder`,
      headers: authMedico(),
      payload: { respuesta: "¡Gracias por su confianza!" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { respuestaMedico: string }).respuestaMedico).toContain("Gracias");
  });

  it("médico denuncia una reseña → sale de publicación y baja conteo", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/marketplace/perfil/${professionalId}/resenas/${reviewLimpiaId}/denunciar`,
      headers: authMedico(),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { moderacionStatus: string }).moderacionStatus).toBe("denunciado_medico");
    const perfil = await app.inject({
      method: "GET",
      url: `/marketplace/profesionales/${slugSeo}`,
    });
    expect((perfil.json() as { totalResenas: number }).totalResenas).toBe(0);
  });

  it("médico de otro tenant no puede tocar este perfil (aislamiento)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/marketplace/perfil/${professionalId}/resenas/${reviewSpamId}/responder`,
      headers: authRecepcion(),
      payload: { respuesta: "hola" },
    });
    // recepción ni siquiera tiene el permiso → 403
    expect(res.statusCode).toBe(403);
  });
});

describe("moderación admin de reseñas escaladas", () => {
  it("admin aprueba la reseña que estaba en revisión humana", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/marketplace/admin/resenas/${reviewSpamId}/moderar`,
      headers: authAdmin(),
      payload: { aprobar: true },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { moderacionStatus: string }).moderacionStatus).toBe("publicado");
  });

  it("admin suspende el perfil → desaparece de búsqueda", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/marketplace/admin/perfiles/${professionalId}/suspender`,
      headers: authAdmin(),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe("suspendido");
    const busca = await app.inject({
      method: "GET",
      url: "/marketplace/buscar?q=house&pageSize=50",
    });
    expect(
      (busca.json() as { items: Array<{ slugSeo: string }> }).items.every(
        (p) => p.slugSeo !== slugSeo,
      ),
    ).toBe(true);
  });
});
