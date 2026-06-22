import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-monedero";
const OWNER = { email: "owner-mon@test.local", password: "Owner!2026x" };

let app: FastifyInstance;
let token: string;
let clienteId = "";

beforeAll(async () => {
  await cleanupTestTenants();
  app = await buildTestApp();
  await createTestTenant(SLUG);
  await createTenantUser(SLUG, { ...OWNER, rolCodigo: "dueno", nombre: "Dueño" });
  token = (await loginTenantUser(app, SLUG, OWNER.email, OWNER.password)).accessToken;
  const cliente = await getTenantClient(SLUG).cliente.create({
    data: { nombre: "Cliente Monedero" },
  });
  clienteId = cliente.id;
});

afterAll(async () => {
  await cleanupTestTenants();
  if (app) await app.close();
});

function auth() {
  return { authorization: `Bearer ${token}` };
}

describe("monedero + gift cards", () => {
  let codigo = "";

  it("emite una gift card", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/monedero/gift-cards",
      headers: auth(),
      payload: { monto: "300" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().saldoActual).toBe("300.00");
    expect(res.json().status).toBe("activa");
    codigo = res.json().codigo;
  });

  it("consulta gift card por código", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/monedero/gift-cards/${codigo}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().saldoActual).toBe("300.00");
  });

  it("canjea la gift card al monedero del cliente", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/monedero/gift-cards/canjear",
      headers: auth(),
      payload: { codigo, clienteId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().saldo).toBe("300.00");
    expect(res.json().abonado).toBe("300.00");
  });

  it("la gift card ya no se puede canjear de nuevo (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/monedero/gift-cards/canjear",
      headers: auth(),
      payload: { codigo, clienteId },
    });
    expect(res.statusCode).toBe(409);
  });

  it("ve el saldo del monedero con su movimiento de abono", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/monedero/clientes/${clienteId}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().saldo).toBe("300.00");
    expect(res.json().movimientos.length).toBeGreaterThanOrEqual(1);
    expect(res.json().movimientos[0].tipo).toBe("abono");
  });

  it("carga (gasta) del monedero → baja el saldo", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/monedero/clientes/${clienteId}/movimiento`,
      headers: auth(),
      payload: { tipo: "cargo", monto: "100", motivo: "Compra en mostrador" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().saldo).toBe("200.00");
  });

  it("no permite gastar más que el saldo (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/monedero/clientes/${clienteId}/movimiento`,
      headers: auth(),
      payload: { tipo: "cargo", monto: "500", motivo: "Excede" },
    });
    expect(res.statusCode).toBe(409);
  });
});
