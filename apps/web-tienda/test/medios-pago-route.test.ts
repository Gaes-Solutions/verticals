import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/cliente", () => ({ getClienteToken: vi.fn() }));
import { getClienteToken } from "@/lib/cliente";
import { DELETE } from "../src/app/api/cuenta/medios-pago/[id]/route";
import { GET, POST } from "../src/app/api/cuenta/medios-pago/route";
import { listaTarjetas } from "../src/lib/medios-pago-contract";
const MEDIO = { id: "cmp_1", marca: "visa", last4: "4242", expMes: 12, expAnio: 2028 };
const req = (body: unknown = { cardTokenId: "tok_1" }, signal?: AbortSignal) =>
  new Request("http://localhost/api/cuenta/medios-pago", {
    method: "POST",
    headers: { origin: "http://localhost", host: "localhost", "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
const remove = (id = "cmp_1", signal?: AbortSignal) =>
  DELETE(req({}, signal), { params: Promise.resolve({ id }) });
describe("saved card response boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClienteToken).mockResolvedValue("fixture-token");
  });
  afterEach(() => vi.unstubAllGlobals());
  const handlers = [() => GET(req()), () => POST(req()), () => remove()];
  for (const [index, handler] of handlers.entries()) {
    it(`${index}: guests receive private 401, never a fake empty list`, async () => {
      vi.mocked(getClienteToken).mockResolvedValue(null);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const res = await handler();
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(fetch).not.toHaveBeenCalled();
    });
    it(`${index}: empty successful data is not confirmation`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
      expect((await handler()).status).toBe(502);
    });
    it(`${index}: auth and upstream failures are caught`, async () => {
      vi.mocked(getClienteToken).mockRejectedValueOnce(new Error("PRIVATE AUTH"));
      expect((await handler()).status).toBe(503);
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("PRIVATE NETWORK")));
      const res = await handler();
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("PRIVATE");
    });
    it.each([401, 403, 404, 422, 429, 500])(
      `${index}: preserves failure %i without provider details`,
      async (status) => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(Response.json({ message: "PRIVATE PROVIDER" }, { status })),
        );
        const res = await handler();
        expect(res.status).toBe(status);
        expect(await res.text()).not.toContain("PRIVATE");
        expect(res.headers.get("cache-control")).toBe("private, no-store");
      },
    );
  }
  it("GET validates masks and strips all other fields", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json([
        {
          ...MEDIO,
          proveedorSourceId: "PRIVATE",
          proveedorCustomerId: "PRIVATE",
          pan: "PRIVATE",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetch);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([MEDIO]);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      signal: expect.any(AbortSignal),
      cache: "no-store",
      redirect: "error",
    });
    expect(vi.mocked(getClienteToken).mock.calls[0]?.[0]).toBe(fetch.mock.calls[0][1].signal);
  });
  it("GET accepts a verified empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));
    expect(await (await GET(req())).json()).toEqual([]);
  });
  it("POST forwards only the token and returns a verified masked card", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ...MEDIO, proveedorSourceId: "PRIVATE" }, { status: 201 }),
      );
    vi.stubGlobal("fetch", fetch);
    const res = await POST(req({ cardTokenId: "tok_1", clienteId: "victim", role: "admin" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(MEDIO);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ cardTokenId: "tok_1" });
  });
  it.each(
    [
      null,
      {},
      { cardTokenId: "" },
      { cardTokenId: "1234" },
      { cardTokenId: "x".repeat(201) },
      { cardTokenId: "      " },
    ].map((data) => ({ data })),
  )("POST rejects malformed input before writing", async ({ data }) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await POST(req(data))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([".", "..", "a/b", "a?b", "a\u0000b", ""])("DELETE rejects unsafe IDs %j", async (id) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await remove(id)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("DELETE confirms only 204", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const res = await remove();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(fetch.mock.calls[0][0]).toContain("/medios-pago/cmp_1");
  });
  it("DELETE rejects a successful JSON receipt instead of inventing 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    expect((await remove()).status).toBe(502);
  });
  it("stops aborted requests before a mutation", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const c = new AbortController();
    c.abort();
    expect((await remove("cmp_1", c.signal)).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(
    [
      {},
      null,
      [MEDIO, MEDIO],
      [{ ...MEDIO, last4: "4242424242424242" }],
      [{ ...MEDIO, expMes: 13 }],
      [{ ...MEDIO, expMes: 1.5 }],
      [{ ...MEDIO, expAnio: "2028" }],
      [{ ...MEDIO, marca: null }],
    ].map((data) => ({ data })),
  )("rejects corrupt masks and duplicate IDs", ({ data }) =>
    expect(listaTarjetas(data)).toBe(false),
  );
  it.each(["POST", "DELETE"] as const)(
    "%s rejects foreign origins before writing",
    async (method) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const request = new Request("http://localhost/api/cuenta/medios-pago", {
        method,
        headers: {
          host: "localhost",
          origin: "http://attacker.localhost",
          "content-type": "application/json",
        },
        body: method === "POST" ? JSON.stringify({ cardTokenId: "tok_1" }) : undefined,
      });
      const res =
        method === "POST"
          ? await POST(request)
          : await DELETE(request, { params: Promise.resolve({ id: "cmp_1" }) });
      expect(res.status).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
