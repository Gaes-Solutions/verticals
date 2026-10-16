import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StripeBillingClient } from "./stripe-billing.js";
import { PagoError } from "./types.js";

const OPTS = { apiKey: "sk_test_123", webhookSecret: "whsec_test" };

function mockFetch(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

function firmaStripe(payload: string, secret = OPTS.webhookSecret, ts = Date.now() / 1000) {
  const t = Math.floor(ts);
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

afterEach(() => vi.restoreAllMocks());

describe("StripeBillingClient", () => {
  it("rechaza apiKey stub", () => {
    expect(() => new StripeBillingClient({ ...OPTS, apiKey: "stub-x" })).toThrowError(PagoError);
  });

  it("crearCustomer → devuelve customerId", async () => {
    mockFetch(200, { id: "cus_123" });
    const client = new StripeBillingClient(OPTS);
    expect(await client.crearCustomer({ email: "a@test.mx", name: "Negocio SA" })).toEqual({
      customerId: "cus_123",
    });
  });

  it("crearSetupIntent → devuelve clientSecret", async () => {
    mockFetch(200, { id: "seti_1", client_secret: "seti_1_secret" });
    const client = new StripeBillingClient(OPTS);
    expect(await client.crearSetupIntent("cus_123")).toEqual({
      setupIntentId: "seti_1",
      clientSecret: "seti_1_secret",
    });
  });

  it("cobrarOffSession succeeded → success con chargeId", async () => {
    mockFetch(200, { id: "pi_1", status: "succeeded" });
    const client = new StripeBillingClient(OPTS);
    const r = await client.cobrarOffSession({
      customerId: "cus_1",
      paymentMethodId: "pm_1",
      montoCentavos: 49900,
      moneda: "MXN",
    });
    expect(r).toEqual({ success: true, chargeId: "pi_1" });
  });

  it("cobrarOffSession requires_action → success:false requiereAccion", async () => {
    mockFetch(200, { id: "pi_2", status: "requires_action" });
    const client = new StripeBillingClient(OPTS);
    const r = await client.cobrarOffSession({
      customerId: "cus_1",
      paymentMethodId: "pm_1",
      montoCentavos: 49900,
      moneda: "MXN",
    });
    expect(r.success).toBe(false);
    expect(r.requiereAccion).toBe(true);
  });

  it("cobrarOffSession declinada (402) → success:false con failureReason", async () => {
    mockFetch(402, { error: { message: "Your card was declined." } });
    const client = new StripeBillingClient(OPTS);
    const r = await client.cobrarOffSession({
      customerId: "cus_1",
      paymentMethodId: "pm_1",
      montoCentavos: 49900,
      moneda: "MXN",
    });
    expect(r).toEqual({ success: false, failureReason: "Stripe: Your card was declined." });
  });

  it("getTarjeta → normaliza brand/last4", async () => {
    mockFetch(200, { card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 } });
    const client = new StripeBillingClient(OPTS);
    expect(await client.getTarjeta("pm_1")).toEqual({
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      customerId: null,
    });
  });

  it("parseWebhook payment_intent.succeeded → pago_exitoso", () => {
    const client = new StripeBillingClient(OPTS);
    const payload = JSON.stringify({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_9", amount_received: 49900 } },
    });
    const ev = client.parseWebhook(payload, firmaStripe(payload));
    expect(ev).toMatchObject({ tipo: "pago_exitoso", chargeId: "pi_9", montoCentavos: 49900 });
  });

  it("parseWebhook firma inválida → lanza", () => {
    const client = new StripeBillingClient(OPTS);
    const payload = JSON.stringify({
      type: "payment_intent.succeeded",
      data: { object: { id: "x" } },
    });
    expect(() => client.parseWebhook(payload, "t=1,v1=deadbeef")).toThrowError(PagoError);
  });

  it("parseWebhook evento desconocido → tipo otro", () => {
    const client = new StripeBillingClient(OPTS);
    const payload = JSON.stringify({ type: "customer.updated", data: { object: { id: "cus_1" } } });
    const ev = client.parseWebhook(payload, firmaStripe(payload));
    expect(ev).toMatchObject({ tipo: "otro", stripeType: "customer.updated" });
  });
});

it("prepares a charge without confirming or charging it", async () => {
  const fetch = mockFetch(200, { id: "pi_durable", status: "requires_payment_method" });
  await new StripeBillingClient(OPTS).prepararCobro({
    customerId: "cus_1",
    paymentMethodId: "pm_1",
    montoCentavos: 12000,
    moneda: "MXN",
    idempotencyKey: "invoice_unique",
    metadata: { invoiceId: "invoice_1" },
  });
  const form = new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body));
  expect(form.get("confirm")).toBeNull();
  expect(form.get("metadata[invoiceId]")).toBe("invoice_1");
});
it("preserves the intent ID returned with an authentication-required error", async () => {
  mockFetch(402, {
    error: {
      message: "authentication required",
      payment_intent: { id: "pi_auth", status: "requires_payment_method" },
    },
  });
  expect(
    await new StripeBillingClient(OPTS).cobrarOffSession({
      customerId: "cus_1",
      paymentMethodId: "pm_1",
      montoCentavos: 12000,
      moneda: "MXN",
    }),
  ).toMatchObject({ success: false, chargeId: "pi_auth" });
});

it("confirms an existing intent with the saved card and an idempotency key", async () => {
  const fetch = mockFetch(200, { id: "pi_existing", status: "succeeded" });
  await new StripeBillingClient(OPTS).confirmarIntent("pi_existing", "pm_owner", "invoice_retry_1");
  expect(fetch.mock.calls[0]?.[0]).toBe(
    "https://api.stripe.com/v1/payment_intents/pi_existing/confirm",
  );
  expect(new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body)).get("off_session")).toBe(
    "true",
  );
  expect(new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body)).get("payment_method")).toBe(
    "pm_owner",
  );
  expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ "Idempotency-Key": "invoice_retry_1" });
});
