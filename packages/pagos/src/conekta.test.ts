import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConektaClient } from "./conekta.js";
import { PagoError } from "./types.js";

const OPTS = { apiKey: "key_test_123", webhookSecret: "conekta_wh_secret" };

function mockFetch(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

function firma(payload: string, secret = OPTS.webhookSecret) {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

afterEach(() => vi.restoreAllMocks());

describe("ConektaClient", () => {
  it("rechaza apiKey stub", () => {
    expect(() => new ConektaClient({ ...OPTS, apiKey: "stub-x" })).toThrowError(PagoError);
  });

  it("crearIntent oxxo → orden con charge cash y referencia", async () => {
    const spy = mockFetch(200, {
      id: "ord_123",
      payment_status: "pending_payment",
      charges: {
        data: [
          {
            id: "chr_1",
            payment_method: { reference: "930012345678901234", expires_at: 1780000000 },
          },
        ],
      },
    });
    const client = new ConektaClient(OPTS);
    const intent = await client.crearIntent({
      pedidoId: "ped_1",
      montoCentavos: 39800,
      moneda: "mxn",
      metodo: "oxxo",
      emailComprador: "a@test.mx",
    });
    expect(intent).toMatchObject({
      intentId: "ord_123",
      proveedor: "conekta",
      status: "pendiente",
      referenciaPago: "930012345678901234",
    });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.conekta.io/orders");
    const body = JSON.parse(init.body as string);
    expect(body.currency).toBe("MXN");
    expect(body.charges[0].payment_method.type).toBe("cash");
    expect(body.line_items[0].unit_price).toBe(39800);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("key_test_123:").toString("base64")}`);
  });

  it("crearIntent spei → charge spei con CLABE", async () => {
    mockFetch(200, {
      id: "ord_456",
      charges: { data: [{ id: "chr_2", payment_method: { clabe: "646180111812345678" } }] },
    });
    const client = new ConektaClient(OPTS);
    const intent = await client.crearIntent({
      pedidoId: "p",
      montoCentavos: 100,
      moneda: "MXN",
      metodo: "spei",
      emailComprador: "a@test.mx",
    });
    expect(intent.referenciaPago).toBe("646180111812345678");
  });

  it("tarjeta sin token → INVALID_INPUT", async () => {
    const client = new ConektaClient(OPTS);
    await expect(
      client.crearIntent({
        pedidoId: "p",
        montoCentavos: 100,
        moneda: "MXN",
        metodo: "tarjeta",
        emailComprador: "a@test.mx",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("parseWebhook order.paid con firma válida → confirmado", () => {
    const client = new ConektaClient(OPTS);
    const payload = JSON.stringify({
      type: "order.paid",
      data: { object: { id: "ord_123", amount: 39800 } },
    });
    const evento = client.parseWebhook(payload, firma(payload));
    expect(evento).toMatchObject({
      intentId: "ord_123",
      status: "confirmado",
      montoCentavos: 39800,
    });
  });

  it("firma inválida → INVALID_WEBHOOK", () => {
    const client = new ConektaClient(OPTS);
    const payload = JSON.stringify({ type: "order.paid", data: { object: { id: "x" } } });
    expect(() => client.parseWebhook(payload, firma(payload, "otro"))).toThrowError(PagoError);
  });

  it("order.expired → fallido", () => {
    const client = new ConektaClient(OPTS);
    const payload = JSON.stringify({
      type: "order.expired",
      data: { object: { id: "ord_123", amount: 100 } },
    });
    expect(client.parseWebhook(payload, firma(payload)).status).toBe("fallido");
  });

  it("reembolsar → POST /orders/:id/refunds", async () => {
    const spy = mockFetch(200, { id: "ord_123", payment_status: "refunded" });
    const client = new ConektaClient(OPTS);
    const r = await client.reembolsar("ord_123");
    expect(r).toEqual({ reembolsoId: "ord_123", status: "procesado" });
    expect((spy.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "https://api.conekta.io/orders/ord_123/refunds",
    );
  });
});
