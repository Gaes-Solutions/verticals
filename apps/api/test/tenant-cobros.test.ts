import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-cobros";
const OWNER = { email: "owner-cobros@test.local", password: "Owner!2026x" };

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  await cleanupTestTenants();
  app = await buildTestApp();
  await createTestTenant(SLUG);
  await createTenantUser(SLUG, { ...OWNER, rolCodigo: "dueno", nombre: "Dueño" });
  token = (await loginTenantUser(app, SLUG, OWNER.email, OWNER.password)).accessToken;
});

afterAll(async () => {
  await cleanupTestTenants();
  if (app) await app.close();
});

function auth() {
  return { authorization: `Bearer ${token}` };
}

describe("cobros / links de pago", () => {
  let tokenCobro = "";

  it("crea un link de cobro", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cobros",
      headers: auth(),
      payload: { concepto: "Anticipo pedido", monto: "250.50", clienteNombre: "Juan" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.monto).toBe("250.50");
    expect(body.status).toBe("pendiente");
    tokenCobro = body.token;
  });

  it("lista cobros con total pendiente", async () => {
    const res = await app.inject({ method: "GET", url: "/t/cobros", headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().pendiente).toBeGreaterThanOrEqual(250.5);
  });

  it("lectura pública por token", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cobros/publico/${tokenCobro}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("pendiente");
    expect(res.json().concepto).toBe("Anticipo pedido");
  });

  it("pagar (mock) marca el cobro como pagado", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cobros/publico/${tokenCobro}/pagar`,
      headers: auth(),
      payload: { metodo: "tarjeta" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("pagado");

    const check = await app.inject({
      method: "GET",
      url: `/t/cobros/publico/${tokenCobro}`,
      headers: auth(),
    });
    expect(check.json().status).toBe("pagado");
  });

  it("no se puede pagar dos veces (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cobros/publico/${tokenCobro}/pagar`,
      headers: auth(),
      payload: { metodo: "tarjeta" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("cancela un cobro pendiente", async () => {
    const creado = await app.inject({
      method: "POST",
      url: "/t/cobros",
      headers: auth(),
      payload: { concepto: "Otro", monto: "99" },
    });
    const id = creado.json().id;
    const res = await app.inject({
      method: "POST",
      url: `/t/cobros/${id}/cancelar`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("cancelado");
  });

  it("con pasarela real configurada sin llaves devuelve 503 (no cobra en mock)", async () => {
    // El negocio configura Conekta como pasarela…
    await app.inject({
      method: "PUT",
      url: "/t/ecommerce/config",
      headers: auth(),
      payload: {
        nombre: "Tienda Cobros",
        subdominio: "tienda-cobros",
        pasarelaPagoProvider: "conekta",
      },
    });
    const creado = await app.inject({
      method: "POST",
      url: "/t/cobros",
      headers: auth(),
      payload: { concepto: "Real", monto: "120" },
    });
    const tk = creado.json().token;
    // …pero sin CONEKTA_API_KEY el provider no está disponible → 503, no cae a mock.
    const res = await app.inject({
      method: "POST",
      url: `/t/cobros/publico/${tk}/pagar`,
      headers: auth(),
      payload: { metodo: "tarjeta" },
    });
    expect(res.statusCode).toBe(503);
  });
});
