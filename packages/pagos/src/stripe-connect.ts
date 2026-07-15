import { PagoError } from "./types.js";

export interface StripeConnectOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface CrearCuentaInput {
  email: string;
  /** País de la cuenta (ISO-2). MX por defecto. */
  pais?: string;
  businessName?: string;
  metadata?: Record<string, string>;
}

export interface AccountLinkInput {
  accountId: string;
  /** URL a la que Stripe manda si el link expira/se recarga. */
  refreshUrl: string;
  /** URL de regreso tras terminar (o salir de) el onboarding. */
  returnUrl: string;
}

export interface EstadoCuenta {
  accountId: string;
  /** Puede aceptar cobros con tarjeta. */
  chargesEnabled: boolean;
  /** Puede recibir depósitos a su banco. */
  payoutsEnabled: boolean;
  /** Terminó el formulario de Stripe. */
  detailsSubmitted: boolean;
}

interface StripeError {
  error?: { message?: string };
}

/**
 * Stripe Connect (Express) para que cada tenant cobre a SUS clientes y el dinero
 * le llegue a su cuenta; la plataforma (GaesSoft) cobra una `application_fee` en
 * cada venta. Onboarding y KYC los hospeda Stripe. REST form-encoded, sin SDK.
 * https://docs.stripe.com/connect/express-accounts
 */
export class StripeConnectClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: StripeConnectOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new PagoError("Stripe apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://api.stripe.com";
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    form?: URLSearchParams,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(form ? { body: form.toString() } : {}),
    };
    const res = await fetch(`${this.baseUrl}${path}`, init);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = (data as StripeError).error?.message ?? `HTTP ${res.status}`;
      throw new PagoError(`Stripe: ${msg}`, "INVALID_INPUT", { status: res.status });
    }
    return data as T;
  }

  /** Crea la cuenta Express del tenant (aún sin onboarding completo). */
  async crearCuenta(input: CrearCuentaInput): Promise<{ accountId: string }> {
    const form = new URLSearchParams({
      type: "express",
      country: input.pais ?? "MX",
      email: input.email,
      "capabilities[card_payments][requested]": "true",
      "capabilities[transfers][requested]": "true",
    });
    if (input.businessName) form.set("business_profile[name]", input.businessName);
    for (const [k, v] of Object.entries(input.metadata ?? {})) form.set(`metadata[${k}]`, v);
    const acc = await this.request<{ id: string }>("POST", "/v1/accounts", form);
    return { accountId: acc.id };
  }

  /** Link de onboarding hospedado por Stripe (KYC, banco). Expira en minutos. */
  async crearAccountLink(input: AccountLinkInput): Promise<{ url: string }> {
    const form = new URLSearchParams({
      account: input.accountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      type: "account_onboarding",
    });
    const link = await this.request<{ url: string }>("POST", "/v1/account_links", form);
    return { url: link.url };
  }

  /** Estado de habilitación de la cuenta (para saber si ya puede cobrar). */
  async getEstadoCuenta(accountId: string): Promise<EstadoCuenta> {
    const acc = await this.request<{
      id: string;
      charges_enabled?: boolean;
      payouts_enabled?: boolean;
      details_submitted?: boolean;
    }>("GET", `/v1/accounts/${accountId}`);
    return {
      accountId: acc.id,
      chargesEnabled: acc.charges_enabled ?? false,
      payoutsEnabled: acc.payouts_enabled ?? false,
      detailsSubmitted: acc.details_submitted ?? false,
    };
  }
}
