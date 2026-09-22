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

  it("customer_info.name usa el nombre saneado (no el email) y cae a 'Cliente'", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ id: "ord_n", charges: { data: [] } }), { status: 200 }),
      );
    const client = new ConektaClient(OPTS);

    await client.crearIntent({
      pedidoId: "p",
      montoCentavos: 100,
      moneda: "MXN",
      metodo: "oxxo",
      emailComprador: "a@test.mx",
      nombreComprador: "José Pérez 123",
    });
    const conNombre = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(conNombre.customer_info.name).toBe("José Pérez");
    expect(conNombre.customer_info.email).toBe("a@test.mx");

    spy.mockClear();
    await client.crearIntent({
      pedidoId: "p",
      montoCentavos: 100,
      moneda: "MXN",
      metodo: "oxxo",
      emailComprador: "a@test.mx",
    });
    const sinNombre = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(sinNombre.customer_info.name).toBe("Cliente");
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

  it("tarjeta con token → charge card pagado (confirmado)", async () => {
    const spy = mockFetch(200, {
      id: "ord_card_1",
      payment_status: "paid",
      charges: { data: [{ id: "chr_c1", status: "paid", payment_method: { type: "card" } }] },
    });
    const client = new ConektaClient(OPTS);
    const intent = await client.crearIntent({
      pedidoId: "p",
      montoCentavos: 59800,
      moneda: "MXN",
      metodo: "tarjeta",
      emailComprador: "a@test.mx",
      cardTokenId: "tok_test_visa_4242",
    });
    expect(intent.status).toBe("confirmado");
    const body = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.charges[0].payment_method).toMatchObject({
      type: "card",
      token_id: "tok_test_visa_4242",
    });
    expect(body.charges[0].payment_method.monthly_installments).toBeUndefined();
  });

  it("tarjeta con MSI → incluye monthly_installments en el cargo", async () => {
    const spy = mockFetch(200, {
      id: "ord_card_msi",
      payment_status: "paid",
      charges: {
        data: [{ id: "chr_msi", payment_method: { type: "card", monthly_installments: 6 } }],
      },
    });
    const client = new ConektaClient(OPTS);
    await client.crearIntent({
      pedidoId: "p",
      montoCentavos: 600000,
      moneda: "MXN",
      metodo: "tarjeta",
      emailComprador: "a@test.mx",
      cardTokenId: "tok_test",
      mesesSinIntereses: 6,
    });
    const body = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.charges[0].payment_method.monthly_installments).toBe(6);
  });

  it("tarjeta guardada → cobra con payment_source_id y customer_id", async () => {
    const spy = mockFetch(200, {
      id: "ord_saved_1",
      payment_status: "paid",
      charges: { data: [{ id: "chr_s1", payment_method: { type: "card" } }] },
    });
    const client = new ConektaClient(OPTS);
    const intent = await client.crearIntent({
      pedidoId: "p",
      montoCentavos: 25000,
      moneda: "MXN",
      metodo: "tarjeta",
      emailComprador: "a@test.mx",
      paymentSourceId: "src_saved_4242",
      proveedorCustomerId: "cus_cliente_1",
    });
    expect(intent.status).toBe("confirmado");
    const body = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.charges[0].payment_method).toMatchObject({
      type: "card",
      payment_source_id: "src_saved_4242",
    });
    expect(body.charges[0].payment_method.token_id).toBeUndefined();
    expect(body.customer_info.customer_id).toBe("cus_cliente_1");
  });

  it("crearCliente → POST /customers con nombre saneado", async () => {
    const spy = mockFetch(200, { id: "cus_nuevo" });
    const client = new ConektaClient(OPTS);
    const r = await client.crearCliente({ nombre: "María 123 López", email: "m@test.mx" });
    expect(r).toEqual({ customerId: "cus_nuevo" });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.conekta.io/customers");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ name: "María López", email: "m@test.mx" });
  });

  it("agregarFuentePago → POST payment_sources y normaliza año a 4 dígitos", async () => {
    const spy = mockFetch(200, {
      id: "src_4242",
      brand: "visa",
      last4: "4242",
      exp_month: "12",
      exp_year: "28",
    });
    const client = new ConektaClient(OPTS);
    const r = await client.agregarFuentePago("cus_1", "tok_visa");
    expect(r).toEqual({
      sourceId: "src_4242",
      marca: "visa",
      last4: "4242",
      expMes: 12,
      expAnio: 2028,
    });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.conekta.io/customers/cus_1/payment_sources");
    expect(JSON.parse(init.body as string)).toEqual({ type: "card", token_id: "tok_visa" });
  });

  it("eliminarFuentePago → DELETE y tolera 404 (ya eliminada)", async () => {
    const spy = mockFetch(200, { id: "src_4242", deleted: true });
    const client = new ConektaClient(OPTS);
    await client.eliminarFuentePago("cus_1", "src_4242");
    expect((spy.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "https://api.conekta.io/customers/cus_1/payment_sources/src_4242",
    );
    vi.restoreAllMocks();
    mockFetch(404, { details: [{ message: "not found" }] });
    await expect(client.eliminarFuentePago("cus_1", "src_404")).resolves.toBeUndefined();
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

describe("Conekta refund receipts", () => {
  const receipt = (id: string, amount = -1234) => ({ id, object: "refund", amount });
  const order = (refunds: unknown[]) => ({
    id: "ord_original",
    charges: { data: [{ refunds: { data: refunds } }] },
  });
  it("returns the individual refund id, not the order id", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(order([receipt("re_old")]))))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(order([receipt("re_old"), receipt("re_new")]))),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(order([receipt("re_old"), receipt("re_new")]))),
      );
    const result = await new ConektaClient(OPTS).reembolsar("ord_original", 1234, {
      requestKey: "job",
    });
    expect(result).toMatchObject({ reembolsoId: "re_new", status: "procesado" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("does not infer a lost receipt just from its amount", async () => {
    const fetch = mockFetch(200, order([receipt("re_other")]));
    expect(
      await new ConektaClient(OPTS).consultarReembolso("ord_original", null, { requestKey: "job" }),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("verifies an explicit individual receipt against the original order", async () => {
    mockFetch(200, order([receipt("re_ours")]));
    expect(
      await new ConektaClient(OPTS).consultarReembolso("ord_original", "re_ours", {
        requestKey: "job",
      }),
    ).toEqual({
      intentId: "ord_original",
      amountCents: 1234,
      reembolsoId: "re_ours",
      status: "procesado",
    });
  });
});
