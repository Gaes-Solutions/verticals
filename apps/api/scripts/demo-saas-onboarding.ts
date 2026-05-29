/**
 * Demo end-to-end Hito 6 — Negocio SaaS self-serve.
 *
 * Simula el ciclo comercial completo contra una API live:
 *   1. Signup público (un cliente nuevo se registra solo en la web).
 *   2. Agrega tarjeta y aplica cupón de lanzamiento.
 *   3. Upgrade prorrateado de plan (Starter → Pro).
 *   4. Vencimiento del trial → conversión a paid + CFDI mock.
 *   5. Webhook externo confirma una invoice.
 *   6. Dunning: 3 cobros fallidos → suspensión automática del tenant.
 *
 * Uso: pnpm --filter @gaespos/api demo:saas-onboarding
 */

import { masterPrisma } from "@gaespos/db";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@gaessoft.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

const SUFFIX = Date.now().toString(36);
const SLUG = `demo-saas-${SUFFIX}`;
const ADMIN_TENANT_EMAIL = `owner-${SUFFIX}@demo.mx`;
const ADMIN_TENANT_PASSWORD = "Owner!2026";
const COUPON_CODE = `LAUNCH-${SUFFIX.toUpperCase()}`;

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

let stepNum = 0;
function step(title: string): void {
  stepNum += 1;
  console.log(`\n${c.bold}${c.cyan}━━━ Paso ${stepNum}: ${title}${c.reset}`);
}
function ok(line: string): void {
  console.log(`  ${c.green}✓${c.reset} ${line}`);
}
function info(line: string): void {
  console.log(`  ${c.dim}${line}${c.reset}`);
}
function moneyMX(cents: number): string {
  return `${c.yellow}$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${c.reset}`;
}

interface R<T = unknown> {
  status: number;
  body: T;
}
async function call<T = unknown>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<R<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}
function assertOk(r: R, expected: number, ctx: string): void {
  if (r.status !== expected) {
    console.error(`\n${c.red}✗ ${ctx}: esperaba ${expected}, recibió ${r.status}${c.reset}`);
    console.error(`${c.red}  ${JSON.stringify(r.body)}${c.reset}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log(`${c.bold}${c.magenta}Demo Hito 6 — Negocio SaaS self-serve${c.reset}`);
  console.log(`${c.dim}API: ${API_URL} · tenant: ${SLUG}${c.reset}`);

  step("Cupón de lanzamiento creado por el equipo GaesSoft");
  const coupon = await masterPrisma.coupon.create({
    data: {
      code: COUPON_CODE,
      name: "Lanzamiento 20% off",
      discountType: "percent",
      discountValue: 20,
      duration: "once",
      isActive: true,
    },
  });
  ok(`cupón ${c.bold}${coupon.code}${c.reset} (20% off, una vez) listo para entregar`);

  step("Un cliente nuevo se registra solo en la web (signup self-serve)");
  const signup = await call<{
    accessToken: string;
    tenant: { id: string; status: string; trialEndsAt: string };
    subscription: { id: string; status: string; trialEnd: string };
  }>("POST", "/auth/signup", {
    body: {
      slug: SLUG,
      name: "Tienda Nueva",
      legalName: "Tienda Nueva S.A. de C.V.",
      vertical: "retail_mayoreo",
      currency: "MXN",
      rfc: "TNV950101AAA",
      planCode: "starter",
      billingEmail: `billing-${SUFFIX}@demo.mx`,
      adminEmail: ADMIN_TENANT_EMAIL,
      adminPassword: ADMIN_TENANT_PASSWORD,
      adminName: "Dueño Demo",
      couponCode: COUPON_CODE,
    },
  });
  assertOk(signup, 201, "signup");
  const tenantId = signup.body.tenant.id;
  const subscriptionId = signup.body.subscription.id;
  const adminToken = signup.body.accessToken;
  ok(
    `tenant ${c.bold}${SLUG}${c.reset} creado en plan Starter · trial 14d hasta ${signup.body.tenant.trialEndsAt.slice(0, 10)}`,
  );
  info(
    `subscription status: ${signup.body.subscription.status} · cupón ${COUPON_CODE} ya asociado`,
  );

  step("El dueño agrega su tarjeta como método de pago default");
  const pm = await call<{ id: string; last4: string }>("POST", "/billing/payment-methods", {
    token: adminToken,
    body: {
      type: "card",
      setDefault: true,
      last4: "4242",
      brand: "visa",
      expMonth: 12,
      expYear: 2030,
    },
  });
  assertOk(pm, 201, "payment method");
  ok(`tarjeta •••• ${pm.body.last4} (visa) registrada como default`);

  step("Upgrade en frío: Starter → Pro a mitad de período (prorrateo)");
  const upgrade = await call<{ invoiceId: string; amount: number; daysRemaining: number }>(
    "POST",
    "/billing/subscription/change-plan",
    { token: adminToken, body: { planCode: "growth" } },
  );
  assertOk(upgrade, 200, "upgrade");
  ok(
    `invoice prorrateada generada por ${moneyMX(upgrade.body.amount)} (${upgrade.body.daysRemaining} días restantes)`,
  );

  step("Login admin GaesSoft para correr los workers de billing");
  const admin = await call<{ accessToken: string }>("POST", "/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assertOk(admin, 200, "admin login");
  const adminGaesToken = admin.body.accessToken;

  step("Vence el trial → worker convierte a paid (CFDI mock emitido)");
  await masterPrisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      trialEnd: new Date(Date.now() - 60000),
      currentPeriodEnd: new Date(Date.now() - 60000),
    },
  });
  const trialRun = await call<{ procesados: number; cobrados: number; fallidos: number }>(
    "POST",
    "/admin/billing/run-trial-conversions",
    { token: adminGaesToken },
  );
  assertOk(trialRun, 200, "trial conversion");
  ok(
    `worker corrió: ${trialRun.body.procesados} procesados · ${c.green}${trialRun.body.cobrados} cobrados${c.reset} · ${trialRun.body.fallidos} fallidos`,
  );

  const invs = await call<
    Array<{ status: string; cfdiUuid: string | null; total: number; currency: string }>
  >("GET", "/billing/invoices", { token: adminToken });
  const cfdi = invs.body.find((i) => i.status === "paid" && i.cfdiUuid)?.cfdiUuid;
  info(`invoices del tenant: ${invs.body.length} · CFDI mock emitido: ${cfdi ?? "—"}`);

  step("Otro upgrade + confirmación vía webhook externo (mock)");
  const upgrade2 = await call<{ invoiceId: string; amount: number }>(
    "POST",
    "/billing/subscription/change-plan",
    { token: adminToken, body: { planCode: "scale" } },
  );
  assertOk(upgrade2, 200, "upgrade pro→business");
  const webhook = await call<{ paid: boolean; cfdiUuid: string }>("POST", "/billing/webhook", {
    body: { invoiceId: upgrade2.body.invoiceId },
  });
  assertOk(webhook, 200, "webhook");
  ok(
    `webhook confirmó invoice ${moneyMX(upgrade2.body.amount)} → cfdi ${c.bold}${webhook.body.cfdiUuid.slice(0, 20)}…${c.reset}`,
  );

  step("Dunning: simulamos 3 cobros fallidos → tenant SUSPENDED");
  await call("POST", "/admin/billing/mock-set-failures", {
    token: adminGaesToken,
    body: { paymentMethodId: pm.body.id, fails: 5 },
  });
  const inv = await masterPrisma.invoice.create({
    data: {
      tenantId,
      subscriptionId,
      invoiceNumber: `INV-DUNN-${SUFFIX}`,
      status: "open",
      subtotal: 149900,
      total: 149900,
      currency: "MXN",
      dueDate: new Date(Date.now() - 86400000),
      items: {
        create: {
          description: "Suscripción Business",
          quantity: 1,
          unitAmount: 149900,
          amount: 149900,
        },
      },
    },
  });
  for (let i = 1; i <= 3; i++) {
    const r = await call<{ procesados: number; cobrados: number; suspendidos: number }>(
      "POST",
      "/admin/billing/run-dunning",
      { token: adminGaesToken },
    );
    const upd = await masterPrisma.invoice.findUnique({ where: { id: inv.id } });
    info(
      `intento ${i}: attempts=${upd?.attempts} status=${upd?.status} (cobrados ${r.body.cobrados}, suspendidos ${r.body.suspendidos})`,
    );
    if (i < 3) {
      await masterPrisma.invoice.update({
        where: { id: inv.id },
        data: { nextRetryAt: new Date(Date.now() - 1000) },
      });
    }
  }
  const tenantFinal = await masterPrisma.tenant.findUnique({ where: { id: tenantId } });
  const subFinal = await masterPrisma.subscription.findUnique({ where: { id: subscriptionId } });
  ok(
    `tras 3 fallos → tenant.status=${c.red}${tenantFinal?.status}${c.reset} · subscription.status=${c.red}${subFinal?.status}${c.reset}`,
  );

  await masterPrisma.$disconnect();
  console.log(
    `\n${c.bold}${c.green}✓ Demo Hito 6 completo — signup → cupón → upgrade prorrateado → trial→paid → webhook → dunning${c.reset}\n`,
  );
  process.exit(0);
}

main().catch(async (err) => {
  console.error(`${c.red}Demo falló:${c.reset}`, err);
  await masterPrisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
