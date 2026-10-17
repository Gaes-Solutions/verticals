import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/cliente", () => ({ getClienteToken: vi.fn() }));
import { getClienteToken } from "@/lib/cliente";
import { DELETE, PUT } from "../src/app/api/cuenta/direcciones/[id]/route";
import { GET, POST } from "../src/app/api/cuenta/direcciones/route";
const req = (method: string) =>
  new Request("http://localhost/api/cuenta/direcciones/qa", {
    method,
    ...(method === "POST" || method === "PUT" ? { body: JSON.stringify({ calle: "Prueba" }) } : {}),
  });
const params = () => ({ params: Promise.resolve({ id: "qa /id" }) });
describe("address response contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClienteToken).mockResolvedValue("buyer-token");
  });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps the guest empty-list contract without contacting the backend", async () => {
    vi.mocked(getClienteToken).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET();
    expect(await response.json()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["POST", "PUT", "DELETE"])("requires a session before %s", async (method) => {
    vi.mocked(getClienteToken).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response =
      method === "POST"
        ? await POST(req(method))
        : method === "PUT"
          ? await PUT(req(method), params())
          : await DELETE(req(method), params());
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("accepts valid lists including nullable historical address fields", async () => {
    const rows = [
      {
        id: "qa",
        etiqueta: "Casa",
        calle: "Calle QA",
        numeroExterior: null,
        colonia: null,
        municipio: null,
        estado: null,
        codigoPostal: null,
        referencias: null,
        isDefaultEnvio: false,
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(rows)));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(rows);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("confirms a created ID and bounds the authenticated provider call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "qa" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(req("POST"));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "qa" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cliente-portal/direcciones"),
      expect.objectContaining({
        headers: { Authorization: "Bearer buyer-token", "Content-Type": "application/json" },
        signal: expect.any(AbortSignal),
        redirect: "error",
        cache: "no-store",
      }),
    );
  });
  it("escapes the address ID when confirming an update", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await PUT(req("PUT"), params())).status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/direcciones/qa%20%2Fid");
  });
  it("preserves a confirmed 204 deletion without a body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const response = await DELETE(req("DELETE"), params());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each([401, 403, 404])("preserves ownership/session failures %i", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ message: "No disponible" }, { status })),
    );
    const response = await PUT(req("PUT"), params());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ message: "No disponible" });
  });
  it.each(["null", "{}", "<html>gateway</html>", "[{}]"])(
    "rejects invalid successful list %s",
    async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
      expect((await GET()).status).toBe(502);
    },
  );
  it("does not confirm creation without an address ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    expect((await POST(req("POST"))).status).toBe(502);
  });
  it("does not confirm an update without explicit ok:true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    expect((await PUT(req("PUT"), params())).status).toBe(502);
  });
  it("does not confirm deletion for a gateway HTML 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>gateway</html>")));
    expect((await DELETE(req("DELETE"), params())).status).toBe(502);
  });
  it.each(["GET", "POST", "PUT", "DELETE"])(
    "handles %s network failures without leaking details",
    async (method) => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network detail")));
      const r =
        method === "GET"
          ? await GET()
          : method === "POST"
            ? await POST(req(method))
            : method === "PUT"
              ? await PUT(req(method), params())
              : await DELETE(req(method), params());
      expect(r.status).toBe(503);
      expect(await r.text()).not.toContain("private network detail");
    },
  );
});
