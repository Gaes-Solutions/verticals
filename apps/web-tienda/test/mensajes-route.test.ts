import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/cliente", () => ({ getClienteToken: vi.fn() }));
import { getClienteToken } from "@/lib/cliente";
import { GET, POST } from "../src/app/api/cuenta/pedidos/[folio]/mensajes/route";
const mensaje = {
  id: "m1",
  autorTipo: "cliente",
  cuerpo: "Hola",
  createdAt: "2026-10-17T12:00:00Z",
};
const params = () => ({ params: Promise.resolve({ folio: "QA /1" }) });
const req = (body: unknown = { cuerpo: "Hola" }) =>
  new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) });
describe("order messages boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClienteToken).mockResolvedValue("test-token");
  });
  afterEach(() => vi.unstubAllGlobals());
  it.each([GET, POST])("rejects guests without an upstream request", async (handler) => {
    vi.mocked(getClienteToken).mockResolvedValue(null);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const res = await handler(req(), params());
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("accepts history and bounds a private escaped request", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json([{ ...mensaje, usuario: null }]));
    vi.stubGlobal("fetch", fetch);
    expect((await GET(req(), params())).status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/QA%20%2F1/mensajes"),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        redirect: "error",
        cache: "no-store",
      }),
    );
  });
  it.each(
    [{}, null, [mensaje, mensaje], [{ ...mensaje, createdAt: "invalid" }]].map((data) => ({
      data,
    })),
  )("rejects malformed history %j", async ({ data }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
    expect((await GET(req(), params())).status).toBe(502);
  });
  it("shares one deadline between session verification and message fetch", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetch);
    await GET(req(), params());
    expect(vi.mocked(getClienteToken).mock.calls[0]?.[0]).toBe(fetch.mock.calls[0][1].signal);
  });
  it("forwards only the trimmed body, never a supplied author or customer", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(mensaje, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    expect(
      (await POST(req({ cuerpo: " Hola ", autorTipo: "empleado", clienteId: "foreign" }), params()))
        .status,
    ).toBe(201);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ cuerpo: "Hola" });
  });
  it.each([{}, { cuerpo: " " }, { cuerpo: "a".repeat(2001) }])(
    "rejects invalid input before forwarding",
    async (body) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      expect((await POST(req(body), params())).status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([{}, { ...mensaje, cuerpo: "Other" }, { ...mensaje, autorTipo: "empleado" }])(
    "does not falsely confirm a send",
    async (data) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
      expect((await POST(req(), params())).status).toBe(502);
    },
  );
  it.each([401, 403, 404, 429])(
    "preserves access/rate status %i without exposing internal details",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(Response.json({ message: "private upstream detail" }, { status })),
      );
      const res = await POST(req(), params());
      expect(res.status).toBe(status);
      expect(await res.text()).not.toContain("private upstream detail");
    },
  );
  it.each([GET, POST])("recovers network errors safely", async (handler) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private detail")));
    const res = await handler(req(), params());
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("private detail");
  });
});
