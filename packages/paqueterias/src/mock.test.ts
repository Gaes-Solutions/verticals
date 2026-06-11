import { describe, expect, it } from "vitest";
import { MockShippingProvider } from "./mock.js";
import { PaqueteriaError } from "./types.js";

const ORIGEN = {
  nombre: "Tienda",
  calle: "Av. Juárez",
  cp: "44100",
  estado: "Jalisco",
  pais: "MX",
};
const DESTINO = {
  nombre: "Cliente",
  calle: "Calle 5",
  cp: "06000",
  estado: "CDMX",
  pais: "MX",
};
const PAQUETE = { pesoKg: 2, largoCm: 20, anchoCm: 15, altoCm: 10 };

describe("MockShippingProvider", () => {
  it("cotiza tarifas deterministas por carrier", async () => {
    const p = new MockShippingProvider();
    const rates = await p.cotizar({ origen: ORIGEN, destino: DESTINO, paquete: PAQUETE });
    expect(rates.length).toBe(2);
    expect(rates[0]?.carrier).toBe("fedex");
    expect(rates[1]?.carrier).toBe("estafeta");
    // Determinista: mismo input → mismo rateId/costo.
    const rates2 = await p.cotizar({ origen: ORIGEN, destino: DESTINO, paquete: PAQUETE });
    expect(rates2[0]?.rateId).toBe(rates[0]?.rateId);
    expect(rates2[0]?.costo).toBe(rates[0]?.costo);
  });

  it("cotizar sin cp o peso → INVALID_INPUT", async () => {
    const p = new MockShippingProvider();
    await expect(
      p.cotizar({ origen: ORIGEN, destino: { ...DESTINO, cp: "" }, paquete: PAQUETE }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("crea guía con rateId → etiqueta + tracking", async () => {
    const p = new MockShippingProvider();
    const rates = await p.cotizar({ origen: ORIGEN, destino: DESTINO, paquete: PAQUETE });
    const rate = rates[0];
    if (!rate) throw new Error("sin tarifa");
    const guia = await p.crearGuia({
      rateId: rate.rateId,
      origen: ORIGEN,
      destino: DESTINO,
      paquete: PAQUETE,
      referencia: "GP-00000123",
    });
    expect(guia.trackingNumber).toMatch(/^MOCK/);
    expect(guia.etiquetaUrl).toContain(".pdf");
    expect(guia.carrier).toBe("fedex");
  });

  it("crearGuia sin rateId ni carrier → INVALID_INPUT", async () => {
    const p = new MockShippingProvider();
    await expect(
      p.crearGuia({ origen: ORIGEN, destino: DESTINO, paquete: PAQUETE }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("simularWebhook → parseWebhook acepta y normaliza", async () => {
    const p = new MockShippingProvider();
    const guia = await p.crearGuia({
      carrier: "fedex",
      origen: ORIGEN,
      destino: DESTINO,
      paquete: PAQUETE,
    });
    const { payload, signature } = p.simularWebhook(guia.trackingNumber, "entregado");
    const evento = p.parseWebhook(payload, signature);
    expect(evento).toMatchObject({ trackingNumber: guia.trackingNumber, status: "entregado" });
  });

  it("parseWebhook con firma inválida → INVALID_WEBHOOK", () => {
    const p = new MockShippingProvider();
    const payload = JSON.stringify({ trackingNumber: "MOCKABC", status: "en_transito" });
    expect(() => p.parseWebhook(payload, "mock-sig:otro")).toThrowError(PaqueteriaError);
  });

  it("cancelar guía existente → cancelada; inexistente → GUIA_NOT_FOUND", async () => {
    const p = new MockShippingProvider();
    const guia = await p.crearGuia({
      carrier: "fedex",
      origen: ORIGEN,
      destino: DESTINO,
      paquete: PAQUETE,
    });
    expect((await p.cancelarGuia(guia.guiaId)).status).toBe("cancelada");
    await expect(p.cancelarGuia("noexiste")).rejects.toMatchObject({ code: "GUIA_NOT_FOUND" });
  });
});
