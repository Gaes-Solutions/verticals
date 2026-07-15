import type { MasterPrismaClient } from "@gaespos/db";
import { StripeConnectClient } from "@gaespos/pagos";
import { BillingError } from "./service.js";

/** StripeConnectClient de la plataforma si hay STRIPE_API_KEY; si no, null. */
export function stripeConnect(): StripeConnectClient | null {
  const apiKey = process.env.STRIPE_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    return new StripeConnectClient({ apiKey });
  } catch {
    return null;
  }
}

function webAdminUrl(): string {
  return process.env.WEB_ADMIN_URL?.trim() || "https://app.angaes.com";
}

/** Mapea las banderas de Stripe a un estado legible del onboarding. */
function statusDeEstado(chargesEnabled: boolean, detailsSubmitted: boolean): string {
  if (chargesEnabled) return "enabled";
  if (detailsSubmitted) return "restricted";
  return "pending";
}

export interface ConnectStatus {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  status: string | null;
}

/**
 * Inicia (o retoma) el onboarding Connect del tenant: crea la cuenta Express la
 * primera vez y devuelve el link hospedado por Stripe para completar KYC + banco.
 */
export async function iniciarOnboardingConnect(
  master: MasterPrismaClient,
  tenantId: string,
): Promise<{ url: string }> {
  const connect = stripeConnect();
  if (!connect) throw new BillingError(503, "Stripe no está configurado");

  const tenant = await master.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { stripeAccountId: true, commercialName: true, legalName: true },
  });

  let accountId = tenant.stripeAccountId;
  if (!accountId) {
    const admin = await master.tenantUserAdmin.findFirst({
      where: { tenantId },
      select: { email: true },
      orderBy: { createdAt: "asc" },
    });
    const businessName = tenant.commercialName ?? tenant.legalName ?? null;
    const { accountId: nuevo } = await connect.crearCuenta({
      email: admin?.email ?? `tenant+${tenantId}@gaessoft.mx`,
      metadata: { tenantId },
      ...(businessName ? { businessName } : {}),
    });
    accountId = nuevo;
    await master.tenant.update({
      where: { id: tenantId },
      data: { stripeAccountId: accountId, stripeAccountStatus: "pending" },
    });
  }

  const base = webAdminUrl();
  const link = await connect.crearAccountLink({
    accountId,
    refreshUrl: `${base}/?connect=refresh`,
    returnUrl: `${base}/?connect=done`,
  });
  return { url: link.url };
}

/** Estado del onboarding Connect del tenant (consulta a Stripe y persiste el status). */
export async function estadoConnect(
  master: MasterPrismaClient,
  tenantId: string,
): Promise<ConnectStatus> {
  const tenant = await master.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { stripeAccountId: true, stripeAccountStatus: true },
  });
  if (!tenant.stripeAccountId) {
    return {
      accountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      status: null,
    };
  }

  const connect = stripeConnect();
  if (!connect) {
    return {
      accountId: tenant.stripeAccountId,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      status: tenant.stripeAccountStatus,
    };
  }

  const estado = await connect.getEstadoCuenta(tenant.stripeAccountId);
  const status = statusDeEstado(estado.chargesEnabled, estado.detailsSubmitted);
  if (status !== tenant.stripeAccountStatus) {
    await master.tenant.update({ where: { id: tenantId }, data: { stripeAccountStatus: status } });
  }
  return {
    accountId: tenant.stripeAccountId,
    chargesEnabled: estado.chargesEnabled,
    payoutsEnabled: estado.payoutsEnabled,
    detailsSubmitted: estado.detailsSubmitted,
    status,
  };
}
