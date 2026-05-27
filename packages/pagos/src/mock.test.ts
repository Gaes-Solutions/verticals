import { describe, expect, it } from "vitest";
import { MockPaymentProvider } from "./mock.js";
import { PagoError } from "./types.js";

function input(over: Partial<Parameters<MockPaymentProvider["crearIntent"]>[0]> = {}) {
  return {
    pedidoId: "ped-1",
    montoCentavos: 116000,
    moneda: "MXN",
    metodo: "tarjeta" as const,
    emailComprador: "x@test.mx",
    ...over,
  };
}

describe("MockPaymentProvider", () => {
  it("crea intent tarjeta con clientSecret", async () => {
    const p = new MockPaymentProvider();
    const intent = await p.crearIntent(input());
    expect(intent.intentId).toMatch(/^mock_pi_/);
    expect(intent.proveedor).toBe("mock");
    expect(intent.clientSecret).toBeDefined();
    expect(intent.referenciaPago).toBeUndefined();
  });

  it("OXXO devuelve referencia + expiración", async () => {
    const p = new MockPaymentProvider();
    const intent = await p.crearIntent(input({ metodo: "oxxo" }));
    expect(intent.status).toBe("requiere_accion");
    expect(intent.referenciaPago).toBeDefined();
    expect(intent.expiraEn).toBeInstanceOf(Date);
  });

  it("monto <= 0 lanza INVALID_INPUT", async () => {
    const p = new MockPaymentProvider();
    await expect(p.crearIntent(input({ montoCentavos: 0 }))).rejects.toThrow(PagoError);
  });

  it("webhook simulado se parsea como confirmado", async () => {
    const p = new MockPaymentProvider();
    const intent = await p.crearIntent(input());
    const { payload, signature } = p.simularWebhook(intent.intentId);
    const evento = p.parseWebhook(payload, signature);
    expect(evento.status).toBe("confirmado");
    expect(evento.intentId).toBe(intent.intentId);
    expect(evento.montoCentavos).toBe(116000);
  });

  it("firma inválida lanza INVALID_WEBHOOK", async () => {
    const p = new MockPaymentProvider();
    const intent = await p.crearIntent(input());
    const { payload } = p.simularWebhook(intent.intentId);
    expect(() => p.parseWebhook(payload, "firma-mala")).toThrow(PagoError);
  });

  it("failNextWebhook fuerza status fallido", async () => {
    const p = new MockPaymentProvider({ failNextWebhook: true });
    const intent = await p.crearIntent(input());
    const { payload, signature } = p.simularWebhook(intent.intentId);
    expect(p.parseWebhook(payload, signature).status).toBe("fallido");
  });

  it("reembolso de intent existente procesa", async () => {
    const p = new MockPaymentProvider();
    const intent = await p.crearIntent(input());
    const r = await p.reembolsar(intent.intentId);
    expect(r.status).toBe("procesado");
  });

  it("reembolso de intent inexistente lanza", async () => {
    const p = new MockPaymentProvider();
    await expect(p.reembolsar("noexiste")).rejects.toThrow(PagoError);
  });
});
