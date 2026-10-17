import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../src/lib/api")>()),
  api: vi.fn(),
}));
import { GET } from "../src/app/api/recovery/[codigo]/route";
import { ApiError, api } from "../src/lib/api";
import { codigoRecoveryValido, leerCarritoRecovery } from "../src/lib/recovery-contract";
const line = { varianteId: "variant1", nombre: "Producto", precioUnitario: "35.50", cantidad: "2" };
const codigo = "rec_0123456789abcdef01234567";
const run = (code = codigo, signal?: AbortSignal) =>
  GET(new Request(`https://shop.test/api/recovery/${code}`, { signal }), {
    params: Promise.resolve({ codigo: code }),
  });
beforeEach(() => vi.resetAllMocks());
describe("recovery snapshots never overwrite a cart without validated data", () => {
  it("returns only product lines, discarding internal cart and personal fields", async () => {
    vi.mocked(api).mockResolvedValue({
      id: "private",
      subtotal: "private",
      emailAnonimo: "private",
      items: [{ ...line, clienteId: "private" }],
    });
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [line] });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(api).toHaveBeenCalledWith(`/tienda/recovery/${codigo}`, {
      signal: expect.any(AbortSignal),
    });
  });
  it.each(["", "short", "../private", "a?query=private", "x".repeat(101)])(
    "rejects unsafe code %s before API",
    async (code) => {
      expect(codigoRecoveryValido(code)).toBe(false);
      const res = await run(code);
      expect(res.status).toBe(400);
      expect(api).not.toHaveBeenCalled();
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    },
  );
  it.each([
    null,
    {},
    { items: {} },
    { items: [line, line] },
    { items: Array(101).fill(line) },
    ...[
      { varianteId: "../id" },
      { nombre: " " },
      { nombre: "x".repeat(301) },
      { cantidad: "NaN" },
      { cantidad: "Infinity" },
      { cantidad: "0" },
      { cantidad: "-2" },
      { cantidad: "100001" },
      { cantidad: "1e2" },
      { cantidad: "1.0001" },
      { cantidad: 1 },
      { precioUnitario: "-1" },
      { precioUnitario: "Infinity" },
      { precioUnitario: "1e2" },
      { precioUnitario: "1.001" },
      { precioUnitario: 35 },
    ].map((patch) => ({ items: [{ ...line, ...patch }] })),
  ])(
    "rejects a complete malformed snapshot %# without returning partial contents",
    async (value) => {
      expect(leerCarritoRecovery(value)).toBeNull();
      vi.mocked(api).mockResolvedValue(value);
      const res = await run();
      expect(res.status).toBe(502);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(await res.json()).toEqual({ message: expect.stringContaining("se conserva") });
    },
  );
  it("retains empty carts and weighted products with free prices", async () => {
    expect(leerCarritoRecovery({ items: [] })).toEqual([]);
    expect(
      leerCarritoRecovery({
        items: [{ ...line, cantidad: "0.125", precioUnitario: "0", nombre: "  Peso  " }],
      }),
    ).toEqual([{ varianteId: "variant1", titulo: "Peso", cantidad: 0.125, precio: "0" }]);
  });
  it.each([404, 410, 429, 500, 401])(
    "maps upstream %s safely without internal details",
    async (status) => {
      vi.mocked(api).mockRejectedValue(new ApiError(status, "PRIVATE"));
      const res = await run();
      expect(res.status).toBe([404, 410, 429].includes(status) ? status : 503);
      expect(await res.text()).not.toContain("PRIVATE");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    },
  );
  it("bounds the complete request including authentication and body reading", async () => {
    const controller = new AbortController();
    vi.mocked(api).mockImplementation(async (_path, opts) => {
      controller.abort();
      expect(opts?.signal?.aborted).toBe(true);
      return { items: [line] };
    });
    expect((await run(codigo, controller.signal)).status).toBe(503);
  });
  it("handles network failure as retryable, with a generic message", async () => {
    vi.mocked(api).mockRejectedValue(new Error("PRIVATE"));
    const res = await run();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("PRIVATE");
  });
});
