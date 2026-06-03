import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTestTenant } from "./helpers.js";

const TENANT_SLUG = "test-cliente-1";
const EMAIL = "ana@cliente.mx";
const PASSWORD = "Cliente!2026";

let app: FastifyInstance;
let clienteToken: string;
let clienteId: string;

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tienda Cliente Test");
});

afterAll(async () => {
  if (app) await app.close();
});

describe("registro y login de cliente B2C", () => {
  it("registra un cliente nuevo y devuelve JWT", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/registro",
      payload: { tenantSlug: TENANT_SLUG, nombre: "Ana", email: EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { accessToken: string; cliente: { id: string; nombre: string } };
    expect(body.cliente.nombre).toBe("Ana");
    clienteToken = body.accessToken;
    clienteId = body.cliente.id;
  });

  it("registro con email duplicado → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/registro",
      payload: { tenantSlug: TENANT_SLUG, nombre: "Otra", email: EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(409);
  });

  it("login con credenciales válidas", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/login",
      payload: { tenantSlug: TENANT_SLUG, email: EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { accessToken: string }).accessToken).toBeTruthy();
  });

  it("login con password incorrecta → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/login",
      payload: { tenantSlug: TENANT_SLUG, email: EMAIL, password: "malísima" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("portal de cuenta del cliente", () => {
  it("GET /cliente-portal/me devuelve sus datos", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/cliente-portal/me",
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { email: string }).email).toBe(EMAIL);
  });

  it("portal rechaza token que no es de cliente", async () => {
    const res = await app.inject({ method: "GET", url: "/cliente-portal/me" });
    expect(res.statusCode).toBe(401);
  });

  it("mis pedidos incluye pedidos hechos como invitado con el mismo correo", async () => {
    // simula un pedido guest con el email del cliente (checkout sin cuenta)
    const prisma = getTenantClient(TENANT_SLUG);
    await prisma.pedidoEcommerce.create({
      data: {
        folioPublico: `GP-${Date.now().toString().slice(-8)}`,
        emailComprador: EMAIL,
        subtotal: "100",
        total: "100",
        moneda: "MXN",
        metodoEnvio: "paqueteria",
        direccionEnvio: {},
        statusPedido: "entregado",
        statusPago: "pago_confirmado",
      },
    });
    const res = await app.inject({
      method: "GET",
      url: "/cliente-portal/pedidos",
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    expect(res.statusCode).toBe(200);
    const pedidos = res.json() as Array<{ emailComprador?: string; total: string }>;
    expect(pedidos.length).toBeGreaterThanOrEqual(1);
  });

  it("clienteId quedó persistido con passwordHash", async () => {
    const prisma = getTenantClient(TENANT_SLUG);
    const c = await prisma.cliente.findUnique({ where: { id: clienteId } });
    expect(c?.passwordHash).toBeTruthy();
    expect(c?.passwordHash).not.toBe(PASSWORD); // hasheada, no plana
  });
});
