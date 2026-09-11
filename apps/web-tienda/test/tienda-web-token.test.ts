import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-tienda-slug": "gaesland1" }),
}));

/**
 * La tienda entra a cada negocio con la llave de plataforma. Antes usaba la
 * contraseña del dueño guardada en una variable, una por negocio.
 */
describe("acceso de la tienda web al API", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.API_URL = "http://api.test";
    process.env.STOREFRONT_SERVICE_KEY = "llave-secreta";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pide su token con la llave, no con la contraseña de nadie", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: "tok-1" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ nombre: "Gaesland" })));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("../src/lib/api");

    await api("/tienda/config-publica");

    const [urlToken, pedidoToken] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(urlToken).toBe("http://api.test/public/storefront/token");
    expect((pedidoToken.headers as Record<string, string>)["x-storefront-key"]).toBe(
      "llave-secreta",
    );
    expect(JSON.parse(String(pedidoToken.body))).toEqual({ tenantSlug: "gaesland1" });

    const [urlApi, pedidoApi] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(urlApi).toBe("http://api.test/t/tienda/config-publica");
    expect((pedidoApi.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
  });
});
