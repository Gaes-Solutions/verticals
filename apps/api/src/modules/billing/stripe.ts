import { StripeBillingClient } from "@gaespos/pagos";

/**
 * StripeBillingClient de la plataforma si hay `STRIPE_API_KEY`; si no, devuelve
 * null. El cobro mock solo está permitido con opt-in en desarrollo/tests.
 */
export function stripeBilling(): StripeBillingClient | null {
  const apiKey = process.env.STRIPE_API_KEY?.trim();
  if (!apiKey || !/^(sk|rk)_(test|live)_[A-Za-z0-9_]+$/.test(apiKey)) return null;
  try {
    return new StripeBillingClient({
      apiKey,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "",
    });
  } catch {
    return null;
  }
}

/** Never expose a secret/restricted key when an operator swaps environment variables. */
export function stripePublishableKey(): string | null {
  const key = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  return key && /^pk_(test|live)_[A-Za-z0-9_]+$/.test(key) ? key : null;
}
