import { randomUUID } from "node:crypto";
import {
  aplicarCupon,
  calcularProrrateo,
  formatInvoiceNumber,
  siguienteDunning,
  siguientePeriodo,
} from "@gaespos/billing";
import {
  type Invoice,
  type MasterPrismaClient,
  type Subscription,
  type Tenant,
  type TenantUserAdmin,
  onboardTenant,
  seedTenantDefaults,
} from "@gaespos/db";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { stripeBilling } from "./stripe.js";

export class BillingError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

const TRIAL_DAYS = 14;

function daysFromNow(d: number): Date {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock charge — orquesta el "cobro" al payment method. Reemplazable por Stripe
// real conservando la firma (success → externalChargeId; fail → failureReason).
// Tests/demos manipulan `mockChargeFailures` para simular fallos.
// ─────────────────────────────────────────────────────────────────────────────

const mockChargeFailures = new Map<string, number>();

export function setMockChargeFailures(paymentMethodId: string, fails: number): void {
  mockChargeFailures.set(paymentMethodId, fails);
}

export function clearMockChargeFailures(): void {
  mockChargeFailures.clear();
}

async function mockCobrar(
  paymentMethodId: string,
): Promise<{ success: boolean; externalChargeId?: string; failureReason?: string }> {
  const pendingFails = mockChargeFailures.get(paymentMethodId) ?? 0;
  if (pendingFails > 0) {
    mockChargeFailures.set(paymentMethodId, pendingFails - 1);
    return { success: false, failureReason: "Tarjeta declinada (mock)" };
  }
  return { success: true, externalChargeId: `ch_mock_${randomUUID().slice(0, 12)}` };
}

// Cobra la suscripción: usa Stripe (off-session) si está configurado y el tenant
// tiene customer + tarjeta real de Stripe; si no, cae al mock. `invoice.total` ya
// está en centavos. Idempotency por invoice para no duplicar el cobro en reintentos.
async function cobrarSuscripcion(
  invoice: { id: string; total: number; currency: string; invoiceNumber: string },
  tenant: { stripeCustomerId: string | null },
  pm: { id: string; externalMethodId: string | null },
): Promise<{ success: boolean; externalChargeId?: string; failureReason?: string }> {
  const stripe = stripeBilling();
  const customerId = tenant.stripeCustomerId;
  const pmId = pm.externalMethodId;
  const esTarjetaStripe = !!pmId && pmId.startsWith("pm_") && !pmId.startsWith("pm_mock_");
  if (stripe && customerId && pmId && esTarjetaStripe) {
    const r = await stripe.cobrarOffSession({
      customerId,
      paymentMethodId: pmId,
      montoCentavos: invoice.total,
      moneda: invoice.currency,
      descripcion: `Suscripción ${invoice.invoiceNumber}`,
      idempotencyKey: `inv_${invoice.id}`,
    });
    return {
      success: r.success,
      ...(r.chargeId ? { externalChargeId: r.chargeId } : {}),
      ...(r.failureReason ? { failureReason: r.failureReason } : {}),
    };
  }
  return mockCobrar(pm.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Signup público + auth admin tenant
// ─────────────────────────────────────────────────────────────────────────────

export interface SignupInput {
  slug: string;
  name: string;
  legalName?: string | undefined;
  vertical:
    | "retail_mayoreo"
    | "abarrotes"
    | "salud_vet"
    | "salud_humana"
    | "despacho_contable"
    | "otro";
  country?: string | undefined;
  currency?: string | undefined;
  rfc?: string | undefined;
  planCode: string;
  interval?: "monthly" | "yearly" | undefined;
  billingEmail: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  partnerId?: string | undefined;
  couponCode?: string | undefined;
}

export interface SignupResult {
  tenant: Tenant;
  admin: TenantUserAdmin;
  subscription: Subscription;
}

async function resolverCuponSignup(
  master: MasterPrismaClient,
  code: string | undefined,
): Promise<string | undefined> {
  if (!code) return undefined;
  const coupon = await master.coupon.findUnique({ where: { code } });
  return coupon?.isActive ? coupon.id : undefined;
}

function tenantUpdateDataFromSignup(input: SignupInput, currency: string, trialEnd: Date) {
  const data: Record<string, unknown> = {
    vertical: input.vertical,
    country: input.country ?? "MX",
    currencyDefault: currency,
    trialEndsAt: trialEnd,
  };
  if (input.legalName !== undefined) data.legalName = input.legalName;
  if (input.rfc !== undefined) data.rfc = input.rfc;
  if (input.partnerId !== undefined) {
    data.partnerId = input.partnerId;
    data.partnerAttributedUntil = null;
  }
  return data;
}

export async function signupPublico(
  master: MasterPrismaClient,
  input: SignupInput,
): Promise<SignupResult> {
  if (!/^[a-z0-9-]{3,40}$/.test(input.slug)) {
    throw new BillingError(400, "Slug inválido (3-40 chars, [a-z0-9-])");
  }
  const existing = await master.tenant.findUnique({ where: { slug: input.slug } });
  if (existing) throw new BillingError(409, "Slug ya tomado");

  const plan = await master.plan.findUnique({ where: { code: input.planCode } });
  if (!plan || !plan.active) throw new BillingError(404, "Plan no encontrado o inactivo");

  const currency = input.currency ?? "MXN";
  const interval = input.interval ?? "monthly";
  const price = await master.planPrice.findUnique({
    where: { planId_currency_interval: { planId: plan.id, currency, interval } },
  });
  if (!price) throw new BillingError(400, `Plan sin precio para ${currency}/${interval}`);

  await onboardTenant({
    slug: input.slug,
    name: input.name,
    planCode: plan.code,
    vertical: input.vertical,
    ownerEmail: input.adminEmail,
    ownerPassword: input.adminPassword,
    ownerNombre: input.adminName,
  });

  const now = new Date();
  const trialEnd = daysFromNow(TRIAL_DAYS);
  const updated = await master.tenant.update({
    where: { slug: input.slug },
    data: tenantUpdateDataFromSignup(input, currency, trialEnd),
  });

  const passwordHash = await argon2Hash(input.adminPassword);
  const admin = await master.tenantUserAdmin.create({
    data: {
      tenantId: updated.id,
      email: input.adminEmail,
      passwordHash,
      name: input.adminName,
      roleAdmin: "owner",
      isPrimary: true,
    },
  });

  await master.tenantSettingsMaster.create({
    data: { tenantId: updated.id, billingEmail: input.billingEmail },
  });

  const couponId = await resolverCuponSignup(master, input.couponCode);
  const subscription = await master.subscription.create({
    data: {
      tenantId: updated.id,
      planId: plan.id,
      status: "trialing",
      currency,
      interval,
      trialStart: now,
      trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
      ...(couponId ? { discountCouponId: couponId } : {}),
    },
  });

  if (couponId) {
    await master.couponRedemption.create({
      data: { couponId, tenantId: updated.id, subscriptionId: subscription.id },
    });
    await master.coupon.update({
      where: { id: couponId },
      data: { timesRedeemed: { increment: 1 } },
    });
  }

  await seedTenantDefaults(input.slug).catch(() => undefined);

  return { tenant: updated, admin, subscription };
}

export interface AdminTenantPrincipal {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantSlug: string;
  roleAdmin: "owner" | "billing_only" | "viewer";
}

export async function loginAdminTenant(
  master: MasterPrismaClient,
  input: { tenantSlug: string; email: string; password: string },
): Promise<AdminTenantPrincipal> {
  const tenant = await master.tenant.findUnique({ where: { slug: input.tenantSlug } });
  if (!tenant) throw new BillingError(401, "Credenciales inválidas");
  const admin = await master.tenantUserAdmin.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: input.email } },
  });
  if (!admin || admin.archivedAt) throw new BillingError(401, "Credenciales inválidas");
  const ok = await argon2Verify(admin.passwordHash, input.password);
  if (!ok) throw new BillingError(401, "Credenciales inválidas");
  await master.tenantUserAdmin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    roleAdmin: admin.roleAdmin,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexto del admin tenant (mi suscripción, features, plan)
// ─────────────────────────────────────────────────────────────────────────────

export async function getBillingContext(
  master: MasterPrismaClient,
  tenantId: string,
): Promise<unknown> {
  const tenant = await master.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: { plan: { include: { features: true } } },
  });
  const subscription = await master.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { discountCoupon: true },
  });
  const paymentMethods = await master.paymentMethod.findMany({
    where: { tenantId },
    orderBy: { isDefault: "desc" },
  });
  return { tenant, subscription, paymentMethods };
}

export async function listInvoices(
  master: MasterPrismaClient,
  tenantId: string,
): Promise<unknown[]> {
  return master.invoice.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { items: true, payments: true },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment methods (mock)
// ─────────────────────────────────────────────────────────────────────────────

export interface AddPaymentMethodInput {
  type: "card" | "oxxo" | "spei" | "manual";
  setDefault?: boolean | undefined;
  last4?: string | undefined;
  brand?: string | undefined;
  expMonth?: number | undefined;
  expYear?: number | undefined;
}

export async function agregarPaymentMethod(
  master: MasterPrismaClient,
  tenantId: string,
  input: AddPaymentMethodInput,
) {
  if (input.setDefault) {
    await master.paymentMethod.updateMany({ where: { tenantId }, data: { isDefault: false } });
  }
  const has = await master.paymentMethod.count({ where: { tenantId } });
  return master.paymentMethod.create({
    data: {
      tenantId,
      type: input.type,
      isDefault: input.setDefault ?? has === 0,
      externalMethodId: `pm_mock_${randomUUID().slice(0, 12)}`,
      ...(input.last4 !== undefined ? { last4: input.last4 } : {}),
      ...(input.brand !== undefined ? { brand: input.brand } : {}),
      ...(input.expMonth !== undefined ? { expMonth: input.expMonth } : {}),
      ...(input.expYear !== undefined ? { expYear: input.expYear } : {}),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cupones
// ─────────────────────────────────────────────────────────────────────────────

export async function aplicarCuponASubscripcion(
  master: MasterPrismaClient,
  tenantId: string,
  code: string,
) {
  const coupon = await master.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.isActive) throw new BillingError(404, "Cupón no encontrado o inactivo");
  if (coupon.validUntil && coupon.validUntil < new Date()) {
    throw new BillingError(409, "Cupón vencido");
  }
  if (coupon.maxRedemptions && coupon.timesRedeemed >= coupon.maxRedemptions) {
    throw new BillingError(409, "Cupón agotado");
  }
  const yaRedimido = await master.couponRedemption.findUnique({
    where: { couponId_tenantId: { couponId: coupon.id, tenantId } },
  });
  if (yaRedimido) throw new BillingError(409, "Ya usaste este cupón");

  const sub = await master.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  if (!sub) throw new BillingError(404, "Sin suscripción");

  await master.subscription.update({
    where: { id: sub.id },
    data: { discountCouponId: coupon.id },
  });
  await master.couponRedemption.create({
    data: { couponId: coupon.id, tenantId, subscriptionId: sub.id },
  });
  await master.coupon.update({
    where: { id: coupon.id },
    data: { timesRedeemed: { increment: 1 } },
  });
  return {
    applied: true,
    couponCode: coupon.code,
    discount: coupon.discountValue,
    type: coupon.discountType,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cambio de plan (upgrade con prorrateo; downgrade no soportado V1)
// ─────────────────────────────────────────────────────────────────────────────

export async function cambiarPlan(
  master: MasterPrismaClient,
  tenantId: string,
  newPlanCode: string,
) {
  const sub = await master.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
  if (!sub) throw new BillingError(404, "Sin suscripción");
  if (sub.status !== "active" && sub.status !== "trialing") {
    throw new BillingError(409, `No se puede cambiar plan en estado ${sub.status}`);
  }
  const newPlan = await master.plan.findUnique({ where: { code: newPlanCode } });
  if (!newPlan || !newPlan.active) throw new BillingError(404, "Plan destino no encontrado");
  if (newPlan.id === sub.planId) {
    throw new BillingError(409, "Ya estás en ese plan");
  }
  if (newPlan.tierOrder < sub.plan.tierOrder) {
    throw new BillingError(
      400,
      "Downgrade no soportado V1 — toma efecto al final del período (próximamente)",
    );
  }

  const oldPrice = await master.planPrice.findUnique({
    where: {
      planId_currency_interval: {
        planId: sub.planId,
        currency: sub.currency,
        interval: sub.interval,
      },
    },
  });
  const newPrice = await master.planPrice.findUnique({
    where: {
      planId_currency_interval: {
        planId: newPlan.id,
        currency: sub.currency,
        interval: sub.interval,
      },
    },
  });
  if (!oldPrice || !newPrice) throw new BillingError(400, "Falta precio para esa moneda/intervalo");

  const now = new Date();
  const prorrateo = calcularProrrateo({
    oldUnitAmount: oldPrice.unitAmount,
    newUnitAmount: newPrice.unitAmount,
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    changeAt: now,
  });

  const invoice = await generarInvoiceProrrateo(master, sub.tenantId, sub.id, {
    description: `Prorrateo upgrade ${sub.plan.code} → ${newPlan.code}`,
    amount: prorrateo.amount,
    currency: sub.currency,
  });

  await master.subscription.update({
    where: { id: sub.id },
    data: { planId: newPlan.id },
  });

  return {
    invoiceId: invoice.id,
    amount: prorrateo.amount,
    daysRemaining: prorrateo.daysRemaining,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generación / cobro de invoices
// ─────────────────────────────────────────────────────────────────────────────

async function siguienteFolioInvoice(master: MasterPrismaClient): Promise<string> {
  const year = new Date().getFullYear();
  const count = await master.invoice.count({
    where: { invoiceNumber: { startsWith: `INV-${year}-` } },
  });
  return formatInvoiceNumber(year, count + 1);
}

async function generarInvoiceProrrateo(
  master: MasterPrismaClient,
  tenantId: string,
  subscriptionId: string,
  input: { description: string; amount: number; currency: string },
): Promise<Invoice> {
  const invoiceNumber = await siguienteFolioInvoice(master);
  return master.invoice.create({
    data: {
      tenantId,
      subscriptionId,
      invoiceNumber,
      status: "open",
      subtotal: input.amount,
      total: input.amount,
      currency: input.currency,
      dueDate: new Date(),
      items: {
        create: {
          description: input.description,
          quantity: 1,
          unitAmount: input.amount,
          amount: input.amount,
        },
      },
    },
  });
}

async function generarInvoiceCiclo(
  master: MasterPrismaClient,
  sub: {
    id: string;
    tenantId: string;
    planId: string;
    currency: string;
    interval: "monthly" | "yearly";
    discountCouponId: string | null;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  },
  plan: { code: string; name: string },
): Promise<Invoice> {
  const price = await master.planPrice.findUnique({
    where: {
      planId_currency_interval: {
        planId: sub.planId,
        currency: sub.currency,
        interval: sub.interval,
      },
    },
  });
  if (!price) throw new BillingError(400, "Plan sin precio para esa moneda/intervalo");

  let total = price.unitAmount;
  let discount = 0;
  if (sub.discountCouponId) {
    const coupon = await master.coupon.findUnique({ where: { id: sub.discountCouponId } });
    if (coupon) {
      const r = aplicarCupon(total, {
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      });
      total = r.amountAfter;
      discount = r.discountApplied;
    }
  }

  const invoiceNumber = await siguienteFolioInvoice(master);
  const items: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    amount: number;
  }> = [
    {
      description: `Suscripción ${plan.name} (${sub.currency} ${sub.interval})`,
      quantity: 1,
      unitAmount: price.unitAmount,
      amount: price.unitAmount,
    },
  ];
  if (discount > 0) {
    items.push({
      description: "Descuento cupón",
      quantity: 1,
      unitAmount: -discount,
      amount: -discount,
    });
  }

  return master.invoice.create({
    data: {
      tenantId: sub.tenantId,
      subscriptionId: sub.id,
      invoiceNumber,
      status: "open",
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      subtotal: price.unitAmount,
      tax: 0,
      total,
      currency: sub.currency,
      dueDate: new Date(),
      items: { create: items },
    },
  });
}

async function generarCfdiMock(): Promise<string> {
  return `cfdi-mock-${randomUUID()}`;
}

async function intentarPagoInvoice(
  master: MasterPrismaClient,
  invoiceId: string,
): Promise<{ success: boolean; failureReason?: string }> {
  const invoice = await master.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { tenant: { include: { paymentMethods: { where: { isDefault: true }, take: 1 } } } },
  });
  if (invoice.status === "paid") return { success: true };

  const pm = invoice.tenant.paymentMethods[0];
  if (!pm) {
    await master.invoicePayment.create({
      data: {
        invoiceId,
        amount: invoice.total,
        currency: invoice.currency,
        status: "failed",
        failureReason: "Sin método de pago default",
      },
    });
    return { success: false, failureReason: "Sin método de pago default" };
  }

  const charge = await cobrarSuscripcion(invoice, invoice.tenant, pm);
  await master.invoicePayment.create({
    data: {
      invoiceId,
      amount: invoice.total,
      currency: invoice.currency,
      paymentMethodId: pm.id,
      status: charge.success ? "succeeded" : "failed",
      ...(charge.externalChargeId ? { externalChargeId: charge.externalChargeId } : {}),
      ...(charge.failureReason ? { failureReason: charge.failureReason } : {}),
      ...(charge.success ? { paidAt: new Date() } : {}),
    },
  });

  if (charge.success) {
    const cfdiUuid = await generarCfdiMock();
    await master.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "paid",
        paidAt: new Date(),
        cfdiUuid,
        cfdiPdfUrl: `https://mock.cfdi/${cfdiUuid}.pdf`,
        attempts: { increment: 1 },
      },
    });
    return { success: true };
  }
  return {
    success: false,
    ...(charge.failureReason ? { failureReason: charge.failureReason } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook mock (confirmación de pago externa)
// ─────────────────────────────────────────────────────────────────────────────

export async function procesarWebhookPagoMock(
  master: MasterPrismaClient,
  invoiceId: string,
): Promise<{ paid: boolean; cfdiUuid?: string }> {
  const invoice = await master.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new BillingError(404, "Invoice no encontrada");
  if (invoice.status === "paid") {
    return { paid: true, ...(invoice.cfdiUuid ? { cfdiUuid: invoice.cfdiUuid } : {}) };
  }
  const cfdiUuid = await generarCfdiMock();
  const updated = await master.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "paid",
      paidAt: new Date(),
      cfdiUuid,
      cfdiPdfUrl: `https://mock.cfdi/${cfdiUuid}.pdf`,
    },
  });
  await master.invoicePayment.create({
    data: {
      invoiceId,
      amount: updated.total,
      currency: updated.currency,
      status: "succeeded",
      externalChargeId: `ch_webhook_${randomUUID().slice(0, 12)}`,
      paidAt: new Date(),
    },
  });
  if (updated.subscriptionId) {
    await master.subscription.update({
      where: { id: updated.subscriptionId },
      data: { status: "active" },
    });
  }
  return { paid: true, cfdiUuid };
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker: conversión de trial → cobro al vencer
// ─────────────────────────────────────────────────────────────────────────────

export async function correrTrialConversions(master: MasterPrismaClient): Promise<{
  procesados: number;
  cobrados: number;
  fallidos: number;
}> {
  const now = new Date();
  const vencidos = await master.subscription.findMany({
    where: { status: "trialing", trialEnd: { lte: now } },
    include: { plan: true },
  });
  let cobrados = 0;
  let fallidos = 0;

  for (const sub of vencidos) {
    const period = siguientePeriodo(sub.currentPeriodEnd, sub.interval);
    await master.subscription.update({
      where: { id: sub.id },
      data: {
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        status: "active",
      },
    });
    const newSub = await master.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    const invoice = await generarInvoiceCiclo(
      master,
      {
        id: newSub.id,
        tenantId: newSub.tenantId,
        planId: newSub.planId,
        currency: newSub.currency,
        interval: newSub.interval,
        discountCouponId: newSub.discountCouponId,
        currentPeriodStart: newSub.currentPeriodStart,
        currentPeriodEnd: newSub.currentPeriodEnd,
      },
      { code: sub.plan.code, name: sub.plan.name },
    );

    const res = await intentarPagoInvoice(master, invoice.id);
    if (res.success) {
      cobrados += 1;
      await master.tenant.update({ where: { id: sub.tenantId }, data: { status: "active" } });
    } else {
      fallidos += 1;
      const decision = siguienteDunning({ attemptsSoFar: 0, dueDate: invoice.dueDate });
      if (decision.action === "retry") {
        await master.invoice.update({
          where: { id: invoice.id },
          data: { nextRetryAt: decision.nextRetryAt, attempts: 1 },
        });
      }
      await master.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } });
      await master.tenant.update({ where: { id: sub.tenantId }, data: { status: "past_due" } });
    }
  }
  return { procesados: vencidos.length, cobrados, fallidos };
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker: dunning de invoices vencidas
// ─────────────────────────────────────────────────────────────────────────────

async function suspenderPorMora(
  master: MasterPrismaClient,
  invoice: { id: string; tenantId: string; subscriptionId: string | null },
  updateInvoiceData: Record<string, unknown> = { status: "uncollectible" },
): Promise<void> {
  await master.invoice.update({ where: { id: invoice.id }, data: updateInvoiceData });
  if (invoice.subscriptionId) {
    await master.subscription.update({
      where: { id: invoice.subscriptionId },
      data: { status: "unpaid" },
    });
  }
  await master.tenant.update({ where: { id: invoice.tenantId }, data: { status: "suspended" } });
}

async function reactivarTrasPago(
  master: MasterPrismaClient,
  invoice: { tenantId: string; subscriptionId: string | null },
): Promise<void> {
  if (invoice.subscriptionId) {
    await master.subscription.update({
      where: { id: invoice.subscriptionId },
      data: { status: "active" },
    });
  }
  await master.tenant.update({ where: { id: invoice.tenantId }, data: { status: "active" } });
}

async function procesarFalloDunning(
  master: MasterPrismaClient,
  invoice: {
    id: string;
    tenantId: string;
    subscriptionId: string | null;
    attempts: number;
    dueDate: Date;
  },
): Promise<{ suspendido: boolean }> {
  const next = siguienteDunning({ attemptsSoFar: invoice.attempts + 1, dueDate: invoice.dueDate });
  const updateData =
    next.action === "retry"
      ? { attempts: invoice.attempts + 1, nextRetryAt: next.nextRetryAt }
      : { attempts: invoice.attempts + 1, status: "uncollectible" as const };
  if (next.action === "suspend") {
    await suspenderPorMora(master, invoice, updateData);
    return { suspendido: true };
  }
  await master.invoice.update({ where: { id: invoice.id }, data: updateData });
  return { suspendido: false };
}

export async function correrDunningCiclo(master: MasterPrismaClient): Promise<{
  procesados: number;
  cobrados: number;
  suspendidos: number;
}> {
  const now = new Date();
  const pendientes = await master.invoice.findMany({
    where: {
      status: "open",
      OR: [{ nextRetryAt: { lte: now } }, { nextRetryAt: null, dueDate: { lte: now } }],
    },
  });

  let cobrados = 0;
  let suspendidos = 0;

  for (const invoice of pendientes) {
    const decisionPrev = siguienteDunning({
      attemptsSoFar: invoice.attempts,
      dueDate: invoice.dueDate,
    });

    if (decisionPrev.action === "suspend") {
      await suspenderPorMora(master, invoice);
      suspendidos += 1;
      continue;
    }

    const res = await intentarPagoInvoice(master, invoice.id);
    if (res.success) {
      cobrados += 1;
      await reactivarTrasPago(master, invoice);
      continue;
    }
    const fallo = await procesarFalloDunning(master, invoice);
    if (fallo.suspendido) suspendidos += 1;
  }

  return { procesados: pendientes.length, cobrados, suspendidos };
}
