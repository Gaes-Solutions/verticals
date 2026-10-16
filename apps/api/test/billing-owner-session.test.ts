import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-billing-owner-1";
const OWNER_EMAIL = "owner-bo@test.local";
const CASHIER_EMAIL = "cajero-bo@test.local";
const PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant Billing Owner");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner BO",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero BO",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, PASSWORD)).accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, PASSWORD)).accessToken;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("sesión unificada del dueño en /billing/* (ADR 014)", () => {
  it("el token RBAC del dueño accede a /billing/me de SU tenant", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/billing/me",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { tenant: { slug: string } };
    expect(body.tenant.slug).toBe(TENANT_SLUG);
  });

  it("el dueño lista sus facturas", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/billing/invoices",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("un empleado (cajero, sin rol *) recibe 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/billing/me",
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("sin token es 401", async () => {
    const res = await app.inject({ method: "GET", url: "/billing/me" });
    expect(res.statusCode).toBe(401);
  });
});

afterEach(() => vi.unstubAllEnvs());
describe("Stripe public configuration does not leak misplaced secrets", () => {
  it.each([
    "sk_test_do_not_expose",
    "sk_live_do_not_expose",
    "rk_test_do_not_expose",
    "whsec_do_not_expose",
  ])("does not return a misplaced %s key", async (key) => {
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", key);
    const response = await app.inject({
      method: "GET",
      url: "/billing/stripe-config",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ publishableKey: null });
    expect(response.body).not.toContain(key);
  });
  it("returns a valid publishable key", async () => {
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_test_public");
    const response = await app.inject({
      method: "GET",
      url: "/billing/stripe-config",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(response.json()).toEqual({ publishableKey: "pk_test_public" });
  });
});
