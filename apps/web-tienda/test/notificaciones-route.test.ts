import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/cliente", () => ({ getClienteToken: vi.fn() }));
import { POST as mark } from "../src/app/api/cuenta/notificaciones/[id]/leer/route";
import { POST as all } from "../src/app/api/cuenta/notificaciones/leer-todas/route";
import { GET } from "../src/app/api/cuenta/notificaciones/route";
import { getClienteToken } from "../src/lib/cliente";
const req = () => new Request("http://localhost/api/cuenta/notificaciones");
const ctx = () => ({ params: Promise.resolve({ id: "QA /notice" }) });
const notice = {
  id: "n1",
  tipo: "pedido",
  titulo: "Tu pedido",
  cuerpo: "Actualizado",
  link: "/cuenta/pedidos/QA",
  leida: false,
  createdAt: "2026-10-17T12:00:00Z",
};
describe("shopper notification response boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClienteToken).mockResolvedValue("fixture-token");
  });
  afterEach(() => vi.unstubAllGlobals());
  const handlers = [() => GET(req()), () => mark(req(), ctx()), () => all(req())];
  for (const [index, handler] of handlers.entries()) {
    it(`${index}: guest access is private and never reaches upstream`, async () => {
      vi.mocked(getClienteToken).mockResolvedValue(null);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const res = await handler();
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(fetch).not.toHaveBeenCalled();
    });
    it(`${index}: rejects an empty successful receipt`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
      expect((await handler()).status).toBe(502);
    });
    it(`${index}: recovers from upstream failure without leaking details`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network detail")));
      const res = await handler();
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("private network detail");
    });
    it.each([401, 403, 404, 429])(`${index}: preserves access/rate status %i`, async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ message: "private" }, { status })),
      );
      const res = await handler();
      expect(res.status).toBe(status);
      expect(await res.text()).not.toContain("private");
    });
  }
  it("validates a paginated count instead of requiring it to equal the visible unread rows", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ items: [notice], noLeidas: 40 }));
    vi.stubGlobal("fetch", fetch);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      signal: expect.any(AbortSignal),
      redirect: "error",
      cache: "no-store",
    });
    expect(vi.mocked(getClienteToken).mock.calls[0]?.[0]).toBe(fetch.mock.calls[0][1].signal);
  });
  it.each([
    { items: [notice], noLeidas: -1 },
    { items: [notice], noLeidas: 1.5 },
    { items: [notice, notice], noLeidas: 2 },
    { items: [{ ...notice, createdAt: "invalid" }], noLeidas: 1 },
    { items: [{ ...notice, titulo: 4 }], noLeidas: 1 },
  ])("rejects malformed histories", async (data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
    expect((await GET(req())).status).toBe(502);
  });
  it.each([true, false])(
    "preserves an explicit single-read result %j for reconciliation",
    async (ok) => {
      const fetch = vi.fn().mockResolvedValue(Response.json({ ok }));
      vi.stubGlobal("fetch", fetch);
      const res = await mark(req(), ctx());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok });
      expect(fetch.mock.calls[0][0]).toContain("QA%20%2Fnotice/leer");
    },
  );
  it.each([0, 4])("accepts an explicit nonnegative mark-all count %i", async (marcadas) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ marcadas })));
    expect((await all(req())).status).toBe(200);
  });
  it.each([-1, 1.5, "2"])("rejects invalid mark-all counts", async (marcadas) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ marcadas })));
    expect((await all(req())).status).toBe(502);
  });
});
