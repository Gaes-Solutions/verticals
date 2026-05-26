import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  InMemoryAlarmChannel,
  escanearKardexParaAlarmar,
} from "../src/workers/medicacion-alarmas.js";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-hosp-1";
const OWNER = { email: "owner-hosp@test.local", password: "ChangeMe!2026" };
const MEDICO = { email: "medico-hosp@test.local", password: "ChangeMe!2026" };
const ENFERMERA = { email: "enf-hosp@test.local", password: "ChangeMe!2026" };
const RECEPCION = { email: "rec-hosp@test.local", password: "ChangeMe!2026" };

let app: FastifyInstance;
let ownerToken: string;
let medicoToken: string;
let enfermeraToken: string;
let recepcionToken: string;
let medicoUsuarioId: string;
let sucursalId: string;
let pacienteId: string;
let mascotaId: string;
let tutorClienteId: string;
let camaGeneralId: string;
let camaUciId: string;
let amoxicilinaId: string;

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Hospital Test");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER.email,
    password: OWNER.password,
    rolCodigo: "dueno",
    nombre: "Owner Hosp",
  });
  const medico = await createTenantUser(TENANT_SLUG, {
    email: MEDICO.email,
    password: MEDICO.password,
    rolCodigo: "medico",
    nombre: "Dr. Internista",
  });
  medicoUsuarioId = medico.id;
  await createTenantUser(TENANT_SLUG, {
    email: ENFERMERA.email,
    password: ENFERMERA.password,
    rolCodigo: "enfermera",
    nombre: "Enf. Turno A",
  });
  await createTenantUser(TENANT_SLUG, {
    email: RECEPCION.email,
    password: RECEPCION.password,
    rolCodigo: "recepcion",
    nombre: "Recepción Hosp",
  });

  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER.email, OWNER.password)).accessToken;
  medicoToken = (await loginTenantUser(app, TENANT_SLUG, MEDICO.email, MEDICO.password))
    .accessToken;
  enfermeraToken = (await loginTenantUser(app, TENANT_SLUG, ENFERMERA.email, ENFERMERA.password))
    .accessToken;
  recepcionToken = (await loginTenantUser(app, TENANT_SLUG, RECEPCION.email, RECEPCION.password))
    .accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: auth(ownerToken) });
  const sucData = sucs.json() as Array<{ id: string; codigo: string }>;
  const principal = sucData.find((s) => s.codigo === "SUC-PRINCIPAL");
  if (!principal) throw new Error("SUC-PRINCIPAL no encontrada");
  sucursalId = principal.id;

  const tutor = await app.inject({
    method: "POST",
    url: "/t/clientes",
    headers: auth(ownerToken),
    payload: { nombre: "María", apellidos: "Hernández", telefonoPrincipal: "5550001111" },
  });
  tutorClienteId = tutor.json().id;

  const paciente = await app.inject({
    method: "POST",
    url: "/t/pacientes",
    headers: auth(ownerToken),
    payload: {
      nombre: "Juan",
      apellidoPaterno: "López",
      sexo: "masculino",
      fechaNacimiento: "1985-03-15T00:00:00.000Z",
    },
  });
  pacienteId = paciente.json().id;

  const mascota = await app.inject({
    method: "POST",
    url: "/t/mascotas",
    headers: auth(ownerToken),
    payload: {
      nombre: "Rocky",
      especie: "perro",
      raza: "Pastor Alemán",
      tutorClienteId,
    },
  });
  mascotaId = mascota.json().id;

  const meds = await app.inject({
    method: "GET",
    url: "/t/recetas/medicamentos/catalogo",
    headers: auth(medicoToken),
  });
  const items = meds.json() as Array<{ id: string; nombreComercial: string }>;
  const amox = items.find((m) => m.nombreComercial.toLowerCase().includes("amoxil"));
  if (!amox) throw new Error("Amoxil no encontrado en catálogo");
  amoxicilinaId = amox.id;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("camas CRUD", () => {
  it("dueño crea cama general con tarifa", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/camas",
      headers: auth(ownerToken),
      payload: {
        sucursalId,
        codigo: "GEN-01",
        nombre: "General 1",
        tipo: "general",
        tarifaPorNoche: 800,
      },
    });
    expect(res.statusCode).toBe(201);
    const c = res.json() as { id: string; estado: string };
    expect(c.estado).toBe("libre");
    camaGeneralId = c.id;
  });

  it("dueño crea cama UCI", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/camas",
      headers: auth(ownerToken),
      payload: {
        sucursalId,
        codigo: "UCI-01",
        tipo: "cuidados_intensivos",
        tarifaPorNoche: 2500,
      },
    });
    expect(res.statusCode).toBe(201);
    camaUciId = res.json().id;
  });

  it("filtro por estado=libre lista ambas camas", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/camas?sucursalId=${sucursalId}&estado=libre`,
      headers: auth(medicoToken),
    });
    const items = res.json() as Array<{ codigo: string; estado: string }>;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.every((c) => c.estado === "libre")).toBe(true);
  });

  it("cajero NO puede crear cama (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/camas",
      headers: auth(enfermeraToken),
      payload: { sucursalId, codigo: "X-01", tipo: "general" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("ingreso hospitalización + cama ocupada", () => {
  let hospHumanaId: string;
  let hospVetId: string;
  let hospHumanaFolio: string;

  it("recepción NO puede ingresar (sin HOSPITALIZACION_CREAR, 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/hospitalizaciones",
      headers: auth(recepcionToken),
      payload: {
        sucursalId,
        camaId: camaGeneralId,
        pacienteId,
        medicoResponsableId: medicoUsuarioId,
        motivoIngreso: "Test 403",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("médico ingresa paciente humano (cama ocupada + cargo estancia diaria auto)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/hospitalizaciones",
      headers: auth(medicoToken),
      payload: {
        sucursalId,
        camaId: camaGeneralId,
        pacienteId,
        medicoResponsableId: medicoUsuarioId,
        motivoIngreso: "Neumonía moderada",
        notasIngreso: "SatO2 92% al ingreso",
      },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json() as { hospitalizacionId: string; folio: string };
    expect(r.folio).toMatch(/^HOSP-SUC-PRINCIPAL-\d{6}$/);
    hospHumanaId = r.hospitalizacionId;
    hospHumanaFolio = r.folio;

    const cama = await app.inject({
      method: "GET",
      url: `/t/camas/${camaGeneralId}`,
      headers: auth(medicoToken),
    });
    expect(cama.json().estado).toBe("ocupada");

    const detalle = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones/${hospHumanaId}`,
      headers: auth(medicoToken),
    });
    const d = detalle.json() as { cargos: Array<{ tipo: string; monto: string }> };
    expect(d.cargos.length).toBe(1);
    expect(d.cargos[0]?.tipo).toBe("estancia_diaria");
    expect(Number(d.cargos[0]?.monto)).toBe(800);
  });

  it("ingresar en cama ya ocupada → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/hospitalizaciones",
      headers: auth(medicoToken),
      payload: {
        sucursalId,
        camaId: camaGeneralId,
        pacienteId,
        medicoResponsableId: medicoUsuarioId,
        motivoIngreso: "duplicado",
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().estadoActual).toBe("ocupada");
  });

  it("XOR: ingresar con paciente+mascota juntos → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/hospitalizaciones",
      headers: auth(medicoToken),
      payload: {
        sucursalId,
        camaId: camaUciId,
        pacienteId,
        mascotaId,
        medicoResponsableId: medicoUsuarioId,
        motivoIngreso: "xor test",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("XOR: ingresar sin paciente ni mascota → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/hospitalizaciones",
      headers: auth(medicoToken),
      payload: {
        sucursalId,
        camaId: camaUciId,
        medicoResponsableId: medicoUsuarioId,
        motivoIngreso: "xor test",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("médico ingresa mascota vet en UCI (polimorfismo XOR mascota)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/hospitalizaciones",
      headers: auth(medicoToken),
      payload: {
        sucursalId,
        camaId: camaUciId,
        mascotaId,
        medicoResponsableId: medicoUsuarioId,
        motivoIngreso: "Parvovirosis - deshidratación severa",
      },
    });
    expect(res.statusCode).toBe(201);
    hospVetId = res.json().hospitalizacionId;
  });

  it("cambiar estado de cama ocupada → 409 (debe dar alta primero)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/camas/${camaUciId}/cambiar-estado`,
      headers: auth(ownerToken),
      payload: { estado: "libre" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("listado filtra por mascotaId", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones?mascotaId=${mascotaId}`,
      headers: auth(medicoToken),
    });
    const r = res.json() as { items: Array<{ id: string; folio: string }>; total: number };
    expect(r.total).toBe(1);
    expect(r.items[0]?.id).toBe(hospVetId);
  });

  it("detalle hospitalización incluye paciente cuando es humano", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones/${hospHumanaId}`,
      headers: auth(medicoToken),
    });
    const d = res.json() as {
      paciente: { nombre: string } | null;
      mascota: unknown;
      folio: string;
    };
    expect(d.paciente?.nombre).toBe("Juan");
    expect(d.mascota).toBeNull();
    expect(d.folio).toBe(hospHumanaFolio);
  });
});

describe("medicación programada + kardex expandido", () => {
  let hospId: string;
  let medicacionId: string;
  let primerKardexId: string;

  beforeAll(async () => {
    const list = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones?pacienteId=${pacienteId}&estado=activa`,
      headers: auth(medicoToken),
    });
    const r = list.json() as { items: Array<{ id: string }> };
    if (!r.items[0]) throw new Error("No hay hospitalización activa humana");
    hospId = r.items[0].id;
  });

  it("enfermera NO puede programar medicación (sin MEDICACION_PROGRAMAR, 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/${hospId}/medicaciones`,
      headers: auth(enfermeraToken),
      payload: {
        medicamentoCatalogoId: amoxicilinaId,
        dosis: "500 mg",
        via: "oral",
        frecuenciaHoras: 8,
        duracionDias: 5,
        horaInicio: new Date(Date.now() + 60_000).toISOString(),
        indicacionMedica: "test 403",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("médico programa Amoxicilina 500mg c/8h x 5d → expande 15 kardex", async () => {
    const horaInicio = new Date(Date.now() + 5 * 60_000);
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/${hospId}/medicaciones`,
      headers: auth(medicoToken),
      payload: {
        medicamentoCatalogoId: amoxicilinaId,
        dosis: "500 mg",
        via: "oral",
        frecuenciaHoras: 8,
        duracionDias: 5,
        horaInicio: horaInicio.toISOString(),
        indicacionMedica: "Amoxicilina 500mg VO c/8h x 5 días para neumonía",
      },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json() as { medicacionProgramadaId: string; kardexCreados: number };
    expect(r.kardexCreados).toBe(15);
    medicacionId = r.medicacionProgramadaId;
  });

  it("kardex listado en orden cronológico", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones/kardex?hospitalizacionId=${hospId}`,
      headers: auth(enfermeraToken),
    });
    const items = res.json() as Array<{ id: string; horaProgramada: string; estado: string }>;
    expect(items.length).toBe(15);
    expect(items.every((k) => k.estado === "pendiente")).toBe(true);
    const horas = items.map((k) => new Date(k.horaProgramada).getTime());
    for (let i = 1; i < horas.length; i++) {
      const prev = horas[i - 1];
      const curr = horas[i];
      if (prev !== undefined && curr !== undefined) {
        expect(curr).toBeGreaterThan(prev);
        expect(Math.round((curr - prev) / 3_600_000)).toBe(8);
      }
    }
    primerKardexId = items[0]?.id ?? "";
  });

  it("enfermera aplica primer kardex", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/kardex/${primerKardexId}/aplicar`,
      headers: auth(enfermeraToken),
      payload: { estado: "aplicada", notas: "Sin reacciones adversas" },
    });
    expect(res.statusCode).toBe(204);

    const list = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones/kardex?medicacionProgramadaId=${medicacionId}&estado=aplicada`,
      headers: auth(enfermeraToken),
    });
    const aplicadas = list.json() as Array<{
      id: string;
      enfermeraAplicador: { nombre: string } | null;
    }>;
    expect(aplicadas.length).toBe(1);
    expect(aplicadas[0]?.enfermeraAplicador?.nombre).toBe("Enf. Turno A");
  });

  it("re-aplicar kardex ya aplicada → 409 (append-only)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/kardex/${primerKardexId}/aplicar`,
      headers: auth(enfermeraToken),
      payload: { estado: "aplicada" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("omitir kardex sin motivoOmision → 400", async () => {
    const list = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones/kardex?medicacionProgramadaId=${medicacionId}&estado=pendiente`,
      headers: auth(enfermeraToken),
    });
    const pendientes = list.json() as Array<{ id: string }>;
    const target = pendientes[0];
    if (!target) throw new Error("no hay kardex pendiente");
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/kardex/${target.id}/aplicar`,
      headers: auth(enfermeraToken),
      payload: { estado: "omitida" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("omitir kardex con motivoOmision → 204", async () => {
    const list = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones/kardex?medicacionProgramadaId=${medicacionId}&estado=pendiente`,
      headers: auth(enfermeraToken),
    });
    const target = (list.json() as Array<{ id: string }>)[0];
    if (!target) throw new Error("no hay kardex pendiente");
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/kardex/${target.id}/aplicar`,
      headers: auth(enfermeraToken),
      payload: { estado: "omitida", motivoOmision: "Paciente con vómito" },
    });
    expect(res.statusCode).toBe(204);
  });

  it("suspender medicación detiene futuras programaciones (alta queda en suspendida)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/medicaciones/${medicacionId}/suspender`,
      headers: auth(medicoToken),
      payload: { motivoSuspension: "Cambio a Ceftriaxona IV" },
    });
    expect(res.statusCode).toBe(204);

    const tx = await getTenantClient(TENANT_SLUG);
    const med = await tx.medicacionProgramada.findUnique({ where: { id: medicacionId } });
    expect(med?.estado).toBe("suspendida");
    expect(med?.motivoSuspension).toBe("Cambio a Ceftriaxona IV");
  });
});

describe("signos vitales con alertas rule-based", () => {
  let hospId: string;

  beforeAll(async () => {
    const list = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones?pacienteId=${pacienteId}&estado=activa`,
      headers: auth(medicoToken),
    });
    hospId = (list.json() as { items: Array<{ id: string }> }).items[0]?.id ?? "";
  });

  it("signos normales → sin alertas", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/${hospId}/signos-vitales`,
      headers: auth(enfermeraToken),
      payload: {
        temperaturaC: "36.8",
        frecuenciaCardiaca: 78,
        saturacionO2: 98,
        presionSistolica: 120,
        presionDiastolica: 80,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().alertasMarcadas).toEqual({});
  });

  it("fiebre alta T=39.5 marca alerta", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/${hospId}/signos-vitales`,
      headers: auth(enfermeraToken),
      payload: { temperaturaC: "39.5", frecuenciaCardiaca: 95 },
    });
    expect(res.json().alertasMarcadas.fiebreAlta).toBe(true);
  });

  it("hipoxemia SatO2=85 + taquicardia FC=200 marcan alertas múltiples", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/${hospId}/signos-vitales`,
      headers: auth(enfermeraToken),
      payload: { saturacionO2: 85, frecuenciaCardiaca: 200 },
    });
    const a = res.json().alertasMarcadas;
    expect(a.hipoxemia).toBe(true);
    expect(a.taquicardia).toBe(true);
  });
});

describe("worker alarmas medicación (in-app channel)", () => {
  it("escaneo detecta kardex dentro de ventana y envía alarma; segundo escaneo ya no re-envía (anti-spam)", async () => {
    const list = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones?pacienteId=${pacienteId}&estado=activa`,
      headers: auth(medicoToken),
    });
    const hospId = (list.json() as { items: Array<{ id: string }> }).items[0]?.id;
    if (!hospId) throw new Error("no hosp activa");

    const horaInicio = new Date(Date.now() + 60_000);
    await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/${hospId}/medicaciones`,
      headers: auth(medicoToken),
      payload: {
        medicamentoCatalogoId: amoxicilinaId,
        dosis: "500 mg",
        via: "oral",
        frecuenciaHoras: 24,
        duracionDias: 1,
        horaInicio: horaInicio.toISOString(),
        indicacionMedica: "Dosis única para test alarmas",
      },
    });

    const client = await getTenantClient(TENANT_SLUG);
    const channel = new InMemoryAlarmChannel();
    const ahora = new Date(horaInicio.getTime() - 5 * 60_000);
    const r1 = await escanearKardexParaAlarmar(client, channel, { ahora, ventanaMinutosAntes: 10 });
    expect(r1.enviadas).toBeGreaterThanOrEqual(1);
    expect(channel.enviadas.some((p) => p.medicamentoNombre.includes("moxil"))).toBe(true);

    const r2 = await escanearKardexParaAlarmar(client, channel, { ahora, ventanaMinutosAntes: 10 });
    expect(r2.enviadas).toBe(0);
  });
});

describe("agregar cargos manuales", () => {
  let hospId: string;

  beforeAll(async () => {
    const list = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones?pacienteId=${pacienteId}&estado=activa`,
      headers: auth(medicoToken),
    });
    hospId = (list.json() as { items: Array<{ id: string }> }).items[0]?.id ?? "";
  });

  it("agrega cargo procedimiento (cantidad×precio)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/${hospId}/cargos`,
      headers: auth(medicoToken),
      payload: {
        tipo: "procedimiento",
        descripcion: "Curación de herida quirúrgica",
        cantidad: 1,
        precioUnitario: 450,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(Number(res.json().monto)).toBeCloseTo(450, 2);
  });

  it("agrega cargo medicamento (3 unidades × 50)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/${hospId}/cargos`,
      headers: auth(medicoToken),
      payload: {
        tipo: "medicamento",
        descripcion: "Paracetamol 1g IV",
        cantidad: 3,
        precioUnitario: 50,
      },
    });
    expect(Number(res.json().monto)).toBeCloseTo(150, 2);
  });
});

describe("dar alta: libera cama, suspende meds, crea Venta borrador", () => {
  it("recepción da alta → cama→limpieza + venta borrador con total = suma cargos", async () => {
    const list = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones?pacienteId=${pacienteId}&estado=activa`,
      headers: auth(medicoToken),
    });
    const hosp = (list.json() as { items: Array<{ id: string; folio: string }> }).items[0];
    if (!hosp) throw new Error("no hosp activa");
    const detalle = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones/${hosp.id}`,
      headers: auth(medicoToken),
    });
    const cargos = (detalle.json() as { cargos: Array<{ monto: string }> }).cargos;
    const totalEsperado = cargos.reduce((acc, c) => acc + Number(c.monto), 0);

    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/${hosp.id}/alta`,
      headers: auth(recepcionToken),
      payload: { motivoAlta: "Mejoría clínica", observaciones: "Continuar antibiótico VO en casa" },
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as {
      ventaBorradorId: string | null;
      montoTotal: string;
      cargosFacturados: number;
      camaLiberadaId: string;
    };
    expect(r.ventaBorradorId).not.toBeNull();
    expect(Number(r.montoTotal)).toBeCloseTo(totalEsperado, 2);
    expect(r.cargosFacturados).toBe(cargos.length);

    const cama = await app.inject({
      method: "GET",
      url: `/t/camas/${r.camaLiberadaId}`,
      headers: auth(medicoToken),
    });
    expect(cama.json().estado).toBe("limpieza");

    const hospDespues = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones/${hosp.id}`,
      headers: auth(medicoToken),
    });
    const d = hospDespues.json() as {
      estado: string;
      fechaEgreso: string;
      ventaAlAlta: { id: string; folio: string; total: string; estado: string };
      cargos: Array<{ facturadoEnVentaId: string | null }>;
    };
    expect(d.estado).toBe("alta");
    expect(d.fechaEgreso).toBeDefined();
    expect(d.ventaAlAlta.id).toBe(r.ventaBorradorId);
    expect(Number(d.ventaAlAlta.total)).toBeCloseTo(totalEsperado, 2);
    expect(d.cargos.every((c) => c.facturadoEnVentaId === r.ventaBorradorId)).toBe(true);
  });

  it("dar alta a hospitalización ya en alta → 409", async () => {
    const list = await app.inject({
      method: "GET",
      url: `/t/hospitalizaciones?pacienteId=${pacienteId}&estado=alta`,
      headers: auth(medicoToken),
    });
    const hosp = (list.json() as { items: Array<{ id: string }> }).items[0];
    if (!hosp) throw new Error("no hay alta");
    const res = await app.inject({
      method: "POST",
      url: `/t/hospitalizaciones/${hosp.id}/alta`,
      headers: auth(recepcionToken),
      payload: { motivoAlta: "duplicado" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("cambia estado de cama liberada limpieza → libre (recepción gestiona)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/camas/${camaGeneralId}/cambiar-estado`,
      headers: auth(recepcionToken),
      payload: { estado: "libre" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("libre");
  });
});
