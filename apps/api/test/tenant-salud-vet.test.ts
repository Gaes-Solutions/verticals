import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-vet-1";
const OWNER_EMAIL = "owner-vet@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const MEDICO_EMAIL = "vet@test.local";
const MEDICO_PASSWORD = "ChangeMe!2026";
const RECEPCION_EMAIL = "recvet@test.local";
const RECEPCION_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let medicoToken: string;
let recepcionToken: string;
let medicoUsuarioId: string;
let sucursalId: string;
let tutorClienteId: string;
let mascotaPerroId: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authMedico() {
  return { authorization: `Bearer ${medicoToken}` };
}
function authRecepcion() {
  return { authorization: `Bearer ${recepcionToken}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Veterinaria Test");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner Vet",
  });
  const medico = await createTenantUser(TENANT_SLUG, {
    email: MEDICO_EMAIL,
    password: MEDICO_PASSWORD,
    rolCodigo: "medico",
    nombre: "Dra. Vet",
  });
  medicoUsuarioId = medico.id;
  await createTenantUser(TENANT_SLUG, {
    email: RECEPCION_EMAIL,
    password: RECEPCION_PASSWORD,
    rolCodigo: "recepcion",
    nombre: "Recepción Vet",
  });

  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  medicoToken = (await loginTenantUser(app, TENANT_SLUG, MEDICO_EMAIL, MEDICO_PASSWORD))
    .accessToken;
  recepcionToken = (await loginTenantUser(app, TENANT_SLUG, RECEPCION_EMAIL, RECEPCION_PASSWORD))
    .accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: authOwner() });
  sucursalId = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  )!.id;

  // Tutor (cliente B2C)
  const tutor = await app.inject({
    method: "POST",
    url: "/t/clientes",
    headers: authOwner(),
    payload: {
      nombre: "Laura",
      apellidos: "Martínez",
      telefonoPrincipal: "3344445555",
      emailPrincipal: "laura@test.local",
    },
  });
  tutorClienteId = tutor.json().id;

  await app.inject({
    method: "PUT",
    url: `/t/medicos/${medicoUsuarioId}`,
    headers: authMedico(),
    payload: {
      cedulaProfesional: "VET-987654",
      especialidades: ["Medicina Pequeñas Especies"],
      firmaElectronicaUrl: "https://placeholder.local/firmas/vet.png",
    },
  });
});

afterAll(async () => {
  if (app) await app.close();
});

describe("catálogos vet sembrados", () => {
  it("CIE-10 vet incluye dx específicos veterinarios", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/consultas/diagnosticos/catalogo",
      headers: authMedico(),
    });
    const items = res.json() as Array<{ codigoCie10: string; aplicaVet: boolean }>;
    expect(items.some((d) => d.codigoCie10 === "V-007")).toBe(true);
    expect(items.find((d) => d.codigoCie10 === "V-007")?.aplicaVet).toBe(true);
  });

  it("medicamentos vet incluye Bravecto y Drontal Plus", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/recetas/medicamentos/catalogo",
      headers: authMedico(),
    });
    const items = res.json() as Array<{ nombreComercial: string; clasificacionCofepris: string }>;
    expect(items.find((m) => m.nombreComercial === "Bravecto")?.clasificacionCofepris).toBe("vet");
    expect(items.find((m) => m.nombreComercial === "Drontal Plus")?.clasificacionCofepris).toBe(
      "vet",
    );
  });

  it("catálogo vacunas incluye Triple felina y Antirrábica canina", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/vacunaciones/catalogo",
      headers: authMedico(),
    });
    const items = res.json() as Array<{ nombreComercial: string; aplicaVet: boolean }>;
    expect(items.find((v) => v.nombreComercial === "Antirrábica canina")?.aplicaVet).toBe(true);
    expect(items.find((v) => v.nombreComercial === "Triple felina (FVRCP)")?.aplicaVet).toBe(true);
  });
});

describe("CRUD mascotas", () => {
  it("recepción crea mascota con tutor cliente y datos básicos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/mascotas",
      headers: authRecepcion(),
      payload: {
        nombre: "Firulais",
        especie: "perro",
        raza: "Labrador",
        sexo: "macho",
        fechaNacimiento: "2020-04-10T00:00:00.000Z",
        color: "Dorado",
        microchip: "991001000001234",
        pesoActualKg: "28.5",
        tutorClienteId,
        medicoAsignadoId: medicoUsuarioId,
        alergias: ["amoxicilina"],
      },
    });
    expect(res.statusCode).toBe(201);
    const m = res.json() as { id: string; numeroExpediente: string };
    expect(m.numeroExpediente).toMatch(/^MAS-\d{6}$/);
    mascotaPerroId = m.id;
  });

  it("búsqueda por microchip encuentra mascota", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/mascotas?q=991001000001234",
      headers: authMedico(),
    });
    expect(res.json().total).toBeGreaterThanOrEqual(1);
  });

  it("filtro por especie perro", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/mascotas?especie=perro",
      headers: authMedico(),
    });
    const items = (res.json() as { items: Array<{ especie: string }> }).items;
    expect(items.every((m) => m.especie === "perro")).toBe(true);
  });

  it("PATCH actualiza peso actual", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/mascotas/${mascotaPerroId}`,
      headers: authMedico(),
      payload: { pesoActualKg: "29.2" },
    });
    expect(res.statusCode).toBe(200);
    expect(Number((res.json() as { pesoActualKg: string }).pesoActualKg)).toBeCloseTo(29.2, 2);
  });
});

describe("flujo full vet: cita → consulta SOAP firmada → receta vet + vacuna con cartilla", () => {
  let citaId: string;
  let consultaId: string;

  it("cita para mascota (sin pacienteId) crea folio CT-*", async () => {
    const motivos = await app.inject({
      method: "GET",
      url: "/t/citas/motivos/catalogo",
      headers: authRecepcion(),
    });
    const motivo = (motivos.json() as Array<{ id: string; nombre: string; vertical: string }>).find(
      (m) => m.nombre === "Vacunación",
    );

    const fechaFutura = new Date(Date.now() + 3600_000).toISOString();
    const res = await app.inject({
      method: "POST",
      url: "/t/citas",
      headers: authRecepcion(),
      payload: {
        mascotaId: mascotaPerroId,
        medicoUsuarioId,
        sucursalId,
        motivoCitaId: motivo?.id,
        fechaProgramada: fechaFutura,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().estado).toBe("programada");
    citaId = res.json().id;
  });

  it("cita XOR: error 400 si se manda pacienteId y mascotaId juntos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/citas",
      headers: authRecepcion(),
      payload: {
        pacienteId: "fake-1",
        mascotaId: mascotaPerroId,
        medicoUsuarioId,
        sucursalId,
        fechaProgramada: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cita XOR: error 400 sin ningún sujeto", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/citas",
      headers: authRecepcion(),
      payload: {
        medicoUsuarioId,
        sucursalId,
        fechaProgramada: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("médico inicia consulta tras checkin", async () => {
    await app.inject({
      method: "POST",
      url: `/t/citas/${citaId}/checkin`,
      headers: authRecepcion(),
      payload: { pesoCheckinKg: "29.5", temperaturaCheckinC: "38.7" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/citas/${citaId}/iniciar-consulta`,
      headers: authMedico(),
    });
    expect(res.statusCode).toBe(200);
  });

  it("consulta SOAP vet con dx parvovirosis canina + firma", async () => {
    const dx = await app.inject({
      method: "GET",
      url: "/t/consultas/diagnosticos/catalogo",
      headers: authMedico(),
    });
    const parvo = (dx.json() as Array<{ id: string; codigoCie10: string }>).find(
      (d) => d.codigoCie10 === "V-007",
    );

    const crearRes = await app.inject({
      method: "POST",
      url: "/t/consultas",
      headers: authMedico(),
      payload: {
        citaId,
        mascotaId: mascotaPerroId,
        medicoUsuarioId,
        sucursalId,
        tipo: "primera_vez",
        motivoConsulta: "Decaimiento y vómito",
        sintomas: ["vomito", "decaimiento", "anorexia"],
        tiempoEvolucion: "24 horas",
        signosVitales: {
          pesoKg: 29.5,
          temperaturaC: 39.2,
          frecuenciaCardiaca: 120,
        },
        diagnosticoPrincipalId: parvo?.id,
        pronostico: "reservado",
        planTratamiento: "Hospitalización 48h, fluidoterapia, antiemético",
        resumenParaTutor: "Tu mascota tiene parvovirosis. Quedará en observación 48 horas.",
      },
    });
    expect(crearRes.statusCode).toBe(201);
    consultaId = crearRes.json().id;

    const firma = await app.inject({
      method: "POST",
      url: `/t/consultas/${consultaId}/firmar`,
      headers: authMedico(),
      payload: { firmaElectronicaUrl: "https://placeholder.local/firmas/vet.png" },
    });
    expect(firma.statusCode).toBe(200);
    expect(firma.json().estado).toBe("firmada");
  });

  it("consulta XOR: 400 si manda paciente y mascota juntos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/consultas",
      headers: authMedico(),
      payload: {
        pacienteId: "fake",
        mascotaId: mascotaPerroId,
        medicoUsuarioId,
        sucursalId,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("receta vet con Meloxicam para mascota", async () => {
    const meds = await app.inject({
      method: "GET",
      url: "/t/recetas/medicamentos/catalogo",
      headers: authMedico(),
    });
    const meloxicam = (meds.json() as Array<{ id: string; nombreComercial: string }>).find(
      (m) => m.nombreComercial === "Meloxicam Vet",
    );
    const res = await app.inject({
      method: "POST",
      url: "/t/recetas",
      headers: authMedico(),
      payload: {
        sucursalId,
        consultaId,
        mascotaId: mascotaPerroId,
        medicoUsuarioId,
        items: [
          {
            medicamentoCatalogoId: meloxicam!.id,
            nombreSnapshot: "Meloxicam 0.5 mg/mL",
            concentracionSnapshot: "0.5 mg/mL",
            dosisUnidad: "mL",
            dosisCantidad: "5.9",
            dosisVia: "oral",
            frecuenciaHoras: "24",
            duracionDias: 3,
            instruccionesAdministracion: "Dosis: 0.2 mg/kg día 1, luego 0.1 mg/kg",
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json() as { folio: string; qrValidacionToken: string };
    expect(r.folio).toMatch(/^RX-SUC-PRINCIPAL-\d{6}$/);

    const validar = await app.inject({
      method: "GET",
      url: `/t/recetas/validar/${r.qrValidacionToken}`,
      headers: authMedico(),
    });
    expect(validar.statusCode).toBe(200);
    expect((validar.json() as { mascota: string }).mascota).toMatch(/Firulais.*perro/);
    expect((validar.json() as { paciente: string | null }).paciente).toBeNull();
  });

  it("aplica vacuna Antirrábica con lote/caducidad y calcula próxima dosis +365d", async () => {
    const vacs = await app.inject({
      method: "GET",
      url: "/t/vacunaciones/catalogo",
      headers: authMedico(),
    });
    const antirrabica = (vacs.json() as Array<{ id: string; nombreComercial: string }>).find(
      (v) => v.nombreComercial === "Antirrábica canina",
    );

    const fechaAplic = new Date();
    const caducidad = new Date(Date.now() + 365 * 86400_000).toISOString();
    const res = await app.inject({
      method: "POST",
      url: "/t/vacunaciones",
      headers: authMedico(),
      payload: {
        mascotaId: mascotaPerroId,
        vacunaCatalogoId: antirrabica!.id,
        fechaAplicacion: fechaAplic.toISOString(),
        numeroLote: "LOTE-AR-2026-A1",
        caducidadLote: caducidad,
        marcaSnapshot: "Pfizer Animal Health",
        viaAdministracion: "subcutanea",
        dosisAplicada: "1 mL",
      },
    });
    expect(res.statusCode).toBe(201);
    const v = res.json() as { proximaAplicacionFecha: string; numeroLote: string };
    expect(v.numeroLote).toBe("LOTE-AR-2026-A1");
    const proxima = new Date(v.proximaAplicacionFecha);
    const diasDiff = Math.round((proxima.getTime() - fechaAplic.getTime()) / 86400_000);
    expect(diasDiff).toBe(365);
  });

  it("vacunación XOR: rechaza si manda paciente y mascota juntos (400)", async () => {
    const vacs = await app.inject({
      method: "GET",
      url: "/t/vacunaciones/catalogo",
      headers: authMedico(),
    });
    const antirrabica = (vacs.json() as Array<{ id: string }>)[0]!;
    const res = await app.inject({
      method: "POST",
      url: "/t/vacunaciones",
      headers: authMedico(),
      payload: {
        pacienteId: "fake",
        mascotaId: mascotaPerroId,
        vacunaCatalogoId: antirrabica.id,
        numeroLote: "X",
        caducidadLote: new Date(Date.now() + 86400_000).toISOString(),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cartilla muestra vacunación aplicada + próxima dosis", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/vacunaciones/cartilla?mascotaId=${mascotaPerroId}`,
      headers: authMedico(),
    });
    expect(res.statusCode).toBe(200);
    const c = res.json() as {
      sujeto: { tipo: string; nombre: string };
      vacunacionesAplicadas: Array<{ vacunaNombre: string; estado: string }>;
      proximasDosis: Array<{ vacunaNombre: string; diasFaltantes: number }>;
    };
    expect(c.sujeto.tipo).toBe("mascota");
    expect(c.sujeto.nombre).toBe("Firulais");
    expect(c.vacunacionesAplicadas.length).toBeGreaterThanOrEqual(1);
    expect(c.vacunacionesAplicadas.some((v) => v.vacunaNombre === "Antirrábica canina")).toBe(true);
    expect(c.proximasDosis.length).toBeGreaterThanOrEqual(1);
    expect(c.proximasDosis[0]?.diasFaltantes).toBeGreaterThan(300);
  });
});

describe("vet permisos", () => {
  it("recepción puede aplicar vacuna (tiene VACUNAS_APLICAR)", async () => {
    const vacs = await app.inject({
      method: "GET",
      url: "/t/vacunaciones/catalogo",
      headers: authRecepcion(),
    });
    const triple = (vacs.json() as Array<{ id: string; nombreComercial: string }>).find(
      (v) => v.nombreComercial === "Vanguard Plus 5/CV-L",
    );
    const res = await app.inject({
      method: "POST",
      url: "/t/vacunaciones",
      headers: authRecepcion(),
      payload: {
        mascotaId: mascotaPerroId,
        vacunaCatalogoId: triple!.id,
        numeroLote: "LOTE-VAN-001",
        caducidadLote: new Date(Date.now() + 365 * 86400_000).toISOString(),
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("recepción NO puede eliminar registro cartilla (sin VACUNAS_GESTIONAR_CARTILLA, 403)", async () => {
    const list = await app.inject({
      method: "GET",
      url: `/t/vacunaciones?mascotaId=${mascotaPerroId}`,
      headers: authRecepcion(),
    });
    const v = (list.json() as { items: Array<{ id: string }> }).items[0]!;
    const res = await app.inject({
      method: "DELETE",
      url: `/t/vacunaciones/${v.id}`,
      headers: authRecepcion(),
    });
    expect(res.statusCode).toBe(403);
  });
});
