import { describe, expect, it } from "vitest";
import { MockEmailProvider } from "./mock.js";
import { renderPlantilla } from "./plantillas.js";
import { EmailError } from "./types.js";

describe("renderPlantilla", () => {
  it("pedido_confirmado interpola folio y total", () => {
    const r = renderPlantilla("pedido_confirmado", {
      folioPublico: "GP-00000001",
      total: "1160.00",
    });
    expect(r.asunto).toContain("GP-00000001");
    expect(r.html).toContain("1160.00");
  });

  it("carrito_recovery incluye el código", () => {
    const r = renderPlantilla("carrito_recovery", {
      recoveryCodigo: "VUELVE10",
      urlCarrito: "http://x",
    });
    expect(r.html).toContain("VUELVE10");
  });
});

describe("MockEmailProvider", () => {
  it("acumula emails enviados", async () => {
    const p = new MockEmailProvider();
    await p.enviar({ para: "a@test.mx", asunto: "Hola", html: "<p>x</p>" });
    expect(p.enviados).toHaveLength(1);
    expect(p.enviados[0]?.para).toBe("a@test.mx");
  });

  it("enviarPlantilla renderiza y acumula", async () => {
    const p = new MockEmailProvider();
    const r = await p.enviarPlantilla({
      para: "b@test.mx",
      plantilla: "pedido_enviado",
      datos: {
        folioPublico: "GP-2",
        guiaTracking: "123",
        paqueteria: "fedex",
        trackingUrl: "http://t",
      },
    });
    expect(r.aceptado).toBe(true);
    expect(p.enviados[0]?.asunto).toContain("GP-2");
    expect(p.enviados[0]?.html).toContain("123");
  });

  it("email inválido lanza", async () => {
    const p = new MockEmailProvider();
    await expect(p.enviar({ para: "no-email", asunto: "x", html: "y" })).rejects.toThrow(
      EmailError,
    );
  });
});
