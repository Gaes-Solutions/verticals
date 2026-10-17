import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../src/lib/api")>()),
  api: vi.fn(),
}));
import { ApiError, api } from "@/lib/api";
import { GET } from "../src/app/api/cupon/route";
import { esCuponEvaluado, subtotalCuponValido } from "../src/lib/cupon-contract";
const valid = {
  valido: true,
  codigo: "PROMO10",
  mensaje: "Cupón aplicado",
  descuentoSubtotal: "10.00",
  envioGratis: false,
};
const req = (codigo = "PROMO10", subtotal = "100.0000", signal?: AbortSignal) =>
  new NextRequest(`http://localhost/api/cupon?${new URLSearchParams({ codigo, subtotal })}`, {
    signal,
  });
describe("verified coupon feedback", () => {
  beforeEach(() => vi.resetAllMocks());
  it("normalizes code, binds amount, shares deadline and filters extra response fields", async () => {
    vi.mocked(api).mockResolvedValue({ ...valid, private: "not forwarded" });
    const res = await GET(req(" promo10 "));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(valid);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(api).toHaveBeenCalledWith("/tienda/cupon?codigo=PROMO10&subtotal=100.0000", {
      signal: expect.any(AbortSignal),
    });
  });
  it("keeps an explicitly rejected coupon distinct from an unavailable service", async () => {
    const rejected = {
      ...valid,
      valido: false,
      mensaje: "Cupón expirado",
      descuentoSubtotal: "0.00",
    };
    vi.mocked(api).mockResolvedValueOnce(rejected);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rejected);
    vi.mocked(api).mockRejectedValueOnce(new Error("PRIVATE UPSTREAM"));
    const failure = await GET(req());
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("PRIVATE");
  });
  it.each(
    [
      {},
      null,
      { ...valid, codigo: "OTHER" },
      { ...valid, valido: "yes" },
      { ...valid, descuentoSubtotal: "NaN" },
      { ...valid, descuentoSubtotal: "-1.00" },
      { ...valid, descuentoSubtotal: "101.00" },
      { ...valid, descuentoSubtotal: "1e2" },
      { ...valid, envioGratis: "true" },
      { ...valid, valido: false },
      { ...valid, valido: false, descuentoSubtotal: "0.00", envioGratis: true },
    ].map((data) => ({ data })),
  )("rejects malformed or mismatched successful previews", async ({ data }) => {
    vi.mocked(api).mockResolvedValue(data);
    expect((await GET(req())).status).toBe(502);
  });
  it.each(["", "A", "A B", "A&x=1", "X".repeat(41)])(
    "rejects bad code %j locally",
    async (codigo) => {
      expect((await GET(req(codigo))).status).toBe(400);
      expect(api).not.toHaveBeenCalled();
    },
  );
  it.each(["", "-1", "NaN", "Infinity", "1e4", "0.00001", "9".repeat(20)])(
    "rejects invalid monetary subtotal %j",
    async (subtotal) => {
      expect((await GET(req("PROMO10", subtotal))).status).toBe(400);
      expect(api).not.toHaveBeenCalled();
    },
  );
  it.each([400, 429, 500])("sanitizes upstream %i", async (status) => {
    vi.mocked(api).mockRejectedValue(new ApiError(status));
    const res = await GET(req());
    expect(res.status).toBe(status === 500 ? 503 : status);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("never confirms an aborted request", async () => {
    const c = new AbortController();
    c.abort();
    vi.mocked(api).mockResolvedValue(valid);
    expect((await GET(req("PROMO10", "100.00", c.signal))).status).toBe(503);
  });
  it("accepts free shipping without fabricating a product discount", () => {
    expect(
      esCuponEvaluado(
        { ...valid, descuentoSubtotal: "0.00", envioGratis: true },
        "PROMO10",
        "100.00",
      ),
    ).toBe(true);
  });
  it("keeps four decimal places for quantity-based eligibility", () => {
    expect(subtotalCuponValido("99.9999")).toBe(true);
    expect(esCuponEvaluado({ ...valid, descuentoSubtotal: "99.99" }, "PROMO10", "99.9999")).toBe(
      true,
    );
  });
});
