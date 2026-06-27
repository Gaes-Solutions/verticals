import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-vacunas-cartilla";

let app: FastifyInstance;
let token: string;
let mascotaId: string;
let vacunaId: string;

function auth() {
  return { authorization: `Bearer ${token}` };
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

  const mascota = await app.inject({
    method: "POST",
    url: "/t/mascotas",
    headers: auth(),
    payload: { nombre: "Michis", especie: "gato" },
  });
  mascotaId = mascota.json().id;

  const catalogo = await app.inject({
    method: "GET",
    url: "/t/vacunaciones/catalogo",
    headers: auth(),
  });
  const lista = catalogo.json() as Array<{ id: string }>;
  vacunaId = lista[0]?.id ?? "";
});

afterAll(async () => {
  await app.close();
  await cleanupTestTenants();
});

describe("cartilla de vacunación", () => {
  it("hay catálogo de vacunas precargado", () => {
    expect(vacunaId).toBeTruthy();
  });

  it("aplica una vacuna y aparece en la cartilla con estado", async () => {
    const aplicar = await app.inject({
      method: "POST",
      url: "/t/vacunaciones",
      headers: auth(),
      payload: {
        mascotaId,
        vacunaCatalogoId: vacunaId,
        numeroLote: "LOTE-2026-A",
        caducidadLote: new Date(Date.now() + 365 * 86_400_000).toISOString(),
        viaAdministracion: "subcutanea",
        dosisAplicada: "1 ml",
      },
    });
    expect(aplicar.statusCode).toBe(201);

    const cartilla = await app.inject({
      method: "GET",
      url: `/t/vacunaciones/cartilla?mascotaId=${mascotaId}`,
      headers: auth(),
    });
    expect(cartilla.statusCode).toBe(200);
    const body = cartilla.json();
    expect(body.sujeto.tipo).toBe("mascota");
    expect(body.vacunacionesAplicadas.length).toBeGreaterThanOrEqual(1);
    expect(["vigente", "proxima", "vencida"]).toContain(body.vacunacionesAplicadas[0].estado);
  });

  it("la cartilla exige exactamente uno de paciente/mascota", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/vacunaciones/cartilla",
      headers: auth(),
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
