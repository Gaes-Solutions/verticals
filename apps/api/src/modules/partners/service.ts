import { randomBytes } from "node:crypto";
import type { MasterPrismaClient } from "@gaespos/db";
import Decimal from "decimal.js";

export class PartnerError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PartnerError";
  }
}

/**
 * Comisión base por nivel (puede ser sobrescrita per-partner con
 * `Partner.comisionPctOverride`).
 * Spec: 25/30/35/40% lifetime sobre subscription paid.
 */
export const COMISION_POR_NIVEL: Record<"bronze" | "silver" | "gold" | "diamond", number> = {
  bronze: 25,
  silver: 30,
  gold: 35,
  diamond: 40,
};

/**
 * Umbrales para auto-promover nivel según cantidad de tenants `paying` activos.
 * Bronze (default) → Silver al 5 → Gold al 15 → Diamond al 30.
 */
const UMBRALES_NIVEL: Array<{
  nivel: "bronze" | "silver" | "gold" | "diamond";
  minPaying: number;
}> = [
  { nivel: "diamond", minPaying: 30 },
  { nivel: "gold", minPaying: 15 },
  { nivel: "silver", minPaying: 5 },
  { nivel: "bronze", minPaying: 0 },
];

export function calcularNivelPorPaying(
  payingCount: number,
): "bronze" | "silver" | "gold" | "diamond" {
  for (const u of UMBRALES_NIVEL) {
    if (payingCount >= u.minPaying) return u.nivel;
  }
  return "bronze";
}

export function comisionPctEfectivo(partner: {
  nivel: "bronze" | "silver" | "gold" | "diamond";
  comisionPctOverride: { toString: () => string } | null;
}): number {
  if (partner.comisionPctOverride !== null) {
    return Number(partner.comisionPctOverride.toString());
  }
  return COMISION_POR_NIVEL[partner.nivel];
}

export interface CrearInvitacionInput {
  codigo: string;
  razonSocial: string;
  emailContacto: string;
  tipo: "contador" | "integrador" | "consultor" | "agencia" | "otro";
  expiraEnHoras: number;
  enviadaPorAdminId?: string;
}

export interface CrearInvitacionResult {
  partnerId: string;
  token: string;
  expiresAt: Date;
  inviteLink: string;
}

const BASE_URL = process.env.PARTNER_INVITE_BASE_URL ?? "https://app.gaessoft.com/partners/aceptar";

export async function crearInvitacion(
  master: MasterPrismaClient,
  input: CrearInvitacionInput,
): Promise<CrearInvitacionResult> {
  const existingByCodigo = await master.partner.findUnique({ where: { codigo: input.codigo } });
  if (existingByCodigo) {
    throw new PartnerError(409, `Ya existe partner con código ${input.codigo}`);
  }
  const existingByEmail = await master.partner.findUnique({
    where: { emailContacto: input.emailContacto },
  });
  if (existingByEmail) {
    throw new PartnerError(409, `Ya existe partner con email ${input.emailContacto}`);
  }
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + input.expiraEnHoras * 3_600_000);

  const partner = await master.partner.create({
    data: {
      codigo: input.codigo,
      razonSocial: input.razonSocial,
      emailContacto: input.emailContacto,
      tipo: input.tipo,
      nivel: "bronze",
      estado: "invitado",
      invitaciones: {
        create: {
          token,
          expiresAt,
          enviadaA: input.emailContacto,
          ...(input.enviadaPorAdminId ? { enviadaPorId: input.enviadaPorAdminId } : {}),
        },
      },
    },
  });
  return {
    partnerId: partner.id,
    token,
    expiresAt,
    inviteLink: `${BASE_URL}?token=${token}`,
  };
}

export async function aceptarInvitacion(
  master: MasterPrismaClient,
  token: string,
): Promise<{ partnerId: string; codigo: string }> {
  const invitacion = await master.partnerInvitacion.findUnique({
    where: { token },
    include: { partner: true },
  });
  if (!invitacion) throw new PartnerError(404, "Token inválido");
  if (invitacion.acceptedAt) {
    throw new PartnerError(409, "Invitación ya aceptada");
  }
  if (invitacion.expiresAt < new Date()) {
    throw new PartnerError(409, "Invitación expirada");
  }
  if (invitacion.partner.estado !== "invitado") {
    throw new PartnerError(
      409,
      `Partner en estado ${invitacion.partner.estado}; no permite aceptar`,
    );
  }
  await master.$transaction(async (tx) => {
    await tx.partnerInvitacion.update({
      where: { id: invitacion.id },
      data: { acceptedAt: new Date() },
    });
    await tx.partner.update({
      where: { id: invitacion.partnerId },
      data: {
        estado: "activo",
        termsAcceptedAt: new Date(),
        fechaIngreso: new Date(),
      },
    });
  });
  return { partnerId: invitacion.partnerId, codigo: invitacion.partner.codigo };
}

export interface CrearLinkInput {
  partnerId: string;
  slug: string;
  nombre: string;
  targetPath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export async function crearLink(
  master: MasterPrismaClient,
  input: CrearLinkInput,
): Promise<{ id: string; slug: string }> {
  const existing = await master.partnerLink.findUnique({ where: { slug: input.slug } });
  if (existing) {
    throw new PartnerError(409, `Slug ${input.slug} ya en uso`);
  }
  const partner = await master.partner.findUnique({ where: { id: input.partnerId } });
  if (!partner) throw new PartnerError(404, "Partner no encontrado");
  if (partner.estado !== "activo") {
    throw new PartnerError(409, `Partner en estado ${partner.estado}; activar antes`);
  }
  const link = await master.partnerLink.create({
    data: {
      partnerId: input.partnerId,
      slug: input.slug,
      nombre: input.nombre,
      ...(input.targetPath ? { targetPath: input.targetPath } : {}),
      ...(input.utmSource ? { utmSource: input.utmSource } : {}),
      ...(input.utmMedium ? { utmMedium: input.utmMedium } : {}),
      ...(input.utmCampaign ? { utmCampaign: input.utmCampaign } : {}),
    },
  });
  return { id: link.id, slug: link.slug };
}

export interface RegistrarClickInput {
  slug: string;
  ipAddress?: string;
  userAgent?: string;
  cookieValueExisting?: string;
}

const ATTRIBUTION_DAYS = 90;

export async function registrarClick(
  master: MasterPrismaClient,
  input: RegistrarClickInput,
): Promise<{ cookieValue: string; targetPath: string; expiresAt: Date }> {
  const link = await master.partnerLink.findUnique({ where: { slug: input.slug } });
  if (!link) throw new PartnerError(404, "Link no encontrado");
  if (!link.isActive) throw new PartnerError(409, "Link inactivo");

  const cookieValue = input.cookieValueExisting ?? randomBytes(20).toString("hex");
  const expiresAt = new Date(Date.now() + ATTRIBUTION_DAYS * 86_400_000);
  await master.referral.upsert({
    where: { cookieValue },
    create: {
      partnerId: link.partnerId,
      linkId: link.id,
      cookieValue,
      estado: "click",
      firstClickAt: new Date(),
      atribucionExpiraEn: expiresAt,
      ...(input.ipAddress ? { ipPrimerClick: input.ipAddress } : {}),
      ...(input.userAgent ? { userAgentPrimerClick: input.userAgent } : {}),
    },
    update: {
      atribucionExpiraEn: expiresAt,
    },
  });
  await master.partnerLink.update({
    where: { id: link.id },
    data: { clicksTotal: { increment: 1 } },
  });
  return { cookieValue, targetPath: link.targetPath, expiresAt };
}

/**
 * Llamado cuando se crea un Tenant nuevo: si hay cookie de referral activa,
 * asocia el Tenant al Referral del partner y transita a "signup".
 */
export async function onTenantCreated(
  master: MasterPrismaClient,
  tenantId: string,
  cookieValue: string | null,
): Promise<{ asociado: boolean; referralId?: string }> {
  if (!cookieValue) return { asociado: false };
  const referral = await master.referral.findUnique({ where: { cookieValue } });
  if (!referral) return { asociado: false };
  if (referral.atribucionExpiraEn && referral.atribucionExpiraEn < new Date()) {
    return { asociado: false };
  }
  if (referral.tenantId) return { asociado: false };
  await master.$transaction(async (tx) => {
    await tx.referral.update({
      where: { id: referral.id },
      data: {
        tenantId,
        estado: "signup",
        signupAt: new Date(),
      },
    });
    await tx.partnerLink.update({
      where: { id: referral.linkId },
      data: { signupsTotal: { increment: 1 } },
    });
  });
  return { asociado: true, referralId: referral.id };
}

export async function transicionReferralEstado(
  master: MasterPrismaClient,
  referralId: string,
  nuevoEstado: "trial" | "paying" | "churned",
): Promise<void> {
  const referral = await master.referral.findUnique({ where: { id: referralId } });
  if (!referral) throw new PartnerError(404, "Referral no encontrado");
  const data: Record<string, unknown> = { estado: nuevoEstado };
  if (nuevoEstado === "trial") data.trialStartAt = new Date();
  if (nuevoEstado === "paying") {
    data.paidStartAt = new Date();
    await master.partnerLink.update({
      where: { id: referral.linkId },
      data: { paidConversions: { increment: 1 } },
    });
  }
  if (nuevoEstado === "churned") data.churnedAt = new Date();
  await master.referral.update({ where: { id: referralId }, data });
}

export async function recalcularNivelPartner(
  master: MasterPrismaClient,
  partnerId: string,
): Promise<{ nivel: "bronze" | "silver" | "gold" | "diamond"; payingCount: number }> {
  const partner = await master.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new PartnerError(404, "Partner no encontrado");
  const payingCount = await master.referral.count({
    where: { partnerId, estado: "paying" },
  });
  const nivel = calcularNivelPorPaying(payingCount);
  if (nivel !== partner.nivel) {
    await master.partner.update({ where: { id: partnerId }, data: { nivel } });
  }
  return { nivel, payingCount };
}

/**
 * Recalcula comisiones del periodo para todos los referrals "paying" del partner.
 * Idempotente por (referralId, periodoYyyymm) — usa upsert.
 *
 * V1: el `montoBaseTenantPaid` se calcula como precio del plan del tenant
 * activo en el periodo (más adelante en Hito 6 con billing real se cruzará
 * con Invoice/Payment). Por ahora usa Tenant.plan.priceCents / 100.
 */
export async function recalcularComisionesPeriodo(
  master: MasterPrismaClient,
  partnerId: string,
  periodoYyyymm: string,
): Promise<{ creadas: number; actualizadas: number; totalMontoComision: string }> {
  const partner = await master.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new PartnerError(404, "Partner no encontrado");
  const pct = comisionPctEfectivo(partner);
  const referrals = await master.referral.findMany({
    where: { partnerId, estado: "paying", tenantId: { not: null } },
  });
  let creadas = 0;
  let actualizadas = 0;
  let totalMontoComision = new Decimal(0);
  for (const ref of referrals) {
    if (!ref.tenantId) continue;
    const tenant = await master.tenant.findUnique({
      where: { id: ref.tenantId },
      include: { plan: true },
    });
    if (!tenant || tenant.status !== "active") continue;
    const montoBase = new Decimal(tenant.plan.priceCents).dividedBy(100);
    const montoComision = montoBase.times(pct).dividedBy(100);
    totalMontoComision = totalMontoComision.plus(montoComision);
    const existing = await master.commission.findUnique({
      where: {
        referralId_periodoYyyymm: {
          referralId: ref.id,
          periodoYyyymm,
        },
      },
    });
    if (existing) {
      if (existing.estado === "pendiente") {
        await master.commission.update({
          where: { id: existing.id },
          data: {
            montoBaseTenantPaid: montoBase.toFixed(2),
            porcentajeAplicado: pct.toString(),
            montoComision: montoComision.toFixed(2),
          },
        });
        actualizadas++;
      }
    } else {
      await master.commission.create({
        data: {
          partnerId,
          referralId: ref.id,
          tenantId: ref.tenantId,
          periodoYyyymm,
          montoBaseTenantPaid: montoBase.toFixed(2),
          porcentajeAplicado: pct.toString(),
          montoComision: montoComision.toFixed(2),
          moneda: tenant.plan.currency,
          estado: "pendiente",
        },
      });
      creadas++;
    }
  }
  return {
    creadas,
    actualizadas,
    totalMontoComision: totalMontoComision.toFixed(2),
  };
}

export async function aprobarComision(
  master: MasterPrismaClient,
  commissionId: string,
  adminUserId: string,
): Promise<void> {
  const c = await master.commission.findUnique({ where: { id: commissionId } });
  if (!c) throw new PartnerError(404, "Comisión no encontrada");
  if (c.estado !== "pendiente") {
    throw new PartnerError(409, `Comisión en estado ${c.estado}; solo se aprueban pendientes`);
  }
  await master.commission.update({
    where: { id: commissionId },
    data: { estado: "aprobada", aprobadaAt: new Date(), aprobadaPorAdminId: adminUserId },
  });
}

export async function rechazarComision(
  master: MasterPrismaClient,
  commissionId: string,
  motivo: string,
): Promise<void> {
  const c = await master.commission.findUnique({ where: { id: commissionId } });
  if (!c) throw new PartnerError(404, "Comisión no encontrada");
  if (c.estado !== "pendiente") {
    throw new PartnerError(409, `Comisión en estado ${c.estado}; solo se rechazan pendientes`);
  }
  await master.commission.update({
    where: { id: commissionId },
    data: { estado: "rechazada", rechazadaAt: new Date(), rechazadaMotivo: motivo },
  });
}

export interface CrearPayoutInput {
  partnerId: string;
  periodoYyyymm: string;
  metodoPago: "spei" | "paypal" | "stripe_connect" | "otro";
  creadoPorAdminId?: string;
}

export async function crearPayout(
  master: MasterPrismaClient,
  input: CrearPayoutInput,
): Promise<{ payoutId: string; commissionsAgrupadas: number; montoTotal: string }> {
  const existing = await master.payout.findUnique({
    where: {
      partnerId_periodoYyyymm: { partnerId: input.partnerId, periodoYyyymm: input.periodoYyyymm },
    },
  });
  if (existing) {
    throw new PartnerError(409, `Ya existe payout del partner para periodo ${input.periodoYyyymm}`);
  }
  const commissions = await master.commission.findMany({
    where: {
      partnerId: input.partnerId,
      periodoYyyymm: input.periodoYyyymm,
      estado: "aprobada",
      payoutId: null,
    },
  });
  if (commissions.length === 0) {
    throw new PartnerError(409, "No hay comisiones aprobadas pendientes de pago para este periodo");
  }
  const montoTotal = commissions.reduce(
    (acc, c) => acc.plus(c.montoComision.toString()),
    new Decimal(0),
  );
  const payout = await master.$transaction(async (tx) => {
    const p = await tx.payout.create({
      data: {
        partnerId: input.partnerId,
        periodoYyyymm: input.periodoYyyymm,
        montoTotal: montoTotal.toFixed(2),
        montoNeto: montoTotal.toFixed(2),
        metodoPago: input.metodoPago,
        estado: "pendiente",
        ...(input.creadoPorAdminId ? { creadoPorAdminId: input.creadoPorAdminId } : {}),
      },
    });
    await tx.commission.updateMany({
      where: { id: { in: commissions.map((c) => c.id) } },
      data: { payoutId: p.id },
    });
    return p;
  });
  return {
    payoutId: payout.id,
    commissionsAgrupadas: commissions.length,
    montoTotal: montoTotal.toFixed(2),
  };
}

export async function marcarPayoutPagado(
  master: MasterPrismaClient,
  payoutId: string,
  folioBancario: string,
  invoicePartnerUrl?: string,
): Promise<void> {
  const payout = await master.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new PartnerError(404, "Payout no encontrado");
  if (payout.estado !== "pendiente" && payout.estado !== "en_proceso") {
    throw new PartnerError(409, `Payout en estado ${payout.estado}; no permite marcar pagado`);
  }
  await master.$transaction(async (tx) => {
    await tx.payout.update({
      where: { id: payoutId },
      data: {
        estado: "pagado",
        folioBancario,
        fechaPago: new Date(),
        ...(invoicePartnerUrl ? { invoicePartnerUrl } : {}),
      },
    });
    await tx.commission.updateMany({
      where: { payoutId, estado: "aprobada" },
      data: { estado: "pagada", pagadaAt: new Date() },
    });
  });
}
