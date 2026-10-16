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

  it("carrito_recovery incluye el enlace en HTML y texto", () => {
    const r = renderPlantilla("carrito_recovery", {
      recoveryCodigo: "VUELVE10",
      urlCarrito: "http://x",
    });
    expect(r.html).toContain('href="http://x/"');
    expect(r.texto).toContain("http://x");
  });

  it("carrito_recovery sin enlace conserva el código como alternativa", () => {
    const r = renderPlantilla("carrito_recovery", { recoveryCodigo: "RECUPERAR123" });
    expect(r.html).toContain("RECUPERAR123");
    expect(r.texto).toContain("RECUPERAR123");
  });

  it("escapa texto del comprador en HTML sin modificar asunto o texto", () => {
    const r = renderPlantilla("pedido_confirmado", {
      folioPublico: '<a href="https://malicioso.test">Pedido</a>',
      total: "10&20",
    });
    expect(r.html).not.toContain("<a href=");
    expect(r.html).toContain("&lt;a href=&quot;");
    expect(r.texto).toContain("10&20");
    expect(r.asunto).toContain("<a href=");
  });

  it("no inserta enlaces ejecutables ni permite salir del atributo", () => {
    const bad = renderPlantilla("pedido_enviado", { trackingUrl: "javascript:alert(1)" });
    expect(bad.html).not.toContain("href=");
    const valid = renderPlantilla("recuperar_contrasena", {
      url: 'https://tienda.test/?a=1&b="onclick="bad',
    });
    expect(valid.html).toContain("&amp;");
    expect(valid.html).not.toContain('"onclick="');
  });

  it("recuperar_contrasena incluye el enlace y su vigencia", () => {
    const r = renderPlantilla("recuperar_contrasena", {
      url: "https://mitienda.gaessoft.shop/cuenta/restablecer?token=abc123",
    });
    expect(r.asunto).toContain("contraseña");
    expect(r.html).toContain("https://mitienda.gaessoft.shop/cuenta/restablecer?token=abc123");
    expect(r.texto).toContain("abc123");
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
