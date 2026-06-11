import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnviaClient } from "./envia.js";
import { PaqueteriaError } from "./types.js";

const OPTS = { apiKey: "env_test_123", webhookSecret: "env_wh_secret" };
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

describe("EnviaClient", () => {
  it("rechaza apiKey stub", () => {
    expect(() => new EnviaClient({ ...OPTS, apiKey: "stub-x" })).toThrowError(PaqueteriaError);
  });

  it("cotiza → rateId carrier:service", async () => {
    const spy = mockFetch(200, {
      meta: "rate",
      data: [
        {
          carrier: "fedex",
          service: "ground",
          serviceDescription: "FedEx Ground",
          totalPrice: 150,
          currency: "MXN",
          deliveryEstimate: 3,
        },
      ],
    });
    const client = new EnviaClient(OPTS);
    const rates = await client.cotizar({ origen: ORIGEN, destino: DESTINO, paquete: PAQUETE });
    expect(rates[0]).toMatchObject({ rateId: "fedex:ground", carrier: "fedex", costo: 150 });
    const body = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.destination.postalCode).toBe("06000");
    expect(body.packages[0].weight).toBe(2);
  });

  it("meta=error → INVALID_INPUT", async () => {
    mockFetch(200, { meta: "error", error: { message: "CP inválido" } });
    const client = new EnviaClient(OPTS);
    await expect(
      client.cotizar({ origen: ORIGEN, destino: DESTINO, paquete: PAQUETE }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("genera guía desde rateId carrier:service", async () => {
    const spy = mockFetch(200, {
      meta: "label",
      data: [
        {
          trackingNumber: "EV123456",
          label: "https://envia.com/labels/EV123456.pdf",
          carrier: "fedex",
          totalPrice: 150,
          currency: "MXN",
        },
      ],
    });
    const client = new EnviaClient(OPTS);
    const guia = await client.crearGuia({
      rateId: "fedex:ground",
      origen: ORIGEN,
      destino: DESTINO,
      paquete: PAQUETE,
    });
    expect(guia).toMatchObject({
      trackingNumber: "EV123456",
      etiquetaUrl: "https://envia.com/labels/EV123456.pdf",
      carrier: "fedex",
    });
    const body = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.shipment).toMatchObject({ carrier: "fedex", service: "ground" });
  });

  it("crearGuia sin carrier/service → INVALID_INPUT", async () => {
    const client = new EnviaClient(OPTS);
    await expect(
      client.crearGuia({ origen: ORIGEN, destino: DESTINO, paquete: PAQUETE }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("parseWebhook in_transit con firma válida → en_transito", () => {
    const client = new EnviaClient(OPTS);
    const payload = JSON.stringify({ trackingNumber: "EV123456", status: "in_transit" });
    const evento = client.parseWebhook(payload, firma(payload));
    expect(evento).toMatchObject({ trackingNumber: "EV123456", status: "en_transito" });
  });

  it("firma inválida → INVALID_WEBHOOK", () => {
    const client = new EnviaClient(OPTS);
    const payload = JSON.stringify({ trackingNumber: "x", status: "delivered" });
    expect(() => client.parseWebhook(payload, firma(payload, "otro"))).toThrowError(
      PaqueteriaError,
    );
  });
});
