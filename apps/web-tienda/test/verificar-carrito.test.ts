import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../src/lib/api")>()),
  api: vi.fn(),
}));
import { POST } from "../src/app/api/carrito/verificar/route";
import { ApiError, api } from "../src/lib/api";
import {
  leerVerificacionCarrito,
  seleccionCarritoValida,
} from "../src/lib/verificar-carrito-contract";
const selection = [{ varianteId: "qa1", cantidad: 2 }];
const row = { ...selection[0], estado: "publicado", precio: "125.50" };
function request(
  body: unknown = { items: selection },
  origin = "https://shop.test",
  signal?: AbortSignal,
) {
  return new Request("https://shop.test/api/carrito/verificar", {
    method: "POST",
    headers: { origin, host: "shop.test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
beforeEach(() => vi.resetAllMocks());
describe("live cart verification is read-only, bounded and exact", () => {
  it("forwards only variant/quantity, filtering caller identity and prices", async () => {
    vi.mocked(api).mockResolvedValue({
      items: [{ ...row, internal: "PRIVATE" }],
      internal: "PRIVATE",
    });
    const res = await POST(
      request({
        items: [{ ...selection[0], precio: "0", clienteId: "OTHER" }],
        clienteId: "OTHER",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [row] });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(api).toHaveBeenCalledWith("/tienda/carrito/verificar", {
      method: "POST",
      body: { items: selection },
      signal: expect.any(AbortSignal),
    });
  });
  it("rejects cross origin before any call", async () => {
    expect((await POST(request(undefined, "https://evil.test"))).status).toBe(403);
    expect(api).not.toHaveBeenCalled();
  });
  it.each(
    [
      [],
      [selection[0], selection[0]],
      Array(101).fill(selection[0]),
      [{ varianteId: "../private", cantidad: 1 }],
      ...[0, -1, 100001, 1.0001, "2", null].map((cantidad) => [{ varianteId: "qa1", cantidad }]),
    ].map((items) => ({ items })),
  )("rejects unsafe selection %#", async ({ items }) => {
    expect(seleccionCarritoValida(items)).toBe(false);
    expect((await POST(request({ items }))).status).toBe(400);
    expect(api).not.toHaveBeenCalled();
  });
  it("retains exact fractional quantities and complete unavailable states", () => {
    expect(seleccionCarritoValida([{ varianteId: "qa1", cantidad: 0.125 }])).toBe(true);
    expect(
      leerVerificacionCarrito(
        { items: [{ ...row, estado: "no_publicado", precio: null }] },
        selection,
      ),
    ).toEqual([{ ...row, estado: "no_publicado", precio: null }]);
    expect(
      leerVerificacionCarrito({ items: [{ ...row, estado: "insuficiente" }] }, selection),
    ).toEqual([{ ...row, estado: "insuficiente" }]);
  });
  it.each([
    null,
    {},
    { items: [] },
    { items: [row, row] },
    ...[
      { varianteId: "other" },
      { cantidad: 1 },
      { cantidad: "2" },
      { estado: "available" },
      { precio: "NaN" },
      { precio: "-1" },
      { precio: "1e2" },
      { precio: 100 },
      { estado: "no_publicado" },
    ].map((p) => ({ items: [{ ...row, ...p }] })),
  ])("rejects mismatched or malformed receipts %#", async (value) => {
    expect(leerVerificacionCarrito(value, selection)).toBeNull();
    vi.mocked(api).mockResolvedValue(value);
    const res = await POST(request());
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("PRIVATE");
  });
  it.each([400, 404, 429, 500, 401])(
    "maps upstream %s to a safe private response",
    async (status) => {
      vi.mocked(api).mockRejectedValue(new ApiError(status, "PRIVATE"));
      const res = await POST(request());
      expect(res.status).toBe([400, 404, 429].includes(status) ? status : 503);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(await res.text()).not.toContain("PRIVATE");
    },
  );
  it("aborts the complete upstream operation with the caller", async () => {
    const c = new AbortController();
    vi.mocked(api).mockImplementation(async (_path, opts) => {
      c.abort();
      expect(opts?.signal?.aborted).toBe(true);
      return { items: [row] };
    });
    expect((await POST(request(undefined, undefined, c.signal))).status).toBe(503);
  });
});
