import { masterPrisma } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAdmin } from "./helpers.js";

let app: FastifyInstance;
let adminToken: string;

function auth() {
  return { authorization: `Bearer ${adminToken}` };
}

async function cleanup() {
  await masterPrisma.coupon.deleteMany({ where: { code: { startsWith: "TESTCUP" } } });
  await masterPrisma.plan.deleteMany({ where: { code: { startsWith: "test-plan-" } } });
}

beforeAll(async () => {
  app = await buildTestApp();
  adminToken = (await loginAdmin(app)).accessToken;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  if (app) await app.close();
});

describe("catálogo · planes", () => {
  let planId: string;

  it("crea un plan", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/catalogo/planes",
      headers: auth(),
      payload: { code: "test-plan-a", name: "Plan Test A", priceCents: 49900, tierOrder: 5 },
    });
    expect(res.statusCode).toBe(201);
    const p = res.json() as { id: string; code: string; priceCents: number; active: boolean };
    expect(p.code).toBe("test-plan-a");
    expect(p.priceCents).toBe(49900);
    expect(p.active).toBe(true);
    planId = p.id;
  });

  it("rechaza código duplicado con 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/catalogo/planes",
      headers: auth(),
      payload: { code: "test-plan-a", name: "Otro", priceCents: 100 },
    });
    expect(res.statusCode).toBe(409);
  });

  it("lista incluye el plan creado", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/catalogo/planes", headers: auth() });
    const items = res.json() as Array<{ code: string }>;
    expect(items.some((p) => p.code === "test-plan-a")).toBe(true);
  });

  it("edita precio y desactiva", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/catalogo/planes/${planId}`,
      headers: auth(),
      payload: { priceCents: 59900, active: false },
    });
    expect(res.statusCode).toBe(200);
    const p = res.json() as { priceCents: number; active: boolean };
    expect(p.priceCents).toBe(59900);
    expect(p.active).toBe(false);
  });
});

describe("catálogo · cupones", () => {
  let couponId: string;

  it("crea cupón porcentual (código en mayúsculas)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/catalogo/cupones",
      headers: auth(),
      payload: { code: "testcup1", name: "Bienvenida", discountType: "percent", discountValue: 20 },
    });
    expect(res.statusCode).toBe(201);
    const c = res.json() as { id: string; code: string; discountValue: number };
    expect(c.code).toBe("TESTCUP1");
    expect(c.discountValue).toBe(20);
    couponId = c.id;
  });

  it("rechaza porcentaje > 100 con 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/catalogo/cupones",
      headers: auth(),
      payload: { code: "TESTCUP2", name: "Malo", discountType: "percent", discountValue: 150 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rechaza monto fijo sin moneda con 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/catalogo/cupones",
      headers: auth(),
      payload: { code: "TESTCUP3", name: "Fijo", discountType: "fixed", discountValue: 5000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("desactiva el cupón", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/catalogo/cupones/${couponId}`,
      headers: auth(),
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { isActive: boolean }).isActive).toBe(false);
  });
});
