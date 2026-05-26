import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-salud-1";
const OWNER_EMAIL = "owner-salud@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const MEDICO_EMAIL = "medico@test.local";
const MEDICO_PASSWORD = "ChangeMe!2026";
const ENFERMERA_EMAIL = "enfermera@test.local";
const ENFERMERA_PASSWORD = "ChangeMe!2026";
const RECEPCION_EMAIL = "recepcion@test.local";
const RECEPCION_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let medicoToken: string;
let enfermeraToken: string;
let recepcionToken: string;
let medicoUsuarioId: string;
let sucursalId: string;
let pacienteId: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authMedico() {
  return { authorization: `Bearer ${medicoToken}` };
}
function authEnfermera() {
  return { authorization: `Bearer ${enfermeraToken}` };
}
function authRecepcion() {
  return { authorization: `Bearer ${recepcionToken}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Consultorio Salud");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner",
  });
  const medico = await createTenantUser(TENANT_SLUG, {
    email: MEDICO_EMAIL,
    password: MEDICO_PASSWORD,
    rolCodigo: "medico",
    nombre: "Dr. Pérez",
  });
  medicoUsuarioId = medico.id;
  await createTenantUser(TENANT_SLUG, {
    email: ENFERMERA_EMAIL,
    password: ENFERMERA_PASSWORD,
    rolCodigo: "enfermera",
    nombre: "Enfermera",
  });
  await createTenantUser(TENANT_SLUG, {
    email: RECEPCION_EMAIL,
    password: RECEPCION_PASSWORD,
    rolCodigo: "recepcion",
    nombre: "Recepcion",
  });

  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  medicoToken = (await loginTenantUser(app, TENANT_SLUG, MEDICO_EMAIL, MEDICO_PASSWORD))
    .accessToken;
  enfermeraToken = (await loginTenantUser(app, TENANT_SLUG, ENFERMERA_EMAIL, ENFERMERA_PASSWORD))
    .accessToken;
  recepcionToken = (await loginTenantUser(app, TENANT_SLUG, RECEPCION_EMAIL, RECEPCION_PASSWORD))
    .accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: authOwner() });
  sucursalId = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  )!.id;

  // Médico configura su perfil clínico
  await app.inject({
    method: "PUT",
    url: `/t/medicos/${medicoUsuarioId}`,
    headers: authMedico(),
    payload: {
      cedulaProfesional: "12345678",
      especialidades: ["Medicina General"],
      anosExperiencia: 10,
      precioConsultaPrimera: "800",
      precioConsultaSeguimiento: "500",
      firmaElectronicaUrl: "https://placeholder.local/firmas/medico-perez.png",
    },
  });
});

afterAll(async () => {
  if (app) await app.close();
});

describe("seed: catálogos clínicos sembrados", () => {
  it("seed CIE-10 incluye al menos 25 diagnósticos humanos precargados", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/consultas/diagnosticos/catalogo",
      headers: authMedico(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ codigoCie10: string; aplicaHumano: boolean }>;
    expect(items.length).toBeGreaterThanOrEqual(25);
    expect(items.find((d) => d.codigoCie10 === "J00")?.codigoCie10).toBe("J00");
  });

  it("seed PLM incluye Paracetamol/Tempra OTC y Amoxicilina G_IV", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/recetas/medicamentos/catalogo",
      headers: authMedico(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ nombreComercial: string; clasificacionCofepris: string }>;
    expect(items.length).toBeGreaterThanOrEqual(20);
    expect(items.find((m) => m.nombreComercial === "Tempra")?.clasificacionCofepris).toBe("OTC");
    expect(items.find((m) => m.nombreComercial === "Amoxil")?.clasificacionCofepris).toBe("G_IV");
  });

  it("seed motivos de cita incluye 'Consulta general' vertical humana", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/citas/motivos/catalogo",
      headers: authMedico(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ nombre: string; vertical: string }>;
    expect(
      items.find((m) => m.nombre === "Consulta general" && m.vertical === "humana"),
    ).toBeDefined();
  });
});

describe("pacientes CRUD", () => {
  it("recepción crea paciente con datos básicos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/pacientes",
      headers: authRecepcion(),
      payload: {
        nombre: "María",
        apellidoPaterno: "Hernández",
        apellidoMaterno: "López",
        fechaNacimiento: "1990-05-15T00:00:00.000Z",
        sexo: "femenino",
        telefonoPrincipal: "3311112222",
        emailPrincipal: "maria@test.local",
        tipoSangre: "O+",
        alergias: ["penicilina", "sulfas"],
        medicoAsignadoId: medicoUsuarioId,
      },
    });
    expect(res.statusCode).toBe(201);
    const p = res.json() as { id: string; numeroExpediente: string };
    expect(p.numeroExpediente).toMatch(/^EXP-\d{6}$/);
    pacienteId = p.id;
  });

  it("búsqueda por nombre encuentra paciente", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/pacientes?q=Hernández",
      headers: authMedico(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(1);
  });

  it("búsqueda por número de expediente lo encuentra", async () => {
    const det = await app.inject({
      method: "GET",
      url: `/t/pacientes/${pacienteId}`,
      headers: authMedico(),
    });
    const expediente = (det.json() as { numeroExpediente: string }).numeroExpediente;
    const res = await app.inject({
      method: "GET",
      url: `/t/pacientes?q=${expediente}`,
      headers: authMedico(),
    });
    expect(res.json().total).toBeGreaterThanOrEqual(1);
  });

  it("PATCH actualiza alergias del paciente", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/pacientes/${pacienteId}`,
      headers: authMedico(),
      payload: { alergias: ["penicilina", "sulfas", "ibuprofeno"] },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { alergias: string[] }).alergias).toContain("ibuprofeno");
  });
});

describe("flujo full: agenda → cita → consulta firmada → receta con QR", () => {
  let citaId: string;
  let consultaId: string;
  let recetaId: string;
  let qrToken: string;

  it("dueño crea horario de atención del médico (lunes 9-13)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/agenda",
      headers: authOwner(),
      payload: {
        medicoUsuarioId,
        sucursalId,
        diaSemana: 1,
        horaInicio: "09:00",
        horaFin: "13:00",
        duracionSlotMinutos: 30,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("recepción agenda cita futura para el paciente", async () => {
    const motivos = await app.inject({
      method: "GET",
      url: "/t/citas/motivos/catalogo",
      headers: authRecepcion(),
    });
    const motivo = (motivos.json() as Array<{ id: string; nombre: string }>).find(
      (m) => m.nombre === "Consulta general",
    );
    const fechaFutura = new Date(Date.now() + 3600_000).toISOString();
    const res = await app.inject({
      method: "POST",
      url: "/t/citas",
      headers: authRecepcion(),
      payload: {
        pacienteId,
        medicoUsuarioId,
        sucursalId,
        motivoCitaId: motivo!.id,
        fechaProgramada: fechaFutura,
        duracionEstimadaMinutos: 30,
      },
    });
    expect(res.statusCode).toBe(201);
    const c = res.json() as { id: string; folio: string; estado: string };
    expect(c.folio).toMatch(/^CT-SUC-PRINCIPAL-\d{6}$/);
    expect(c.estado).toBe("programada");
    citaId = c.id;
  });

  it("enfermera hace check-in con signos vitales recepción", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/citas/${citaId}/checkin`,
      headers: authEnfermera(),
      payload: {
        pesoCheckinKg: "65.5",
        temperaturaCheckinC: "36.8",
        notasRecepcion: "Paciente refiere malestar general 3 días",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("checkin");
  });

  it("médico marca inicio consulta", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/citas/${citaId}/iniciar-consulta`,
      headers: authMedico(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("en_consulta");
  });

  it("médico crea consulta SOAP borrador con diagnóstico CIE-10", async () => {
    const dxRes = await app.inject({
      method: "GET",
      url: "/t/consultas/diagnosticos/catalogo",
      headers: authMedico(),
    });
    const dxResfrio = (dxRes.json() as Array<{ id: string; codigoCie10: string }>).find(
      (d) => d.codigoCie10 === "J00",
    );

    const res = await app.inject({
      method: "POST",
      url: "/t/consultas",
      headers: authMedico(),
      payload: {
        citaId,
        pacienteId,
        medicoUsuarioId,
        sucursalId,
        tipo: "primera_vez",
        motivoConsulta: "Síntomas catarrales",
        sintomas: ["rinorrea", "tos seca", "fiebre baja"],
        tiempoEvolucion: "3 días",
        signosVitales: { temperaturaC: 37.5, frecuenciaCardiaca: 78, pesoKg: 65.5 },
        exploracionAparatos: {
          orl: "Cornetes congestivos, faringe hiperémica",
          torax: "Sin estertores",
        },
        diagnosticoPrincipalId: dxResfrio?.id,
        pronostico: "favorable",
        planTratamiento: "Reposo, hidratación, paracetamol 500mg c/6h por 3 días",
        siguienteControlDias: 7,
        resumenParaTutor: "Resfriado común. Tomar paracetamol y descansar 3 días.",
      },
    });
    expect(res.statusCode).toBe(201);
    const c = res.json() as { id: string; estado: string };
    expect(c.estado).toBe("borrador");
    consultaId = c.id;
  });

  it("médico edita consulta en borrador (agregar nota)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/consultas/${consultaId}`,
      headers: authMedico(),
      payload: { notasClinicasInternas: "Considerar broncodilatador si persiste tos" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("médico firma consulta → estado=firmada (inmutable NOM-024)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/consultas/${consultaId}/firmar`,
      headers: authMedico(),
      payload: { firmaElectronicaUrl: "https://placeholder.local/firmas/medico-perez.png" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("firmada");
    expect(res.json().firmadaAt).toBeTruthy();
  });

  it("intentar PATCH a consulta firmada → 409", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/consultas/${consultaId}`,
      headers: authMedico(),
      payload: { notasClinicasInternas: "modificación no permitida" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("médico emite receta con Paracetamol", async () => {
    const meds = await app.inject({
      method: "GET",
      url: "/t/recetas/medicamentos/catalogo",
      headers: authMedico(),
    });
    const tempra = (meds.json() as Array<{ id: string; nombreComercial: string }>).find(
      (m) => m.nombreComercial === "Tempra",
    );
    const res = await app.inject({
      method: "POST",
      url: "/t/recetas",
      headers: authMedico(),
      payload: {
        sucursalId,
        consultaId,
        pacienteId,
        medicoUsuarioId,
        vigenciaDias: 30,
        instruccionesGeneralesTutor: "Tomar con comida. Suspender si hay erupción cutánea.",
        items: [
          {
            medicamentoCatalogoId: tempra!.id,
            nombreSnapshot: "Tempra 500mg",
            concentracionSnapshot: "500 mg",
            presentacionSnapshot: "Tabletas",
            dosisUnidad: "tabletas",
            dosisCantidad: "1",
            dosisVia: "oral",
            frecuenciaHoras: "6",
            duracionDias: 3,
            totalUnidadesDispensar: "12",
            instruccionesAdministracion: "Cada 6 horas, alejado de las comidas",
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json() as { id: string; folio: string; qrValidacionToken: string };
    expect(r.folio).toMatch(/^RX-SUC-PRINCIPAL-\d{6}$/);
    expect(r.qrValidacionToken).toMatch(/^[a-f0-9]{48}$/);
    recetaId = r.id;
    qrToken = r.qrValidacionToken;
  });

  it("validación pública QR retorna datos completos receta vigente", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/recetas/validar/${qrToken}`,
      headers: authMedico(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      folio: string;
      vigente: boolean;
      paciente: string;
      medico: string;
      items: Array<{ medicamento: string; dosis: string }>;
    };
    expect(body.vigente).toBe(true);
    expect(body.paciente).toContain("María");
    expect(body.medico).toBe("Dr. Pérez");
    expect(body.items[0]?.medicamento).toBe("Tempra 500mg");
    expect(body.items[0]?.dosis).toBe("1 tabletas");
  });

  it("receta con G_II Postday requiere numeroRecetarioOficial — 409 sin él", async () => {
    const meds = await app.inject({
      method: "GET",
      url: "/t/recetas/medicamentos/catalogo",
      headers: authMedico(),
    });
    const postday = (meds.json() as Array<{ id: string; nombreComercial: string }>).find(
      (m) => m.nombreComercial === "Postday",
    );
    const res = await app.inject({
      method: "POST",
      url: "/t/recetas",
      headers: authMedico(),
      payload: {
        sucursalId,
        pacienteId,
        medicoUsuarioId,
        items: [
          {
            medicamentoCatalogoId: postday!.id,
            nombreSnapshot: "Postday",
            dosisUnidad: "tableta",
            dosisCantidad: "1",
            dosisVia: "oral",
            frecuenciaHoras: "0",
            duracionDias: 1,
            totalUnidadesDispensar: "1",
          },
        ],
      },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { message: string }).message).toMatch(/controlados/i);
  });

  it("receta con G_II Postday + numeroRecetarioOficial OK", async () => {
    const meds = await app.inject({
      method: "GET",
      url: "/t/recetas/medicamentos/catalogo",
      headers: authMedico(),
    });
    const postday = (meds.json() as Array<{ id: string; nombreComercial: string }>).find(
      (m) => m.nombreComercial === "Postday",
    );
    const res = await app.inject({
      method: "POST",
      url: "/t/recetas",
      headers: authMedico(),
      payload: {
        sucursalId,
        pacienteId,
        medicoUsuarioId,
        numeroRecetarioOficial: "COFEPRIS-2026-1234567",
        items: [
          {
            medicamentoCatalogoId: postday!.id,
            nombreSnapshot: "Postday",
            dosisUnidad: "tableta",
            dosisCantidad: "1",
            dosisVia: "oral",
            frecuenciaHoras: "0",
            duracionDias: 1,
            totalUnidadesDispensar: "1",
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { esGrupoControlado: boolean }).esGrupoControlado).toBe(true);
  });

  it("cancelar receta", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/recetas/${recetaId}/cancelar`,
      headers: authMedico(),
      payload: { motivo: "Cliente solicita cambio de medicamento" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("cancelada");
  });

  it("re-cancelar receta cancelada → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/recetas/${recetaId}/cancelar`,
      headers: authMedico(),
      payload: { motivo: "duplicado" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("médico enmienda consulta firmada → crea nueva consulta vinculada", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/consultas/${consultaId}/enmendar`,
      headers: authMedico(),
      payload: { motivo: "Corrección dosis paracetamol pediátrico" },
    });
    expect(res.statusCode).toBe(201);
    const nueva = res.json() as {
      id: string;
      estado: string;
      consultaOriginalId: string;
      enmiendaMotivo: string;
    };
    expect(nueva.estado).toBe("borrador");
    expect(nueva.consultaOriginalId).toBe(consultaId);
    expect(nueva.enmiendaMotivo).toMatch(/dosis/i);

    const original = await app.inject({
      method: "GET",
      url: `/t/consultas/${consultaId}`,
      headers: authMedico(),
    });
    expect(original.json().estado).toBe("enmendada");
  });
});

describe("permisos", () => {
  it("enfermera NO puede firmar consulta (sin CONSULTAS_FIRMAR, 403)", async () => {
    const c = await app.inject({
      method: "POST",
      url: "/t/consultas",
      headers: authMedico(),
      payload: {
        pacienteId,
        medicoUsuarioId,
        sucursalId,
        tipo: "seguimiento",
        motivoConsulta: "Permiso test",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/consultas/${c.json().id}/firmar`,
      headers: authEnfermera(),
    });
    expect(res.statusCode).toBe(403);
  });

  it("enfermera NO puede emitir receta (sin RECETAS_EMITIR, 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/recetas",
      headers: authEnfermera(),
      payload: {
        sucursalId,
        pacienteId,
        medicoUsuarioId,
        items: [
          {
            nombreSnapshot: "Test",
            dosisUnidad: "tab",
            dosisCantidad: "1",
            dosisVia: "oral",
            frecuenciaHoras: "8",
            duracionDias: 1,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("recepción NO puede crear consulta (sin CONSULTAS_CREAR, 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/consultas",
      headers: authRecepcion(),
      payload: {
        pacienteId,
        medicoUsuarioId,
        sucursalId,
        tipo: "seguimiento",
      },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("agenda + bloqueos", () => {
  it("dueño bloquea agenda médico por vacaciones", async () => {
    const inicio = new Date(Date.now() + 86400_000).toISOString();
    const fin = new Date(Date.now() + 86400_000 * 8).toISOString();
    const res = await app.inject({
      method: "POST",
      url: "/t/agenda/bloqueos",
      headers: authOwner(),
      payload: {
        medicoUsuarioId,
        fechaInicio: inicio,
        fechaFin: fin,
        tipo: "vacaciones",
        motivoPublico: "Vacaciones de fin de año",
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("rechaza bloqueo con fechas invertidas → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/agenda/bloqueos",
      headers: authOwner(),
      payload: {
        medicoUsuarioId,
        fechaInicio: "2030-06-10T00:00:00.000Z",
        fechaFin: "2030-06-05T00:00:00.000Z",
        tipo: "congreso",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
