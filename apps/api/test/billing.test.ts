import { masterPrisma } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearMockChargeFailures, setMockChargeFailures } from "../src/modules/billing/service.js";
import { buildTestApp, loginAdmin } from "./helpers.js";

const SLUG = `test-saas-${Math.floor(Date.now() / 1000).toString(36)}`;
const ADMIN_TENANT_EMAIL = "owner@saas-test.local";
const ADMIN_TENANT_PASSWORD = "TenantAdmin!2026";
const COUPON_CODE = `TEST20-${SLUG}`;

let app: FastifyInstance;
let gaesAdminToken: string;
let tenantId: string;
let adminTenantToken: string;
let subscriptionId: string;
let pmId: string;

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

async function cleanup(): Promise<void> {
  const tenant = await masterPrisma.tenant.findUnique({ where: { slug: SLUG } });
  if (tenant) {
    await masterPrisma.invoicePayment.deleteMany({
      where: { invoice: { tenantId: tenant.id } },
    });
    await masterPrisma.invoiceItem.deleteMany({
      where: { invoice: { tenantId: tenant.id } },
    });
    await masterPrisma.invoice.deleteMany({ where: { tenantId: tenant.id } });
    await masterPrisma.couponRedemption.deleteMany({ where: { tenantId: tenant.id } });
    await masterPrisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await masterPrisma.paymentMethod.deleteMany({ where: { tenantId: tenant.id } });
    await masterPrisma.tenantSettingsMaster.deleteMany({ where: { tenantId: tenant.id } });
    await masterPrisma.tenantUserAdmin.deleteMany({ where: { tenantId: tenant.id } });
  }
  await masterPrisma.coupon.deleteMany({ where: { code: COUPON_CODE } });
}

beforeAll(async () => {
  app = await buildTestApp();
  gaesAdminToken = (await loginAdmin(app)).accessToken;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  if (app) await app.close();
});

beforeEach(() => {
  clearMockChargeFailures();
});

describe("signup público + auth admin tenant", () => {
  it("crea tenant + admin + subscription trialing en una llamada", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        slug: SLUG,
        name: "SaaS Test",
        legalName: "SaaS Test S.A. de C.V.",
        vertical: "retail_mayoreo",
        currency: "MXN",
        planCode: "starter",
        billingEmail: "billing@saas-test.local",
        adminEmail: ADMIN_TENANT_EMAIL,
        adminPassword: ADMIN_TENANT_PASSWORD,
        adminName: "Dueña Test",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      accessToken: string;
      tenant: { id: string; status: string; trialEndsAt: string };
      subscription: { id: string; status: string; trialEnd: string };
    };
    expect(body.tenant.status).toBe("trial");
    expect(body.subscription.status).toBe("trialing");
    expect(body.subscription.trialEnd).toBeTruthy();
    tenantId = body.tenant.id;
    subscriptionId = body.subscription.id;
    adminTenantToken = body.accessToken;
  });

  it("signup con slug duplicado → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        slug: SLUG,
        name: "Duplicado",
        vertical: "otro",
        planCode: "starter",
        billingEmail: "dup@x.com",
        adminEmail: "dup-admin@x.com",
        adminPassword: "Password!2026",
        adminName: "Dup",
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("login admin tenant con credenciales válidas", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/admin-tenant/login",
      payload: {
        tenantSlug: SLUG,
        email: ADMIN_TENANT_EMAIL,
        password: ADMIN_TENANT_PASSWORD,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken: string; admin: { tenantId: string } };
    expect(body.admin.tenantId).toBe(tenantId);
  });

  it("GET /billing/me devuelve contexto del tenant + suscripción + features", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/billing/me",
      headers: auth(adminTenantToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      tenant: { plan: { features: Array<{ featureKey: string }> } };
      subscription: { status: string };
    };
    expect(body.subscription.status).toBe("trialing");
    expect(body.tenant.plan.features.some((f) => f.featureKey === "pos_basico")).toBe(true);
  });
});

describe("payment methods + cupón + cambio de plan", () => {
  it("agrega payment method (default)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/billing/payment-methods",
      headers: auth(adminTenantToken),
      payload: {
        type: "card",
        setDefault: true,
        last4: "4242",
        brand: "visa",
        expMonth: 12,
        expYear: 2030,
      },
    });
    expect(res.statusCode).toBe(201);
    pmId = (res.json() as { id: string }).id;
  });

  it("aplica un cupón válido a la suscripción", async () => {
    await masterPrisma.coupon.create({
      data: {
        code: COUPON_CODE,
        name: "Test 20%",
        discountType: "percent",
        discountValue: 20,
        duration: "once",
        isActive: true,
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/billing/subscription/coupon",
      headers: auth(adminTenantToken),
      payload: { code: COUPON_CODE },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { applied: boolean }).applied).toBe(true);
  });

  it("upgrade starter→pro (growth) genera invoice prorrateada", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/billing/subscription/change-plan",
      headers: auth(adminTenantToken),
      payload: { planCode: "growth" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { invoiceId: string; amount: number };
    expect(body.invoiceId).toBeTruthy();
    expect(body.amount).toBeGreaterThan(0);
  });

  it("downgrade explícitamente rechazado V1 (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/billing/subscription/change-plan",
      headers: auth(adminTenantToken),
      payload: { planCode: "starter" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("trial → conversión a paid", () => {
  it("fuerzo vencimiento del trial y corro la conversión", async () => {
    await masterPrisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        trialEnd: new Date(Date.now() - 60_000),
        currentPeriodEnd: new Date(Date.now() - 60_000),
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/admin/billing/run-trial-conversions",
      headers: auth(gaesAdminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { procesados: number; cobrados: number; fallidos: number };
    expect(body.cobrados).toBeGreaterThanOrEqual(1);

    const sub = await masterPrisma.subscription.findUnique({ where: { id: subscriptionId } });
    expect(sub?.status).toBe("active");
    const ten = await masterPrisma.tenant.findUnique({ where: { id: tenantId } });
    expect(ten?.status).toBe("active");
  });

  it("la invoice del ciclo quedó paid con cfdiUuid mock", async () => {
    const invs = await app.inject({
      method: "GET",
      url: "/billing/invoices",
      headers: auth(adminTenantToken),
    });
    const list = invs.json() as Array<{ status: string; cfdiUuid: string | null }>;
    const ciclo = list.find((i) => i.status === "paid" && i.cfdiUuid?.startsWith("cfdi-mock-"));
    expect(ciclo).toBeTruthy();
  });
});

describe("webhook mock de pago externo", () => {
  let invoiceId: string;

  it("genera una invoice open vía cambio de plan y la confirma por webhook", async () => {
    const upgrade = await app.inject({
      method: "POST",
      url: "/billing/subscription/change-plan",
      headers: auth(adminTenantToken),
      payload: { planCode: "scale" },
    });
    invoiceId = (upgrade.json() as { invoiceId: string }).invoiceId;

    const wh = await app.inject({
      method: "POST",
      url: "/billing/webhook",
      payload: { invoiceId },
    });
    expect(wh.statusCode).toBe(200);
    const body = wh.json() as { paid: boolean; cfdiUuid: string };
    expect(body.paid).toBe(true);
    expect(body.cfdiUuid).toMatch(/^cfdi-mock-/);
  });
});

describe("dunning — 3 intentos fallidos → suspended", () => {
  it("genera invoice forzando fallos del cobro y corre dunning hasta suspender", async () => {
    // crear invoice ficticia vencida
    const inv = await masterPrisma.invoice.create({
      data: {
        tenantId,
        subscriptionId,
        invoiceNumber: `INV-DUNN-${Date.now()}`,
        status: "open",
        subtotal: 79900,
        total: 79900,
        currency: "MXN",
        dueDate: new Date(Date.now() - 86400000), // ayer
        items: {
          create: { description: "Suscripción Pro", quantity: 1, unitAmount: 79900, amount: 79900 },
        },
      },
    });

    // forzar 5 fallos en el payment method (más que los 3 reintentos)
    setMockChargeFailures(pmId, 5);

    // intento 1
    let res = await app.inject({
      method: "POST",
      url: "/admin/billing/run-dunning",
      headers: auth(gaesAdminToken),
    });
    expect(res.statusCode).toBe(200);
    let upd = await masterPrisma.invoice.findUnique({ where: { id: inv.id } });
    expect(upd?.attempts).toBe(1);
    expect(upd?.status).toBe("open");

    // adelantar nextRetryAt para que el siguiente ciclo lo procese
    await masterPrisma.invoice.update({
      where: { id: inv.id },
      data: { nextRetryAt: new Date(Date.now() - 1000) },
    });
    res = await app.inject({
      method: "POST",
      url: "/admin/billing/run-dunning",
      headers: auth(gaesAdminToken),
    });
    upd = await masterPrisma.invoice.findUnique({ where: { id: inv.id } });
    expect(upd?.attempts).toBe(2);

    await masterPrisma.invoice.update({
      where: { id: inv.id },
      data: { nextRetryAt: new Date(Date.now() - 1000) },
    });
    res = await app.inject({
      method: "POST",
      url: "/admin/billing/run-dunning",
      headers: auth(gaesAdminToken),
    });
    upd = await masterPrisma.invoice.findUnique({ where: { id: inv.id } });
    expect(upd?.attempts).toBe(3);
    // tras 3 intentos fallidos → suspend
    expect(upd?.status).toBe("uncollectible");

    const sub = await masterPrisma.subscription.findUnique({ where: { id: subscriptionId } });
    expect(sub?.status).toBe("unpaid");
    const ten = await masterPrisma.tenant.findUnique({ where: { id: tenantId } });
    expect(ten?.status).toBe("suspended");
  });
});
