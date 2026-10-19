import PoliticaPage from "@/app/politicas/[slug]/page";
import { type TiendaConfig, getTiendaConfig } from "@/lib/api";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api", () => ({ getTiendaConfig: vi.fn() }));
const config = vi.mocked(getTiendaConfig);
const baseConfig: TiendaConfig = {
  abierta: true,
  motivo: null,
  nombre: "Tienda QA",
  lema: null,
  msiHabilitado: false,
  msiMeses: [],
  msiMontoMinimo: "0",
  galeriaZoom: true,
  mostrarRatingProducto: true,
  cuponEnCheckout: true,
  comprarAhora: true,
  cancelacionCliente: true,
  facturacionSelfService: false,
  preguntasPublicas: true,
  pushHabilitado: false,
  vapidPublicKey: null,
  envioGratisDesde: null,
  politicasHtml: {},
};
beforeEach(() => {
  vi.stubGlobal("React", React);
  config.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
async function render() {
  return renderToStaticMarkup(
    await PoliticaPage({ params: Promise.resolve({ slug: "privacidad" }) }),
  );
}
describe("policy page recovery", () => {
  it("shows retry for a failed config read instead of claiming missing policy text", async () => {
    config.mockResolvedValue({ ...baseConfig, consultaFallida: true });
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("No pudimos cargar esta información");
    expect(html).toContain('href="/politicas/privacidad"');
    expect(html).not.toContain("estará disponible próximamente");
  });
  it("recovers from rejected config loading on the next attempt", async () => {
    config.mockRejectedValueOnce(new Error("network"));
    expect(await render()).toContain("Reintentar");
    config.mockResolvedValueOnce({
      ...baseConfig,
      politicasHtml: {
        privacidad: '<h2>Aviso</h2><a href="java&#x73;cript:alert(1)">Consulta</a>',
      },
    });
    const html = await render();
    expect(html).toContain("<h2>Aviso</h2><a>Consulta</a>");
    expect(html).not.toContain("javascript");
    expect(html).not.toContain('role="alert"');
  });

  it.each(["__proto__", "constructor", "toString"])(
    "treats inherited object keys as unknown policy routes: %s",
    async (slug) => {
      config.mockResolvedValue(baseConfig);
      const html = renderToStaticMarkup(await PoliticaPage({ params: Promise.resolve({ slug }) }));
      expect(html).toContain("Información");
      expect(html).toContain("Esta información estará disponible próximamente.");
    },
  );
  it("only claims uncaptured information after a successful config read", async () => {
    config.mockResolvedValue(baseConfig);
    expect(await render()).toContain("Esta información estará disponible próximamente.");
  });
});
