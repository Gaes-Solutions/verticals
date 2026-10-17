import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cliente", () => ({ getClienteToken: vi.fn() }));
import { getClienteToken } from "@/lib/cliente";
import { GET } from "../src/app/api/cuenta/pedidos/[folio]/factura/pdf/route";

const get = () =>
  GET(new Request("http://localhost/api/cuenta/pedidos/QA/factura/pdf"), {
    params: Promise.resolve({ folio: "QA /123" }),
  });
describe("private invoice PDF", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClienteToken).mockResolvedValue("buyer-token");
  });
  afterEach(() => vi.unstubAllGlobals());
  it("requires a buyer session", async () => {
    vi.mocked(getClienteToken).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await get()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserves binary PDF bytes and sends no reusable private cache or upstream headers", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 0, 255, 128]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bytes, {
        headers: {
          "content-type": "application/pdf",
          "set-cookie": "provider=private",
          "content-disposition": "inline; filename=unsafe",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await get();
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("content-disposition")).toBe('inline; filename="factura.pdf"');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/QA%20%2F123/factura/pdf"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer buyer-token" }),
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it.each([401, 403, 404])("preserves upstream ownership/missing status %i", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ message: "No disponible" }, { status })),
    );
    expect((await get()).status).toBe(status);
  });
  it.each([
    ["text/html", "<html>gateway</html>"],
    ["application/pdf", "not actually a PDF"],
    ["application/pdf", ""],
  ])("rejects fake or unavailable PDF %s", async (type, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(body, { headers: { "content-type": type } })),
    );
    const response = await get();
    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
  it("handles a lost provider response without leaking exception details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret backend address")));
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret backend address");
  });
  it("handles a PDF stream that fails after headers have arrived", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error("private broken stream"));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(stream, { headers: { "content-type": "application/pdf" } }),
        ),
    );
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private broken stream");
  });
  it("does not mask a session verification outage as a guest or leak it", async () => {
    vi.mocked(getClienteToken).mockRejectedValue(new Error("private session detail"));
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private session detail");
  });
});
