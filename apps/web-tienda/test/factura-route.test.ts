import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cliente", () => ({ getClienteToken: vi.fn() }));
import { getClienteToken } from "@/lib/cliente";
import { GET, POST } from "../src/app/api/cuenta/pedidos/[folio]/factura/route";

const params = () => ({ params: Promise.resolve({ folio: "QA /123" }) });
const request = () =>
  new Request("http://localhost/api/cuenta/pedidos/QA/factura", {
    method: "POST",
    body: JSON.stringify({ rfcReceptor: "XAXX010101000" }),
  });

describe("invoice proxy contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClienteToken).mockResolvedValue("buyer-token");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rejects guests without contacting the invoice service", async () => {
    vi.mocked(getClienteToken).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request(), params())).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["{}", "null", "<html>gateway</html>"])(
    "does not confirm issuance for %s",
    async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
      expect((await POST(request(), params())).status).toBe(502);
    },
  );
  it("returns safe uncertainty on lost issuance response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private provider detail")));
    const response = await POST(request(), params());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider detail");
  });
  it("does not interpret an invalid state response as no invoice", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    expect((await GET(new Request("http://localhost"), params())).status).toBe(502);
  });
  it("accepts an explicit null state without inventing an invoice", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(null)));
    expect(await (await GET(new Request("http://localhost"), params())).json()).toBeNull();
  });
  it("bounds the call, forwards only the authenticated buyer and escapes the folio", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ cfdiId: "cfdi-qa", folioFiscal: "uuid-qa" }, { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request(), params());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/QA%20%2F123/factura"),
      expect.objectContaining({
        headers: { "Content-Type": "application/json", Authorization: "Bearer buyer-token" },
        signal: expect.any(AbortSignal),
        cache: "no-store",
      }),
    );
  });
});
