import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-citas-flujo";

let app: FastifyInstance;
let token: string;
let medicoUsuarioId: string;
let sucursalId: string;
let mascotaId: string;

function auth() {
  return { authorization: `Bearer ${token}` };
}

async function crearCita(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/t/citas",
    headers: auth(),
    payload: {
      mascotaId,
      medicoUsuarioId,
      sucursalId,
      fechaProgramada: new Date(Date.now() + 86_400_000).toISOString(),
      motivoTexto: "Consulta general",
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(SLUG);
  const dueno = await createTenantUser(SLUG, {
    email: "dueno@test.local",
    password: "Test1234!",
    rolCodigo: "dueno",
  });
  const sesion = await loginTenantUser(app, SLUG, dueno.email, dueno.password);
  token = sesion.accessToken;
  medicoUsuarioId = sesion.userId;

  const sucursales = await app.inject({ method: "GET", url: "/t/sucursales", headers: auth() });
  sucursalId = sucursales.json()[0].id;

  const mascota = await app.inject({
    method: "POST",
    url: "/t/mascotas",
    headers: auth(),
    payload: { nombre: "Firulais", especie: "perro" },
  });
  mascotaId = mascota.json().id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestTenants();
});

describe("máquina de estados de citas", () => {
  it("recorre programada → confirmada → checkin → en_consulta", async () => {
    const id = await crearCita();

    const conf = await app.inject({
      method: "POST",
      url: `/t/citas/${id}/confirmar`,
      headers: auth(),
    });
    expect(conf.statusCode).toBe(200);
    expect(conf.json().estado).toBe("confirmada");

    const chk = await app.inject({
      method: "POST",
      url: `/t/citas/${id}/checkin`,
      headers: auth(),
      payload: {},
    });
    expect(chk.statusCode).toBe(200);
    expect(chk.json().estado).toBe("checkin");

    const ini = await app.inject({
      method: "POST",
      url: `/t/citas/${id}/iniciar-consulta`,
      headers: auth(),
    });
    expect(ini.statusCode).toBe(200);
    expect(ini.json().estado).toBe("en_consulta");
  });

  it("rechaza una transición inválida (programada → iniciar-consulta)", async () => {
    const id = await crearCita();
    const res = await app.inject({
      method: "POST",
      url: `/t/citas/${id}/iniciar-consulta`,
      headers: auth(),
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it("permite cancelar con motivo y no deja re-cancelar", async () => {
    const id = await crearCita();
    const cancel = await app.inject({
      method: "POST",
      url: `/t/citas/${id}/cancelar`,
      headers: auth(),
      payload: { motivo: "El tutor reagendó" },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().estado).toBe("cancelada");

    const reCancel = await app.inject({
      method: "POST",
      url: `/t/citas/${id}/checkin`,
      headers: auth(),
      payload: {},
    });
    expect(reCancel.statusCode).toBeGreaterThanOrEqual(400);
  });
});
