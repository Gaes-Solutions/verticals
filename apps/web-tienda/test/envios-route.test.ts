import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../src/lib/api")>()),
  api: vi.fn(),
}));
import { GET } from "../src/app/api/envios/route";
import { ApiError, api } from "../src/lib/api";
import { leerCotizacionEnvio, subtotalEnvioValido } from "../src/lib/envios-contract";
const rate = {
  tarifaId: "rate1",
  nombrePublico: "Envío estándar",
  paqueteria: "propio",
  costo: "75.00",
  gratis: false,
  diasEntregaEstimados: 2,
};
const branch = { sucursalId: "branch1", nombre: "Sucursal QA", tiempoPreparacionPromedioMin: 30 };
const quote = { opcionesEnvio: [rate], pickup: [branch] };
const request = (
  query = "cp=06000&estado=Ciudad%20de%20Mexico&subtotal=150",
  signal?: AbortSignal,
) => new NextRequest(`http://localhost/api/envios?${query}`, { signal });
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());
describe("verified public delivery quotes", () => {
  it("filters unneeded upstream fields, preserves delivery choices and uses a shared deadline", async () => {
    vi.mocked(api).mockResolvedValue({
      ...quote,
      internal: "PRIVATE",
      opcionesEnvio: [{ ...rate, internal: "PRIVATE" }],
      pickup: [{ ...branch, internal: "PRIVATE", direccion: { private: true } }],
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(quote);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(api).toHaveBeenCalledWith(
      "/envios/cotizar?subtotal=150&cp=06000&estado=Ciudad+de+Mexico",
      { signal: expect.any(AbortSignal) },
    );
  });
  it("retains the pickup-only query with no destination and defaults missing subtotal to zero", async () => {
    vi.mocked(api).mockResolvedValue({ opcionesEnvio: [], pickup: [branch] });
    const response = await GET(request(""));
    expect(response.status).toBe(200);
    expect(api).toHaveBeenCalledWith("/envios/cotizar?subtotal=0", {
      signal: expect.any(AbortSignal),
    });
  });
  it("distinguishes real empty coverage from an unavailable service", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ opcionesEnvio: [], pickup: [] })
      .mockRejectedValueOnce(new Error("PRIVATE CREDENTIALS"));
    expect(await (await GET(request())).json()).toEqual({ opcionesEnvio: [], pickup: [] });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE");
  });
  it.each([
    "cp=abcde",
    "cp=1234",
    "cp=123456",
    "estado=A",
    `estado=${"x".repeat(41)}`,
    "subtotal=",
    "subtotal=-1",
    "subtotal=NaN",
    "subtotal=Infinity",
    "subtotal=1e999",
    "subtotal=0x10",
    `subtotal=${"9".repeat(80)}`,
  ])("rejects invalid input %s without upstream requests", async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(api).not.toHaveBeenCalled();
  });
  it.each(
    [
      null,
      {},
      { opcionesEnvio: [] },
      { ...quote, pickup: {} },
      ...[
        { tarifaId: "" },
        { nombrePublico: " " },
        { paqueteria: null },
        { costo: "NaN" },
        { costo: "-1" },
        { costo: "1.001" },
        { costo: 75 },
        { costo: "1e2" },
        { costo: "9".repeat(16) },
        { gratis: "true" },
        { gratis: true },
        { diasEntregaEstimados: -1 },
        { diasEntregaEstimados: 1.5 },
        { diasEntregaEstimados: "2" },
      ].map((patch) => ({ ...quote, opcionesEnvio: [{ ...rate, ...patch }] })),
      { ...quote, opcionesEnvio: [rate, rate] },
      { ...quote, pickup: [branch, branch] },
      { ...quote, pickup: [{ ...branch, tiempoPreparacionPromedioMin: "30" }] },
      { ...quote, pickup: [{ ...branch, sucursalId: "" }] },
    ].map((data) => ({ data })),
  )("rejects malformed successful quote %# instead of reporting no coverage", async ({ data }) => {
    vi.mocked(api).mockResolvedValue(data);
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).not.toHaveProperty("opcionesEnvio");
  });
  it.each([400, 429, 500])("sanitizes upstream HTTP %i", async (status) => {
    vi.mocked(api).mockRejectedValue(new ApiError(status, "PRIVATE"));
    const response = await GET(request());
    expect(response.status).toBe(status === 500 ? 503 : status);
    expect(await response.text()).not.toContain("PRIVATE");
  });
  it("does not confirm a request whose deadline expired, even if the mocked service responds", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(AbortSignal.abort());
    vi.mocked(api).mockResolvedValue(quote);
    expect((await GET(request())).status).toBe(503);
  });
  it("passes browser cancellation to the upstream request", async () => {
    const c = new AbortController();
    c.abort();
    vi.mocked(api).mockResolvedValue(quote);
    expect((await GET(request("subtotal=100", c.signal))).status).toBe(503);
    const signal = vi.mocked(api).mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(true);
  });
  it("supports fractional cart arithmetic and scientific notation emitted by JS without rounding it away", () => {
    expect(subtotalEnvioValido(String(0.1 * 0.2))).toBe(true);
    expect(subtotalEnvioValido("1e-7")).toBe(true);
    expect(subtotalEnvioValido("0")).toBe(true);
  });
  it("accepts verified free shipping, unknown ETA and genuine zero priced non-promotional shipping", () => {
    expect(
      leerCotizacionEnvio({
        opcionesEnvio: [{ ...rate, costo: "0.00", gratis: true, diasEntregaEstimados: null }],
        pickup: [],
      }),
    ).not.toBeNull();
    expect(
      leerCotizacionEnvio({ opcionesEnvio: [{ ...rate, costo: "0.00" }], pickup: [] }),
    ).not.toBeNull();
  });
});
