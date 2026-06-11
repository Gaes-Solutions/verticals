import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkydropxClient } from "./skydropx.js";
import { PaqueteriaError } from "./types.js";

const OPTS = { apiKey: "sk_test_123", webhookSecret: "sky_wh_secret" };
const ORIGEN = {
  nombre: "Tienda",
  calle: "Av. Juárez",
  numero: "100",
  cp: "44100",
  estado: "Jalisco",
  pais: "MX",
};
const DESTINO = { nombre: "Cliente", calle: "Calle 5", cp: "06000", estado: "CDMX", pais: "MX" };
const PAQUETE = { pesoKg: 2, largoCm: 20, anchoCm: 15, altoCm: 10 };

function mockFetch(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}
function firma(payload: string, secret = OPTS.webhookSecret) {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

afterEach(() => vi.restoreAllMocks());

describe("SkydropxClient", () => {
  it("rechaza apiKey stub", () => {
    expect(() => new SkydropxClient({ ...OPTS, apiKey: "stub-x" })).toThrowError(PaqueteriaError);
  });

  it("cotiza → normaliza rates de /quotations", async () => {
    const spy = mockFetch(200, {
      data: {
        id: "q1",
        attributes: {
          rates: [
            {
              id: "rate_1",
              provider: "fedex",
              provider_service_name: "Ground",
              total_pricing: "145.50",
              currency_local: "MXN",
              days: 3,
            },
          ],
        },
      },
    });
    const client = new SkydropxClient(OPTS);
    const rates = await client.cotizar({ origen: ORIGEN, destino: DESTINO, paquete: PAQUETE });
    expect(rates[0]).toMatchObject({
      rateId: "rate_1",
      carrier: "fedex",
      costo: 145.5,
      diasEntregaEstimados: 3,
    });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.skydropx.com/v1/quotations");
    const body = JSON.parse(init.body as string);
    expect(body.quotation.address_to.postal_code).toBe("06000");
    expect(body.quotation.parcels[0].weight).toBe(2);
  });

  it("sin tarifas → NO_RATES", async () => {
    mockFetch(200, { data: { attributes: { rates: [] } } });
    const client = new SkydropxClient(OPTS);
    await expect(
      client.cotizar({ origen: ORIGEN, destino: DESTINO, paquete: PAQUETE }),
    ).rejects.toMatchObject({ code: "NO_RATES" });
  });

  it("crea guía con rateId → tracking + etiqueta", async () => {
    const spy = mockFetch(200, {
      data: {
        id: "lbl_1",
        attributes: {
          tracking_number: "794600000001",
          label_url: "https://skydropx.com/labels/lbl_1.pdf",
          provider: "fedex",
          price: "145.50",
          currency: "MXN",
        },
      },
    });
    const client = new SkydropxClient(OPTS);
    const guia = await client.crearGuia({
      rateId: "rate_1",
      origen: ORIGEN,
      destino: DESTINO,
      paquete: PAQUETE,
      referencia: "GP-1",
    });
    expect(guia).toMatchObject({
      guiaId: "lbl_1",
      trackingNumber: "794600000001",
      carrier: "fedex",
      etiquetaUrl: "https://skydropx.com/labels/lbl_1.pdf",
    });
    const body = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.label.rate_id).toBe("rate_1");
    expect(body.label.reference).toBe("GP-1");
  });

  it("crearGuia sin rateId → INVALID_INPUT", async () => {
    const client = new SkydropxClient(OPTS);
    await expect(
      client.crearGuia({ origen: ORIGEN, destino: DESTINO, paquete: PAQUETE }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("parseWebhook delivered con firma válida → entregado", () => {
    const client = new SkydropxClient(OPTS);
    const payload = JSON.stringify({
      tracking_number: "794600000001",
      status: "delivered",
      description: "Entregado",
    });
    const evento = client.parseWebhook(payload, firma(payload));
    expect(evento).toMatchObject({ trackingNumber: "794600000001", status: "entregado" });
  });

  it("firma inválida → INVALID_WEBHOOK", () => {
    const client = new SkydropxClient(OPTS);
    const payload = JSON.stringify({ tracking_number: "x", status: "in_transit" });
    expect(() => client.parseWebhook(payload, firma(payload, "otro"))).toThrowError(
      PaqueteriaError,
    );
  });
});
