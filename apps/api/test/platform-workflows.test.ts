import { promises as dns } from "node:dns";
import { getTenantClient, masterPrisma } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agregarPaymentMethod, correrDunningCiclo } from "../src/modules/billing/service.js";
import { buildTestApp, cleanupTestTenants, loginAdmin } from "./helpers.js";

import {
  DominioEnUsoError,
  sincronizarDominioMaster,
} from "../src/modules/tenant/ecommerce-config/dominio-service.js";

const SLUG = "test-platform-flow";
const owner = { email: "owner-platform@example.invalid", password: "PlatformOwner!2026" };
let app: FastifyInstance;
let adminToken: string;
let ownerToken: string;
let tenantId: string;
let partnerId: string;
let referralId: string;
let sequence = 0;
const auth = () => ({ authorization: `Bearer ${adminToken}` });
const ownerAuth = () => ({ authorization: `Bearer ${ownerToken}` });
const post = (url: string, payload: object = {}) =>
  app.inject({ method: "POST", url, headers: auth(), payload });
async function invoice(status: "open" | "paid" | "void" = "open") {
  return masterPrisma.invoice.create({
    data: {
      tenantId,
      invoiceNumber: `QA-flow-${Date.now()}-${++sequence}`,
      status,
      subtotal: 39900,
      total: 39900,
      currency: "MXN",
      dueDate: new Date("2099-01-01"),
    },
  });
}
async function commission(periodoYyyymm: string) {
  return masterPrisma.commission.create({
    data: {
      partnerId,
      referralId,
      tenantId,
      periodoYyyymm,
      montoBaseTenantPaid: "399",
      porcentajeAplicado: "25",
      montoComision: "99.75",
    },
  });
}
beforeAll(async () => {
  app = await buildTestApp();
  adminToken = (await loginAdmin(app)).accessToken;
  await masterPrisma.plan.create({
    data: {
      code: "qa-legacy-flow",
      name: "Legacy QA",
      priceCents: 39900,
      currency: "MXN",
      active: true,
    },
  });
  const created = await post("/admin/tenants", {
    slug: SLUG,
    name: "QA tienda completa",
    planCode: "qa-legacy-flow",
    vertical: "retail_mayoreo",
    ownerEmail: owner.email,
    ownerPassword: owner.password,
  });
  expect(created.statusCode).toBe(201);
  tenantId = (await masterPrisma.tenant.findUniqueOrThrow({ where: { slug: SLUG } })).id;
  const login = await app.inject({ method: "POST", url: "/auth/tenant/login", payload: owner });
  expect(login.statusCode).toBe(200);
  ownerToken = login.json().accessToken;
  const partner = await post("/partners", {
    codigo: "qa-platform-flows",
    razonSocial: "QA partners",
    emailContacto: "partner-platform@example.invalid",
    tipo: "consultor",
  });
  expect(partner.statusCode).toBe(201);
  partnerId = partner.json().id;
  const link = await post(`/partners/${partnerId}/links`, {
    slug: "qa-platform-flows",
    nombre: "QA",
  });
  expect(link.statusCode).toBe(201);
  const referral = await masterPrisma.referral.create({
    data: { partnerId, linkId: link.json().id, tenantId, estado: "paying" },
  });
  referralId = referral.id;
}, 60000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  vi.unstubAllEnvs();
  if (tenantId) await masterPrisma.tiendaDominio.deleteMany({ where: { tenantSlug: SLUG } });
  if (partnerId) {
    await masterPrisma.commission.deleteMany({ where: { partnerId } });
    await masterPrisma.payout.deleteMany({ where: { partnerId } });
    await masterPrisma.referral.deleteMany({ where: { partnerId } });
    await masterPrisma.partnerLink.deleteMany({ where: { partnerId } });
    await masterPrisma.partner.delete({ where: { id: partnerId } });
  }
  if (app) await app.close();
  await cleanupTestTenants();
  await masterPrisma.plan.deleteMany({ where: { code: "qa-legacy-flow" } });
});

describe("alta, acceso inicial y estados", () => {
  it("un plan antiguo sin PlanPrice conserva su precio mensual al registrar la tienda", async () => {
    const price = await masterPrisma.planPrice.findFirst({
      where: { plan: { code: "qa-legacy-flow" }, currency: "MXN", interval: "monthly" },
    });
    expect(price?.unitAmount).toBe(39900);
  });
  it.each(["admin", "tenant"] as const)(
    "una sesión %s vencida no accede a información",
    async (kind) => {
      const expiration = { exp: Math.floor(Date.now() / 1000) - 60 };
      const token = app.jwt.sign({
        kind,
        sub: "qa-expired",
        email: owner.email,
        role: "superadmin",
        tenantSlug: SLUG,
        permissions: [],
        ...expiration,
      });
      const response = await app.inject({
        method: "GET",
        url: kind === "admin" ? "/admin/tenants" : "/t/productos",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(401);
    },
  );

  it("el dueño entra sin escribir el slug y consulta su negocio", async () => {
    expect(ownerToken).toBeTruthy();
    expect(
      (await app.inject({ method: "GET", url: "/t/productos", headers: ownerAuth() })).statusCode,
    ).toBe(200);
    const context = await app.inject({ method: "GET", url: "/billing/me", headers: ownerAuth() });
    expect(context.statusCode).toBe(200);
    expect(context.json().tenant.id).toBe(tenantId);
  });
  it("el alta administrativa deja suscripción trial y correo de cobro", async () => {
    const context = await app.inject({ method: "GET", url: "/billing/me", headers: ownerAuth() });
    expect(context.json().subscription?.status).toBe("trialing");
    expect(
      await masterPrisma.tenantSettingsMaster.findUnique({ where: { tenantId } }),
    ).toMatchObject({ billingEmail: owner.email });
  });
  it("repetir el alta no cambia la contraseña del dueño", async () => {
    const duplicate = await post("/admin/tenants", {
      slug: SLUG,
      name: "Duplicada",
      planCode: "starter",
      ownerEmail: owner.email,
      ownerPassword: "Different!2026",
    });
    expect(duplicate.statusCode).toBe(409);
    const login = await app.inject({ method: "POST", url: "/auth/tenant/login", payload: owner });
    expect(login.statusCode).toBe(200);
  });
  it.each(["suspended", "archived"])(
    "%s bloquea operación con la sesión ya emitida; reactivar la restaura",
    async (status) => {
      try {
        expect(
          (
            await app.inject({
              method: "PATCH",
              url: `/admin/tenants/${SLUG}/estado`,
              headers: auth(),
              payload: { status },
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (await app.inject({ method: "GET", url: "/t/productos", headers: ownerAuth() }))
            .statusCode,
        ).toBe(403);
        if (status === "suspended")
          expect(
            (await app.inject({ method: "GET", url: "/billing/me", headers: ownerAuth() }))
              .statusCode,
          ).toBe(200);
      } finally {
        await app.inject({
          method: "PATCH",
          url: `/admin/tenants/${SLUG}/estado`,
          headers: auth(),
          payload: { status: "active" },
        });
      }
      expect(
        (await app.inject({ method: "GET", url: "/t/productos", headers: ownerAuth() })).statusCode,
      ).toBe(200);
    },
  );
  it("cambiar plan actualiza negocio y suscripción y no toca una suscripción cancelada", async () => {
    const old = await masterPrisma.subscription.create({
      data: {
        tenantId,
        planId: (await masterPrisma.plan.findUniqueOrThrow({ where: { code: "starter" } })).id,
        currency: "MXN",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date("2099-01-01"),
        status: "canceled",
      },
    });
    const changed = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${SLUG}/plan`,
      headers: auth(),
      payload: { planCode: "growth" },
    });
    expect(changed.statusCode).toBe(200);
    const context = await app.inject({ method: "GET", url: "/billing/me", headers: ownerAuth() });
    expect(context.json().tenant.plan.code).toBe("growth");
    const active = await masterPrisma.subscription.findFirst({
      where: { tenantId, status: { not: "canceled" } },
      include: { plan: true },
    });
    expect(active?.plan.code).toBe("growth");
    expect(
      (await masterPrisma.subscription.findUniqueOrThrow({ where: { id: old.id } })).planId,
    ).toBe(old.planId);
  });
  it("datos inválidos no crean otro negocio", async () => {
    expect(
      (
        await post("/admin/tenants", {
          slug: "INVALID!",
          ownerEmail: "wrong",
          name: "QA",
          planCode: "starter",
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe("suspensión del portal de compradores", () => {
  it.each(["suspended", "archived"] as const)(
    "un negocio %s no mantiene abierto el portal con tokens anteriores",
    async (status) => {
      const cliente = await getTenantClient(SLUG).cliente.findFirstOrThrow({
        where: { isDefault: true },
      });
      const token = app.jwt.sign({
        sub: cliente.id,
        kind: "cliente",
        tenantSlug: SLUG,
        email: "qa-buyer@example.invalid",
      });
      await masterPrisma.tenant.update({ where: { id: tenantId }, data: { status } });
      try {
        expect(
          (
            await app.inject({
              method: "GET",
              url: "/cliente-portal/me",
              headers: { authorization: `Bearer ${token}` },
            })
          ).statusCode,
        ).toBe(401);
      } finally {
        await masterPrisma.tenant.update({ where: { id: tenantId }, data: { status: "active" } });
      }
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/cliente-portal/me",
            headers: { authorization: `Bearer ${token}` },
          })
        ).statusCode,
      ).toBe(200);
    },
  );
});

describe("revocación de acceso a facturación", () => {
  it("retirar el rol dueño revoca facturación con el token anterior", async () => {
    const client = getTenantClient(SLUG);
    const user = await client.usuario.findUniqueOrThrow({
      where: { email: owner.email },
      include: { roles: true },
    });
    await client.usuarioRol.deleteMany({ where: { usuarioId: user.id } });
    try {
      expect(
        (await app.inject({ method: "GET", url: "/billing/me", headers: ownerAuth() })).statusCode,
      ).toBe(401);
    } finally {
      await client.usuarioRol.createMany({
        data: user.roles.map((r) => ({ usuarioId: r.usuarioId, rolId: r.rolId })),
      });
    }
  });
  it("desactivar al dueño revoca facturación sin esperar al vencimiento", async () => {
    const client = getTenantClient(SLUG);
    await client.usuario.update({ where: { email: owner.email }, data: { isActive: false } });
    try {
      expect(
        (await app.inject({ method: "GET", url: "/billing/me", headers: ownerAuth() })).statusCode,
      ).toBe(401);
    } finally {
      await client.usuario.update({ where: { email: owner.email }, data: { isActive: true } });
    }
  });
  it("archivar el administrador antiguo revoca su token; viewer no puede escribir", async () => {
    const admin = await masterPrisma.tenantUserAdmin.findUniqueOrThrow({
      where: { tenantId_email: { tenantId, email: owner.email } },
    });
    const token = app.jwt.sign({
      sub: admin.id,
      kind: "admin_tenant",
      tenantId,
      tenantSlug: SLUG,
      email: admin.email,
      roleAdmin: "owner",
    });
    await masterPrisma.tenantUserAdmin.update({
      where: { id: admin.id },
      data: { roleAdmin: "viewer" },
    });
    try {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/billing/payment-methods",
            headers: { authorization: `Bearer ${token}` },
            payload: { type: "card" },
          })
        ).statusCode,
      ).toBe(403);
      await masterPrisma.tenantUserAdmin.update({
        where: { id: admin.id },
        data: { archivedAt: new Date() },
      });
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/billing/me",
            headers: { authorization: `Bearer ${token}` },
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await masterPrisma.tenantUserAdmin.update({
        where: { id: admin.id },
        data: { archivedAt: null, roleAdmin: "owner" },
      });
    }
  });
});

describe("facturas, doble envío y estados finales", () => {
  it("anular simultáneamente genera una sola transición y auditoría", async () => {
    const inv = await invoice();
    const result = await Promise.all([
      post(`/admin/billing-ops/invoices/${inv.id}/void`, { motivo: "QA primera" }),
      post(`/admin/billing-ops/invoices/${inv.id}/void`, { motivo: "QA segunda" }),
    ]);
    expect(result.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(
      await masterPrisma.auditLog.count({
        where: { action: "billing.invoice_void", resourceId: inv.id },
      }),
    ).toBe(1);
  });
  it.each(["paid", "void"] as const)("%s no admite reintento ni anulación", async (status) => {
    const inv = await invoice(status);
    expect((await post(`/admin/billing-ops/invoices/${inv.id}/reintentar`)).statusCode).toBe(409);
    expect(
      (await post(`/admin/billing-ops/invoices/${inv.id}/void`, { motivo: "No debe cambiar" }))
        .statusCode,
    ).toBe(409);
    expect((await masterPrisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe(
      status,
    );
  });
  it("reprogramar guarda el momento; una fecha inválida no lo cambia", async () => {
    const inv = await invoice();
    const fecha = "2099-02-01T12:00:00.000Z";
    expect(
      (await post(`/admin/billing-ops/invoices/${inv.id}/reintentar`, { fecha })).statusCode,
    ).toBe(200);
    expect(
      (await post(`/admin/billing-ops/invoices/${inv.id}/reintentar`, { fecha: "mañana" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await masterPrisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })
      ).nextRetryAt?.toISOString(),
    ).toBe(fecha);
  });
  it("webhook mock duplicado acredita una sola vez", async () => {
    const inv = await invoice();
    const result = await Promise.all([
      app.inject({ method: "POST", url: "/billing/webhook", payload: { invoiceId: inv.id } }),
      app.inject({ method: "POST", url: "/billing/webhook", payload: { invoiceId: inv.id } }),
    ]);
    expect(result.every((r) => r.statusCode === 200)).toBe(true);
    expect(
      await masterPrisma.invoicePayment.count({
        where: { invoiceId: inv.id, status: "succeeded" },
      }),
    ).toBe(1);
  });
  it("webhook mock no resucita una factura anulada", async () => {
    const inv = await invoice("void");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/billing/webhook",
          payload: { invoiceId: inv.id },
        })
      ).statusCode,
    ).toBe(409);
    expect((await masterPrisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe(
      "void",
    );
  });
});

describe("ciclos de cobro simultáneos", () => {
  it.each(["cancelled", "archived"] as const)(
    "no cobra automáticamente un negocio %s",
    async (status) => {
      const inv = await invoice();
      await masterPrisma.invoice.update({
        where: { id: inv.id },
        data: { dueDate: new Date(), nextRetryAt: new Date() },
      });
      await masterPrisma.tenant.update({ where: { id: tenantId }, data: { status } });
      try {
        await correrDunningCiclo(masterPrisma);
        expect(await masterPrisma.invoicePayment.count({ where: { invoiceId: inv.id } })).toBe(0);
        expect(
          (await masterPrisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).status,
        ).toBe(status);
      } finally {
        await masterPrisma.tenant.update({ where: { id: tenantId }, data: { status: "active" } });
        await masterPrisma.invoice.update({ where: { id: inv.id }, data: { status: "void" } });
      }
    },
  );

  it("dos ejecuciones del cobrador no duplican pagos ni cobran facturas anuladas", async () => {
    await agregarPaymentMethod(masterPrisma, tenantId, { type: "card", setDefault: true });
    const inv = await invoice();
    await masterPrisma.invoice.update({
      where: { id: inv.id },
      data: { dueDate: new Date(), nextRetryAt: new Date() },
    });
    await Promise.all([correrDunningCiclo(masterPrisma), correrDunningCiclo(masterPrisma)]);
    expect(
      await masterPrisma.invoicePayment.count({
        where: { invoiceId: inv.id, status: "succeeded" },
      }),
    ).toBe(1);
    const closed = await invoice("void");
    expect(
      (await masterPrisma.invoice.findUniqueOrThrow({ where: { id: closed.id } })).status,
    ).toBe("void");
    expect(await masterPrisma.invoicePayment.count({ where: { invoiceId: closed.id } })).toBe(0);
  });
});

describe("partners y pagos concurrentes", () => {
  it("aprobar y rechazar a la vez solo admite una decisión", async () => {
    const c = await commission("202601");
    const result = await Promise.all([
      post(`/partners/commissions/${c.id}/aprobar`),
      post(`/partners/commissions/${c.id}/rechazar`, { motivo: "Revisión QA" }),
    ]);
    expect(result.map((r) => r.statusCode).sort()).toEqual([204, 409]);
    const saved = await masterPrisma.commission.findUniqueOrThrow({ where: { id: c.id } });
    expect(Boolean(saved.aprobadaAt) !== Boolean(saved.rechazadaAt)).toBe(true);
  });
  it("crear payout dos veces a la vez produce un payout y un conflicto claro", async () => {
    const c = await commission("202602");
    expect((await post(`/partners/commissions/${c.id}/aprobar`)).statusCode).toBe(204);
    const input = { partnerId, periodoYyyymm: "202602", metodoPago: "spei" };
    const result = await Promise.all([
      post("/partners/payouts", input),
      post("/partners/payouts", input),
    ]);
    expect(result.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const p = await masterPrisma.payout.findUniqueOrThrow({
      where: { partnerId_periodoYyyymm: { partnerId, periodoYyyymm: "202602" } },
    });
    expect(p.montoNeto.toString()).toBe("99.75");
    expect(
      (await masterPrisma.commission.findUniqueOrThrow({ where: { id: c.id } })).payoutId,
    ).toBe(p.id);
  });
  it("registrar el pago a la vez preserva un folio y paga sus comisiones una vez", async () => {
    const c = await commission("202603");
    await post(`/partners/commissions/${c.id}/aprobar`);
    const created = await post("/partners/payouts", {
      partnerId,
      periodoYyyymm: "202603",
      metodoPago: "spei",
    });
    const id = created.json().payoutId as string;
    const result = await Promise.all([
      post(`/partners/payouts/${id}/marcar-pagado`, { folioBancario: "QA-A" }),
      post(`/partners/payouts/${id}/marcar-pagado`, { folioBancario: "QA-B" }),
    ]);
    expect(result.map((r) => r.statusCode).sort()).toEqual([204, 409]);
    expect((await masterPrisma.commission.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe(
      "pagada",
    );
  });
  it("no genera pagos sin comisiones aprobadas", async () => {
    expect(
      (await post("/partners/payouts", { partnerId, periodoYyyymm: "202604", metodoPago: "spei" }))
        .statusCode,
    ).toBe(409);
  });
  it.each(["202600", "202613"])("rechaza periodo imposible %s", async (periodoYyyymm) => {
    expect(
      (await post("/partners/payouts", { partnerId, periodoYyyymm, metodoPago: "spei" }))
        .statusCode,
    ).toBe(400);
  });
  it("rechaza porcentajes mayores a 100 enviados como texto", async () => {
    const result = await app.inject({
      method: "PATCH",
      url: `/partners/${partnerId}`,
      headers: auth(),
      payload: { comisionPctOverride: "999" },
    });
    expect(result.statusCode).toBe(400);
  });
});

describe("dominio propio completo", () => {
  it("dos negocios no pueden tomar el mismo host simultáneamente", async () => {
    const host = "race-platform.example.invalid";
    try {
      const attempts = await Promise.allSettled(
        ["qa-alpha", "qa-beta"].map((slug) =>
          sincronizarDominioMaster(masterPrisma, slug, {
            subdominio: slug,
            dominioPropio: host,
            dominioVerificado: false,
          }),
        ),
      );
      expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = attempts.find((r) => r.status === "rejected");
      expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(DominioEnUsoError);
      const registration = await masterPrisma.tiendaDominio.findUniqueOrThrow({ where: { host } });
      expect(["qa-alpha", "qa-beta"]).toContain(registration.tenantSlug);
    } finally {
      await masterPrisma.tiendaDominio.deleteMany({
        where: { tenantSlug: { in: ["qa-alpha", "qa-beta"] } },
      });
    }
  });

  it("conecta, verifica TXT, resuelve y desconecta sin conservar un host público", async () => {
    const domain = "qa-platform.example.invalid";
    const put = (dominioPropio: string | null) =>
      app.inject({
        method: "PUT",
        url: "/t/ecommerce/config",
        headers: ownerAuth(),
        payload: { nombre: "QA", subdominio: "qa-platform", dominioPropio },
      });
    const saved = await put(domain);
    expect([200, 201]).toContain(saved.statusCode);
    expect(saved.json().dominioVerificado).toBe(false);
    vi.spyOn(dns, "resolveTxt").mockResolvedValue([
      [`gaessoft-verify=${saved.json().dominioTokenVerificacion}`],
    ]);
    const verified = await app.inject({
      method: "POST",
      url: "/t/ecommerce/dominio/verificar",
      headers: ownerAuth(),
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().verificado).toBe(true);
    const resolved = await app.inject({
      method: "GET",
      url: `/public/storefront/resolve?host=${domain}`,
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().tenantSlug).toBe(SLUG);
    expect([200, 201]).toContain((await put(null)).statusCode);
    expect(
      (await app.inject({ method: "GET", url: `/public/storefront/resolve?host=${domain}` }))
        .statusCode,
    ).toBe(404);
  });
});

describe("cobros sin proveedor fuera del modo de prueba", () => {
  it.each(["payment-methods", "setup-intent", "connect/onboard"])(
    "POST /billing/%s responde claramente 503, sin generar un error interno",
    async (endpoint) => {
      vi.stubEnv("NODE_ENV", "production");
      try {
        const response = await app.inject({
          method: "POST",
          url: `/billing/${endpoint}`,
          headers: ownerAuth(),
          payload: endpoint === "payment-methods" ? { type: "card", last4: "4242" } : {},
        });
        expect(response.statusCode).toBe(503);
        expect(response.json().message).not.toBe("Algo salió mal");
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it("no guarda tarjetas inventadas en producción", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(
        agregarPaymentMethod(masterPrisma, tenantId, { type: "card", last4: "4242" }),
      ).rejects.toMatchObject({ statusCode: 503 });
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("no marca como pagada una factura usando mock en producción", async () => {
    const pm = await agregarPaymentMethod(masterPrisma, tenantId, {
      type: "card",
      setDefault: true,
    });
    const inv = await invoice();
    await masterPrisma.invoice.update({
      where: { id: inv.id },
      data: { dueDate: new Date(), nextRetryAt: new Date() },
    });
    vi.stubEnv("NODE_ENV", "production");
    try {
      await correrDunningCiclo(masterPrisma);
      expect(
        (await masterPrisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status,
      ).not.toBe("paid");
      expect(
        await masterPrisma.invoicePayment.count({
          where: { invoiceId: inv.id, status: "succeeded" },
        }),
      ).toBe(0);
    } finally {
      vi.unstubAllEnvs();
      await masterPrisma.paymentMethod.delete({ where: { id: pm.id } });
    }
  });
});
