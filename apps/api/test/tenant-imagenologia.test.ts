import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-imagenologia";

let app: FastifyInstance;
let token: string;
let sucursalId: string;
let mascotaId: string;

function auth() {
  return { authorization: `Bearer ${token}` };
}

async function solicitar(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/t/imagenologia",
    headers: auth(),
    payload: {
      sucursalId,
      mascotaId,
      modalidad: "radiografia",
      region: "tórax",
      nombreEstudio: "Radiografía de tórax",
      prioridad: "urgente",
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
  token = (await loginTenantUser(app, SLUG, dueno.email, dueno.password)).accessToken;
  sucursalId = (
    await app.inject({ method: "GET", url: "/t/sucursales", headers: auth() })
  ).json()[0].id;
  mascotaId = (
    await app.inject({
      method: "POST",
      url: "/t/mascotas",
      headers: auth(),
      payload: { nombre: "Nala", especie: "perro" },
    })
  ).json().id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestTenants();
});

describe("imagenología", () => {
  it("solicita un estudio (estado solicitado, folio)", async () => {
    const id = await solicitar();
    const get = await app.inject({ method: "GET", url: `/t/imagenologia/${id}`, headers: auth() });
    expect(get.json().estado).toBe("solicitado");
    expect(get.json().folio).toContain("IMG-");
  });

  it("exige exactamente uno de paciente/mascota", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/imagenologia",
      headers: auth(),
      payload: { sucursalId, modalidad: "ultrasonido", nombreEstudio: "USG" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("carga hallazgos e imágenes", async () => {
    const id = await solicitar();
    const res = await app.inject({
      method: "POST",
      url: `/t/imagenologia/${id}/resultado`,
      headers: auth(),
      payload: {
        hallazgos: "Patrón broncointersticial difuso.",
        impresionDiagnostica: "Compatible con bronconeumonía.",
        imagenes: [
          { url: "https://example.com/rx1.jpg", descripcion: "Proyección lateral" },
          { url: "https://example.com/rx2.jpg" },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.estado).toBe("resultado_cargado");
    expect(body.imagenes).toHaveLength(2);
    expect(body.hallazgos).toContain("broncointersticial");
  });

  it("no permite cancelar un estudio con resultado", async () => {
    const id = await solicitar();
    await app.inject({
      method: "POST",
      url: `/t/imagenologia/${id}/resultado`,
      headers: auth(),
      payload: { imagenes: [] },
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/imagenologia/${id}/cancelar`,
      headers: auth(),
      payload: { motivo: "ya no aplica" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("cancela un estudio solicitado", async () => {
    const id = await solicitar();
    const res = await app.inject({
      method: "POST",
      url: `/t/imagenologia/${id}/cancelar`,
      headers: auth(),
      payload: { motivo: "duplicado" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("cancelado");
  });
});
