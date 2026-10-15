/** Browser mutations are allowed only in the disposable localhost QA database created by the runner. */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const { authenticator } = require(`${process.cwd()}/apps/api/node_modules/otplib`);
const { PrismaClient } = require(`${process.cwd()}/packages/db/src/generated/master/index.js`);
const url = new URL(process.env.DATABASE_URL_MASTER);
assert(
  ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/qa_platform_\d+$/.test(url.pathname),
);
const base = process.env.PLATFORM_TEST_URL;
assert.equal(new URL(base).hostname, "127.0.0.1");
const account = JSON.parse(fs.readFileSync(process.env.PLATFORM_FLOW_ACCOUNTS)).find(
  (a) => a.role === "superadmin",
);
const db = new PrismaClient();
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await context.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const request = context.request;
    let response = await request.post(`${base}/api/auth/login`, {
      data: { email: account.email, password: account.password },
    });
    assert.equal(response.status(), 200);
    const challenge = await response.json();
    response = await request.post(`${base}/api/auth/mfa/setup`, {
      headers: { Authorization: `Bearer ${challenge.mfaToken}` },
    });
    assert.equal(response.status(), 200);
    const { secret } = await response.json();
    if (Date.now() % 30000 > 26000) await p.waitForTimeout(4500);
    response = await request.post(`${base}/api/auth/mfa/activate`, {
      headers: { Authorization: `Bearer ${challenge.mfaToken}` },
      data: { code: authenticator.generate(secret) },
    });
    assert.equal(response.status(), 200);
    const { accessToken } = await response.json();
    await p.addInitScript((t) => localStorage.setItem("gaespos_super_token", t), accessToken);
    await p.goto(base);
    await p.locator("aside nav button").first().waitFor();
    const go = async (label) => {
      if (await p.getByRole("button", { name: "Menú", exact: true }).isVisible())
        await p.getByRole("button", { name: "Menú", exact: true }).click();
      await p.locator("aside nav button").filter({ hasText: label }).click();
      await p.waitForTimeout(100);
      await p.waitForLoadState("networkidle");
    };
    const modal = p.locator(".gx-modal-panel");
    const field = (label) =>
      modal
        .getByText(label, { exact: true })
        .locator("..")
        .locator("input,select,textarea")
        .first();
    const action = async (method, path, fn, status) => {
      const done = p.waitForResponse(
        (r) => new URL(r.url()).pathname === `/api${path}` && r.request().method() === method,
      );
      await fn();
      const r = await done;
      assert.equal(r.status(), status, `${method} ${path}`);
      return r;
    };
    await go("Planes y cupones");
    await p.getByRole("button", { name: "+ Nuevo plan", exact: true }).click();
    await field("Código (identificador, va en el alta de clientes)").fill("qa-ui-plan");
    await field("Nombre").fill("QA plan navegador");
    await field("Precio (por mes)").fill("499.90");
    await action(
      "POST",
      "/admin/catalogo/planes",
      () => modal.getByRole("button", { name: "Guardar", exact: true }).click(),
      201,
    );
    await modal.waitFor({ state: "hidden" });
    const plan = await db.plan.findUniqueOrThrow({
      where: { code: "qa-ui-plan" },
      include: { prices: true },
    });
    assert.equal(plan.prices[0].unitAmount, 49990);
    console.log("PASS create plan with blank optional description; monthly charge price persisted");
    await go("Clientes");
    await p.getByRole("button", { name: "+ Crear cliente", exact: true }).click();
    await modal.getByLabel("Nombre del negocio", { exact: true }).fill("QA tienda navegador");
    await modal.getByLabel(/Slug/).fill("qa-ui-store");
    await modal.getByLabel(/^Plan/).selectOption("qa-ui-plan");
    await modal.getByLabel("Correo del dueño", { exact: true }).fill("qa-ui-owner@example.invalid");
    await modal.getByLabel("Contraseña", { exact: true }).fill("QaOwnerTest!2026");
    await action(
      "POST",
      "/admin/tenants",
      () => modal.getByRole("button", { name: "Crear cliente", exact: true }).click(),
      201,
    );
    await modal.getByRole("button", { name: "Listo", exact: true }).click();
    await modal.waitFor({ state: "hidden" });
    response = await request.post(`${base}/api/auth/tenant/login`, {
      data: { email: "qa-ui-owner@example.invalid", password: "QaOwnerTest!2026" },
    });
    assert.equal(response.status(), 200);
    const ownerToken = (await response.json()).accessToken;
    const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
    response = await request.get(`${base}/api/billing/me`, { headers: ownerHeaders });
    assert.equal(response.status(), 200);
    const billing = await response.json();
    assert.equal(billing.subscription.status, "trialing");
    const tenantId = billing.tenant.id;
    console.log("PASS create store via UI, owner login without slug, initial trial subscription");
    await p.setViewportSize({ width: 320, height: 740 });
    const manage = async () => {
      await go("Clientes");
      await p
        .locator("tr")
        .filter({ hasText: "qa-ui-store" })
        .getByRole("button", { name: "Gestionar", exact: true })
        .click();
      await modal.getByRole("heading", { name: "Gestionar cliente", exact: true }).waitFor();
    };
    await manage();
    await action(
      "PATCH",
      "/admin/tenants/qa-ui-store/estado",
      () => modal.getByRole("button", { name: "Suspender", exact: true }).click(),
      200,
    );
    await modal.waitFor({ state: "hidden" });
    assert.equal(
      (await request.get(`${base}/api/t/productos`, { headers: ownerHeaders })).status(),
      403,
    );
    assert.equal(
      (await request.get(`${base}/api/billing/me`, { headers: ownerHeaders })).status(),
      200,
    );
    await manage();
    await action(
      "PATCH",
      "/admin/tenants/qa-ui-store/estado",
      () => modal.getByRole("button", { name: "Reactivar", exact: true }).click(),
      200,
    );
    await modal.waitFor({ state: "hidden" });
    assert.equal(
      (await request.get(`${base}/api/t/productos`, { headers: ownerHeaders })).status(),
      200,
    );
    await manage();
    await modal.locator("select").first().selectOption("growth");
    await action(
      "PATCH",
      "/admin/tenants/qa-ui-store/plan",
      () => modal.getByRole("button", { name: "Cambiar plan", exact: true }).click(),
      200,
    );
    await modal.waitFor({ state: "hidden" });
    assert.equal(
      (
        await db.subscription.findUniqueOrThrow({
          where: { id: billing.subscription.id },
          include: { plan: true },
        })
      ).plan.code,
      "growth",
    );
    console.log(
      "PASS mobile suspension blocks original session, billing stays accessible, reactivation and plan change persist",
    );
    await db.invoice.createMany({
      data: Array.from({ length: 53 }, (_, i) => ({
        tenantId,
        invoiceNumber: `QA-UI-${String(i).padStart(3, "0")}`,
        status: "open",
        subtotal: 39900,
        total: 39900,
        currency: "MXN",
        dueDate: new Date("2099-01-01"),
        createdAt: new Date(Date.now() + i * 1000),
      })),
    });
    await go("Facturas");
    await p.getByRole("status").filter({ hasText: "53 facturas" }).waitFor();
    assert.equal(await p.locator("tbody tr").count(), 50);
    assert((await p.locator("tbody tr").first().innerText()).includes("$399.00"));
    await p.getByRole("button", { name: "Siguiente", exact: true }).click();
    await p.getByRole("status").filter({ hasText: "Página 2 de 2" }).waitFor();
    assert.equal(await p.locator("tbody tr").count(), 3);
    await p.getByRole("button", { name: "Anterior", exact: true }).click();
    await p.getByRole("status").filter({ hasText: "Página 1 de 2" }).waitFor();
    const inv = await db.invoice.findUniqueOrThrow({ where: { invoiceNumber: "QA-UI-052" } });
    const row = p.locator("tr").filter({ hasText: "QA-UI-052" });
    await action(
      "POST",
      `/admin/billing-ops/invoices/${inv.id}/reintentar`,
      () => row.getByRole("button", { name: "Reprogramar cobro", exact: true }).click(),
      200,
    );
    assert((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).nextRetryAt);
    await row.getByRole("button", { name: "Anular", exact: true }).click();
    await modal.getByRole("button", { name: "Anular factura", exact: true }).click();
    await modal.getByText("Escribe el motivo (mín. 3 caracteres)", { exact: true }).waitFor();
    await modal.locator("textarea").fill("Prueba desechable de anulación");
    await action(
      "POST",
      `/admin/billing-ops/invoices/${inv.id}/void`,
      () => modal.getByRole("button", { name: "Anular factura", exact: true }).click(),
      200,
    );
    await modal.waitFor({ state: "hidden" });
    await row.getByText("Anulada", { exact: true }).waitFor();
    assert.equal(
      await row.getByRole("button", { name: "Reprogramar cobro", exact: true }).count(),
      0,
    );
    console.log(
      "PASS mobile invoices: cents formatted, both pages reachable, retry, reason validation, void persisted and final state blocks writes",
    );
    await go("Planes y cupones");
    await p.locator("main").getByRole("button", { name: "Cupones", exact: true }).click();
    await p.getByRole("button", { name: "+ Nuevo cupón", exact: true }).click();
    await field("Código (lo que teclea el cliente)").fill("QAUI20");
    await field("Nombre interno").fill("QA cupón navegador");
    await field("Porcentaje").fill("20");
    await action(
      "POST",
      "/admin/catalogo/cupones",
      () => modal.getByRole("button", { name: "Guardar", exact: true }).click(),
      201,
    );
    await modal.waitFor({ state: "hidden" });
    response = await request.post(`${base}/api/billing/subscription/coupon`, {
      headers: ownerHeaders,
      data: { code: "QAUI20" },
    });
    assert.equal(response.status(), 200);
    assert.equal(
      (
        await db.subscription.findUniqueOrThrow({
          where: { id: billing.subscription.id },
          include: { discountCoupon: true },
        })
      ).discountCoupon.code,
      "QAUI20",
    );
    console.log("PASS coupon created in mobile UI and applied to owner subscription");
    await go("Partners");
    await p.getByRole("button", { name: "+ Nuevo partner", exact: true }).click();
    await field("Código").fill("qa-ui-partner");
    await field("Razón social").fill("QA partner navegador");
    await field("Correo de contacto").fill("qa-ui-partner@example.invalid");
    await action(
      "POST",
      "/partners",
      () => modal.getByRole("button", { name: "Crear partner", exact: true }).click(),
      201,
    );
    await modal.waitFor({ state: "hidden" });
    const partner = await db.partner.findUniqueOrThrow({ where: { codigo: "qa-ui-partner" } });
    const link = await db.partnerLink.create({
      data: { partnerId: partner.id, slug: "qa-ui-link", nombre: "QA", targetPath: "/signup" },
    });
    const referral = await db.referral.create({
      data: { partnerId: partner.id, linkId: link.id, tenantId, estado: "paying" },
    });
    const commission = await db.commission.create({
      data: {
        partnerId: partner.id,
        referralId: referral.id,
        tenantId,
        periodoYyyymm: "202610",
        montoBaseTenantPaid: "399",
        porcentajeAplicado: "25",
        montoComision: "99.75",
      },
    });
    await p.locator("main").getByRole("button", { name: "Comisiones", exact: true }).click();
    await action(
      "POST",
      `/partners/commissions/${commission.id}/aprobar`,
      () =>
        p
          .locator("tr")
          .filter({ hasText: "QA partner navegador" })
          .getByRole("button", { name: "Aprobar", exact: true })
          .click(),
      204,
    );
    await p
      .locator("tr")
      .filter({ hasText: "QA partner navegador" })
      .getByText("Aprobada", { exact: true })
      .waitFor();
    await p.locator("main").getByRole("button", { name: "Payouts", exact: true }).click();
    await p.getByRole("button", { name: "+ Generar payout", exact: true }).click();
    await field("Partner").selectOption(partner.id);
    await field("Periodo (AAAAMM)").fill("202613");
    await modal.getByRole("button", { name: "Generar", exact: true }).click();
    await modal.getByText("Elige partner y un periodo válido (AAAAMM)", { exact: true }).waitFor();
    await field("Periodo (AAAAMM)").fill("202610");
    await action(
      "POST",
      "/partners/payouts",
      () => modal.getByRole("button", { name: "Generar", exact: true }).click(),
      201,
    );
    await modal.waitFor({ state: "hidden" });
    const payout = await db.payout.findUniqueOrThrow({
      where: { partnerId_periodoYyyymm: { partnerId: partner.id, periodoYyyymm: "202610" } },
    });
    assert.equal(payout.montoNeto.toString(), "99.75");
    await p
      .locator("tr")
      .filter({ hasText: "QA partner navegador" })
      .getByRole("button", { name: "Marcar pagado", exact: true })
      .click();
    await field("Folio bancario").fill("QA-SIN-TRANSFERENCIA");
    await action(
      "POST",
      `/partners/payouts/${payout.id}/marcar-pagado`,
      () => modal.getByRole("button", { name: "Confirmar pago", exact: true }).click(),
      204,
    );
    await modal.waitFor({ state: "hidden" });
    assert.equal(
      (await db.commission.findUniqueOrThrow({ where: { id: commission.id } })).estado,
      "pagada",
    );
    assert.equal(
      (await db.payout.findUniqueOrThrow({ where: { id: payout.id } })).folioBancario,
      "QA-SIN-TRANSFERENCIA",
    );
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS mobile partner create, commission approve, invalid period, payout create and manual payment record; no bank transfer",
    );
    await context.close();
  } finally {
    await browser.close();
    await db.$disconnect();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
