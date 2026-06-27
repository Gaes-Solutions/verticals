import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-laboratorio";

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
    url: "/t/laboratorio",
    headers: auth(),
    payload: {
      sucursalId,
      mascotaId,
      tipoEstudio: "quimica_sanguinea",
      nombreEstudio: "Química sanguínea de 6 elementos",
      prioridad: "urgente",
      notasClinicas: "Sospecha de diabetes",
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
      payload: { nombre: "Toby", especie: "perro" },
    })
  ).json().id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestTenants();
});

describe("laboratorio", () => {
  it("solicita un estudio (estado solicitado, folio)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/laboratorio",
      headers: auth(),
      payload: {
        sucursalId,
        mascotaId,
        tipoEstudio: "biometria",
        nombreEstudio: "Biometría hemática",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().estado).toBe("solicitado");
    expect(res.json().folio).toContain("LAB-");
  });

  it("exige exactamente uno de paciente/mascota", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/laboratorio",
      headers: auth(),
      payload: { sucursalId, tipoEstudio: "x", nombreEstudio: "x" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("carga resultado y marca fuera de rango el valor anómalo", async () => {
    const id = await solicitar();
    const res = await app.inject({
      method: "POST",
      url: `/t/laboratorio/${id}/resultado`,
      headers: auth(),
      payload: {
        resultadoResumen: "Hiperglucemia.",
        resultados: [
          { parametro: "Glucosa", valor: "180", unidad: "mg/dL", rangoMin: 70, rangoMax: 110 },
          { parametro: "Creatinina", valor: "1.0", unidad: "mg/dL", rangoMin: 0.5, rangoMax: 1.5 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.estado).toBe("resultado_cargado");
    expect(body.resultados[0].fueraDeRango).toBe(true);
    expect(body.resultados[1].fueraDeRango).toBe(false);
  });

  it("no permite cancelar un estudio con resultado cargado", async () => {
    const id = await solicitar();
    await app.inject({
      method: "POST",
      url: `/t/laboratorio/${id}/resultado`,
      headers: auth(),
      payload: { resultados: [] },
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/laboratorio/${id}/cancelar`,
      headers: auth(),
      payload: { motivo: "ya no se necesita" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("cancela un estudio solicitado", async () => {
    const id = await solicitar();
    const res = await app.inject({
      method: "POST",
      url: `/t/laboratorio/${id}/cancelar`,
      headers: auth(),
      payload: { motivo: "duplicado" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("cancelado");
  });
});
