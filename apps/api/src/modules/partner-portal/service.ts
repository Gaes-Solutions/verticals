import type { MasterPrismaClient } from "@gaespos/db";

type Partner = NonNullable<Awaited<ReturnType<MasterPrismaClient["partner"]["findUnique"]>>>;
type CommissionRow = NonNullable<
  Awaited<ReturnType<MasterPrismaClient["commission"]["findUnique"]>>
>;
type PayoutRow = NonNullable<Awaited<ReturnType<MasterPrismaClient["payout"]["findUnique"]>>>;
type TenantRef = { id: string; slug: string; name: string } | null;

export interface ComisionesPartnerResult {
  items: Array<CommissionRow & { tenant: TenantRef }>;
  resumen: Array<{ estado: string; total: string; cantidad: number }>;
}
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { consumeBackupCode, generateBackupCodes, hashBackupCodes } from "../../lib/mfa-backup.js";
import { generateTotpSecret, totpKeyUri, verifyTotpCode } from "../auth/service.js";
import { comisionPctEfectivo } from "../partners/service.js";

export class PartnerPortalError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "PartnerPortalError";
  }
}

/**
 * Cierra la invitación fijando la password del partner (ADR 013). El resto de
 * la transición (estado activo, terms, fechaIngreso) es la misma que la
 * aceptación admin-side histórica.
 */
export async function aceptarInvitacionConPassword(
  master: MasterPrismaClient,
  token: string,
  password: string,
): Promise<{ partnerId: string; codigo: string; email: string }> {
  const invitacion = await master.partnerInvitacion.findUnique({
    where: { token },
    include: { partner: true },
  });
  if (!invitacion) throw new PartnerPortalError(404, "Token inválido");
  if (invitacion.acceptedAt) throw new PartnerPortalError(409, "Invitación ya aceptada");
  if (invitacion.expiresAt < new Date()) throw new PartnerPortalError(409, "Invitación expirada");
  if (invitacion.partner.estado !== "invitado") {
    throw new PartnerPortalError(
      409,
      `Partner en estado ${invitacion.partner.estado}; no permite aceptar`,
    );
  }
  const passwordHash = await argon2Hash(password);
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
        passwordHash,
      },
    });
  });
  return {
    partnerId: invitacion.partnerId,
    codigo: invitacion.partner.codigo,
    email: invitacion.partner.emailContacto,
  };
}

export async function validarLoginPartner(
  master: MasterPrismaClient,
  email: string,
  password: string,
): Promise<Partner> {
  const partner = await master.partner.findUnique({ where: { emailContacto: email } });
  if (!partner?.passwordHash || partner.estado !== "activo") {
    throw new PartnerPortalError(401, "Credenciales inválidas");
  }
  const ok = await argon2Verify(partner.passwordHash, password);
  if (!ok) throw new PartnerPortalError(401, "Credenciales inválidas");
  return partner;
}

export function partnerRequiereMfa(partner: Partner): boolean {
  return Boolean(partner.mfaSecret && partner.mfaVerifiedAt);
}

export async function iniciarSetupMfaPartner(
  master: MasterPrismaClient,
  partnerId: string,
): Promise<{ secret: string; otpauthUrl: string }> {
  const partner = await master.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new PartnerPortalError(404, "Partner no encontrado");
  if (partnerRequiereMfa(partner)) {
    throw new PartnerPortalError(409, "El 2FA ya está activo");
  }
  const secret = generateTotpSecret();
  await master.partner.update({ where: { id: partnerId }, data: { mfaSecret: secret } });
  return { secret, otpauthUrl: totpKeyUri(partner.emailContacto, secret) };
}

export async function activarMfaPartner(
  master: MasterPrismaClient,
  partnerId: string,
  code: string,
): Promise<{ backupCodes: string[] }> {
  const partner = await master.partner.findUnique({ where: { id: partnerId } });
  if (!partner?.mfaSecret) throw new PartnerPortalError(409, "No hay setup 2FA pendiente");
  if (!verifyTotpCode(code, partner.mfaSecret)) {
    throw new PartnerPortalError(401, "Código incorrecto");
  }
  const backupCodes = generateBackupCodes();
  await master.partner.update({
    where: { id: partnerId },
    data: { mfaVerifiedAt: new Date(), mfaBackupCodes: await hashBackupCodes(backupCodes) },
  });
  return { backupCodes };
}

export async function verificarMfaPartner(
  master: MasterPrismaClient,
  partnerId: string,
  code: string,
): Promise<void> {
  const partner = await master.partner.findUnique({ where: { id: partnerId } });
  if (!partner?.mfaSecret || !partner.mfaVerifiedAt) {
    throw new PartnerPortalError(409, "El partner no tiene 2FA activo");
  }
  if (verifyTotpCode(code, partner.mfaSecret)) return;
  const consumo = await consumeBackupCode(partner.mfaBackupCodes, code);
  if (!consumo.ok) throw new PartnerPortalError(401, "Código incorrecto");
  await master.partner.update({
    where: { id: partnerId },
    data: { mfaBackupCodes: consumo.remaining },
  });
}

export async function registrarLoginPartner(
  master: MasterPrismaClient,
  partnerId: string,
): Promise<void> {
  await master.partner.update({
    where: { id: partnerId },
    data: { lastLoginAt: new Date() },
  });
}

export async function perfilPartner(master: MasterPrismaClient, partnerId: string) {
  const partner = await master.partner.findUnique({
    where: { id: partnerId },
    include: {
      branding: true,
      links: { orderBy: { createdAt: "desc" } },
      _count: { select: { referrals: true, tenants: true } },
    },
  });
  if (!partner) throw new PartnerPortalError(404, "Partner no encontrado");
  return {
    id: partner.id,
    codigo: partner.codigo,
    razonSocial: partner.razonSocial,
    emailContacto: partner.emailContacto,
    tipo: partner.tipo,
    nivel: partner.nivel,
    estado: partner.estado,
    comisionPct: comisionPctEfectivo(partner),
    isAcceptingNewReferrals: partner.isAcceptingNewReferrals,
    mfaActivo: partnerRequiereMfa(partner),
    lastLoginAt: partner.lastLoginAt,
    branding: partner.branding,
    links: partner.links,
    totales: { referrals: partner._count.referrals, tenantsActivos: partner._count.tenants },
  };
}

export async function referralsPartner(master: MasterPrismaClient, partnerId: string) {
  const referrals = await master.referral.findMany({
    where: { partnerId },
    include: { link: { select: { slug: true, nombre: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const tenantIds = referrals.map((r) => r.tenantId).filter((id): id is string => Boolean(id));
  const tenants = await master.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, slug: true, name: true, status: true },
  });
  const tenantPor = new Map(tenants.map((t) => [t.id, t]));
  return referrals.map((r) => ({
    ...r,
    tenant: r.tenantId ? (tenantPor.get(r.tenantId) ?? null) : null,
  }));
}

export async function comisionesPartner(
  master: MasterPrismaClient,
  partnerId: string,
): Promise<ComisionesPartnerResult> {
  const [items, porEstado] = await Promise.all([
    master.commission.findMany({
      where: { partnerId },
      orderBy: [{ periodoYyyymm: "desc" }],
      take: 200,
    }),
    master.commission.groupBy({
      by: ["estado"],
      where: { partnerId },
      _sum: { montoComision: true },
      _count: true,
    }),
  ]);
  const tenants = await master.tenant.findMany({
    where: { id: { in: [...new Set(items.map((c) => c.tenantId))] } },
    select: { id: true, slug: true, name: true },
  });
  const tenantPor = new Map(tenants.map((t) => [t.id, t]));
  return {
    items: items.map((c) => ({ ...c, tenant: tenantPor.get(c.tenantId) ?? null })),
    resumen: porEstado.map((g) => ({
      estado: g.estado,
      total: g._sum.montoComision?.toString() ?? "0",
      cantidad: g._count,
    })),
  };
}

export async function payoutsPartner(
  master: MasterPrismaClient,
  partnerId: string,
): Promise<PayoutRow[]> {
  return master.payout.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
