import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../src/lib/api")>()),
  api: vi.fn(),
}));
import { ApiError, api } from "@/lib/api";
import { GET } from "../src/app/api/seguimiento/route";
const pedido = {
  folioPublico: "QA-1",
  statusPedido: "recibido",
  total: "10.00",
  guiaTracking: null,
  eventos: [],
};
const req = (folio = "QA-1") =>
  new NextRequest(
    `http://localhost/api/seguimiento?folio=${encodeURIComponent(folio)}&email=qa%40example.invalid`,
  );
describe("verified public tracking", () => {
  beforeEach(() => vi.resetAllMocks());
  it("keeps a missing order distinct from a service outage", async () => {
    vi.mocked(api).mockRejectedValueOnce(new ApiError(404));
    expect((await GET(req())).status).toBe(404);
    vi.mocked(api).mockRejectedValueOnce(new Error("private network detail"));
    const response = await GET(req());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private network detail");
  });
  it("escapes the folio as a single path segment and keeps the purchase email separate", async () => {
    const folio = "QA?email=other@example.invalid&/../";
    vi.mocked(api).mockResolvedValue({ ...pedido, folioPublico: folio });
    await GET(req(folio));
    expect(api).toHaveBeenCalledWith(
      `/pedidos-ecommerce/seguimiento/${encodeURIComponent(folio)}?email=qa%40example.invalid`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it.each([
    {},
    null,
    { ...pedido, folioPublico: "OTHER" },
    { ...pedido, total: "NaN" },
    { ...pedido, eventos: null },
  ])("rejects invalid or mismatched successful response %#", async (value) => {
    vi.mocked(api).mockResolvedValue(value);
    expect((await GET(req())).status).toBe(502);
  });
  it("does not call upstream with missing required input", async () => {
    expect((await GET(new NextRequest("http://localhost/api/seguimiento?folio=QA"))).status).toBe(
      400,
    );
    expect(api).not.toHaveBeenCalled();
  });
  it.each([".", "..", "QA\u0000"])(
    "rejects path/control-only identifiers %s before upstream",
    async (folio) => {
      expect((await GET(req(folio))).status).toBe(400);
      expect(api).not.toHaveBeenCalled();
    },
  );
  it("returns a valid verified order without reusable personal caching", async () => {
    vi.mocked(api).mockResolvedValue(pedido);
    const response = await GET(req());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(pedido);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
