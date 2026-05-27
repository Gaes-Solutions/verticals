import { describe, expect, it } from "vitest";
import { mockSms, mockWhatsapp } from "./mock.js";
import { MensajeriaError, renderHandlebars } from "./types.js";

describe("renderHandlebars", () => {
  it("reemplaza variables", () => {
    expect(
      renderHandlebars("Hola {{nombre}}, tu pedido {{folio}}", { nombre: "Ana", folio: "GP-1" }),
    ).toBe("Hola Ana, tu pedido GP-1");
  });
  it("variable faltante → vacío", () => {
    expect(renderHandlebars("Hola {{nombre}}", {})).toBe("Hola ");
  });
});

describe("MockMessagingProvider", () => {
  it("WhatsApp envía y acumula + cobra créditos", async () => {
    const p = mockWhatsapp();
    const r = await p.enviar({ destino: "+5213311112222", contenido: "Promo!" });
    expect(r.status).toBe("enviado");
    expect(r.proveedor).toBe("mock-whatsapp");
    expect(r.creditos).toBeGreaterThan(0);
    expect(p.enviados).toHaveLength(1);
  });

  it("SMS tiene canal correcto", async () => {
    const p = mockSms();
    const r = await p.enviar({ destino: "3311112222", contenido: "SMS test" });
    expect(r.proveedor).toBe("mock-sms");
  });

  it("destino inválido lanza", async () => {
    const p = mockWhatsapp();
    await expect(p.enviar({ destino: "x", contenido: "y" })).rejects.toThrow(MensajeriaError);
  });

  it("failNext devuelve rechazado sin cobrar", async () => {
    const p = mockWhatsapp({ failNext: true });
    const r = await p.enviar({ destino: "+5213311112222", contenido: "x" });
    expect(r.status).toBe("rechazado");
    expect(r.creditos).toBe(0);
  });
});
