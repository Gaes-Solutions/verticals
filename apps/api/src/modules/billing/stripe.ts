import { StripeBillingClient } from "@gaespos/pagos";

/**
 * StripeBillingClient de la plataforma si hay `STRIPE_API_KEY`; si no, devuelve
 * null y el billing usa el cobro mock (dev/tests/sin llaves configuradas).
 */
export function stripeBilling(): StripeBillingClient | null {
  const apiKey = process.env.STRIPE_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    return new StripeBillingClient({
      apiKey,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "",
    });
  } catch {
    return null;
  }
}
