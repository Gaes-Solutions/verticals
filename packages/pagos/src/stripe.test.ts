import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StripeClient } from "./stripe.js";
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

describe("StripeClient", () => {
  it("rechaza apiKey stub", () => {
    expect(() => new StripeClient({ ...OPTS, apiKey: "stub-x" })).toThrowError(PagoError);
  });

  it("crearIntent tarjeta → POST form-encoded con metadata", async () => {
    const spy = mockFetch(200, {
      id: "pi_123",
      client_secret: "pi_123_secret_x",
      status: "requires_payment_method",
    });
    const client = new StripeClient(OPTS);
    const intent = await client.crearIntent({
      pedidoId: "ped_1",
      montoCentavos: 39800,
      moneda: "MXN",
      metodo: "tarjeta",
      emailComprador: "a@test.mx",
      metadata: { folioPublico: "GP-00000001" },
    });
    expect(intent).toMatchObject({
      intentId: "pi_123",
      proveedor: "stripe",
      status: "pendiente",
      clientSecret: "pi_123_secret_x",
    });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    const form = new URLSearchParams(init.body as string);
    expect(form.get("amount")).toBe("39800");
    expect(form.get("currency")).toBe("mxn");
    expect(form.get("payment_method_types[]")).toBe("card");
    expect(form.get("metadata[folioPublico]")).toBe("GP-00000001");
  });

  it("método spei → INVALID_INPUT (va por Conekta)", async () => {
    const client = new StripeClient(OPTS);
    await expect(
      client.crearIntent({
        pedidoId: "p",
        montoCentavos: 100,
        moneda: "MXN",
        metodo: "spei",
        emailComprador: "a@test.mx",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("error del API propaga mensaje de Stripe", async () => {
    mockFetch(402, { error: { message: "Your card was declined." } });
    const client = new StripeClient(OPTS);
    await expect(
      client.crearIntent({
        pedidoId: "p",
        montoCentavos: 100,
        moneda: "MXN",
        metodo: "tarjeta",
        emailComprador: "a@test.mx",
      }),
    ).rejects.toThrow(/declined/);
  });

  it("parseWebhook valida HMAC y normaliza payment_intent.succeeded", () => {
    const client = new StripeClient(OPTS);
    const payload = JSON.stringify({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_123", amount_received: 39800 } },
    });
    const evento = client.parseWebhook(payload, firmaStripe(payload));
    expect(evento).toMatchObject({
      intentId: "pi_123",
      status: "confirmado",
      montoCentavos: 39800,
    });
  });

  it("firma inválida → INVALID_WEBHOOK", () => {
    const client = new StripeClient(OPTS);
    const payload = JSON.stringify({
      type: "payment_intent.succeeded",
      data: { object: { id: "x" } },
    });
    expect(() => client.parseWebhook(payload, firmaStripe(payload, "otro-secret"))).toThrowError(
      PagoError,
    );
  });

  it("webhook fuera de tolerancia de reloj → INVALID_WEBHOOK", () => {
    const client = new StripeClient({ ...OPTS, toleranciaWebhookSeg: 60 });
    const payload = JSON.stringify({
      type: "payment_intent.succeeded",
      data: { object: { id: "x" } },
    });
    const viejo = firmaStripe(payload, OPTS.webhookSecret, Date.now() / 1000 - 3600);
    expect(() => client.parseWebhook(payload, viejo)).toThrowError(/expirado/);
  });

  it("charge.refunded → reembolsado con payment_intent", () => {
    const client = new StripeClient(OPTS);
    const payload = JSON.stringify({
      type: "charge.refunded",
      data: { object: { id: "ch_1", payment_intent: "pi_123", amount: 39800 } },
    });
    const evento = client.parseWebhook(payload, firmaStripe(payload));
    expect(evento).toMatchObject({ intentId: "pi_123", status: "reembolsado" });
  });

  it("reembolsar → POST /v1/refunds", async () => {
    const spy = mockFetch(200, { id: "re_1", status: "succeeded" });
    const client = new StripeClient(OPTS);
    const r = await client.reembolsar("pi_123", 1000);
    expect(r).toEqual({ reembolsoId: "re_1", status: "procesado" });
    const form = new URLSearchParams(
      (spy.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(form.get("payment_intent")).toBe("pi_123");
    expect(form.get("amount")).toBe("1000");
  });
});
