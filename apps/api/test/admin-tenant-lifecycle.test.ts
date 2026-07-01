import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, cleanupTestTenants, createTestTenant, loginAdmin } from "./helpers.js";

let app: FastifyInstance;
let adminToken: string;
const SLUG = "test-lc-tenant";

function auth() {
  return { authorization: `Bearer ${adminToken}` };
}

async function estadoDe(slug: string): Promise<string | undefined> {
  const res = await app.inject({ method: "GET", url: "/admin/tenants", headers: auth() });
  const items = res.json() as Array<{ slug: string; status: string; plan: string }>;
  return items.find((t) => t.slug === slug)?.status;
}

beforeAll(async () => {
  app = await buildTestApp();
  adminToken = (await loginAdmin(app)).accessToken;
  await cleanupTestTenants();
  await createTestTenant(SLUG);
});

afterAll(async () => {
  await cleanupTestTenants();
  if (app) await app.close();
});

describe("ciclo de vida de tenants", () => {
  it("suspende un cliente", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${SLUG}/estado`,
      headers: auth(),
      payload: { status: "suspended", motivo: "prueba" },
    });
    expect(res.statusCode).toBe(200);
    expect(await estadoDe(SLUG)).toBe("suspended");
  });

  it("reactiva un cliente", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${SLUG}/estado`,
      headers: auth(),
      payload: { status: "active" },
    });
    expect(res.statusCode).toBe(200);
    expect(await estadoDe(SLUG)).toBe("active");
  });

  it("estado inválido → 400", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${SLUG}/estado`,
      headers: auth(),
      payload: { status: "xyz" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cambia el plan si hay otro disponible", async () => {
    const planesRes = await app.inject({
      method: "GET",
      url: "/admin/tenants/planes",
      headers: auth(),
    });
    const planes = planesRes.json() as Array<{ code: string }>;
    const listRes = await app.inject({ method: "GET", url: "/admin/tenants", headers: auth() });
    const actual = (listRes.json() as Array<{ slug: string; plan: string }>).find(
      (t) => t.slug === SLUG,
    )?.plan;
    const otro = planes.find((p) => p.code !== actual);
    if (!otro) return; // solo un plan sembrado: nada que probar
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${SLUG}/plan`,
      headers: auth(),
      payload: { planCode: otro.code },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { plan: string }).plan).toBe(otro.code);
  });

  it("plan inexistente → 400", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${SLUG}/plan`,
      headers: auth(),
      payload: { planCode: "plan-que-no-existe" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cliente inexistente → 404", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/admin/tenants/test-no-existe-jamas/estado",
      headers: auth(),
      payload: { status: "suspended" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("detalle: métodos de pago vacíos y dunning por defecto", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/tenants/${SLUG}/detalle`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json() as { paymentMethods: unknown[]; dunningPolicy: string };
    expect(Array.isArray(d.paymentMethods)).toBe(true);
    expect(d.paymentMethods).toHaveLength(0);
    expect(d.dunningPolicy).toBe("default");
  });

  it("cambia la política de dunning y se refleja en el detalle", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${SLUG}/dunning`,
      headers: auth(),
      payload: { policy: "agresiva" },
    });
    expect(res.statusCode).toBe(200);
    const det = await app.inject({
      method: "GET",
      url: `/admin/tenants/${SLUG}/detalle`,
      headers: auth(),
    });
    expect((det.json() as { dunningPolicy: string }).dunningPolicy).toBe("agresiva");
  });

  it("política de dunning inválida → 400", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${SLUG}/dunning`,
      headers: auth(),
      payload: { policy: "loquesea" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("reprogramar cobro de factura inexistente → 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/billing-ops/invoices/inv-no-existe/reintentar",
      headers: auth(),
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});
