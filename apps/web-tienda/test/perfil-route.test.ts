import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/cliente", () => ({ getClienteToken: vi.fn() }));
import { POST } from "../src/app/api/cuenta/cambiar-password/route";
import { PUT } from "../src/app/api/cuenta/perfil/route";
import { getClienteToken } from "../src/lib/cliente";
const profile = { nombre: " QA ", apellidos: " Demo ", telefono: " 123 " };
const password = { actual: " old password ", nueva: " new password " };
const request = (body: unknown, signal?: AbortSignal) =>
  new Request("http://localhost/api/cuenta", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
describe("account persistence boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClienteToken).mockResolvedValue("fixture");
  });
  afterEach(() => vi.unstubAllGlobals());
  for (const [handler, body] of [
    [PUT, profile],
    [POST, password],
  ] as const) {
    const run = () => handler(request(body));
    it(`${handler.name}: denies guests without upstream or cache`, async () => {
      vi.mocked(getClienteToken).mockResolvedValue(null);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const res = await run();
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(fetch).not.toHaveBeenCalled();
    });
    it.each([{}, { ok: false }, { ok: "true" }, null, []].map((data) => ({ data })))(
      `${handler.name}: never turns an invalid receipt into success`,
      async ({ data }) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
        expect((await run()).status).toBe(502);
      },
    );
    it(`${handler.name}: confirms only explicit persistence and strips upstream fields`, async () => {
      const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, private: "secret" }));
      vi.stubGlobal("fetch", fetch);
      const res = await run();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(fetch.mock.calls[0][1]).toMatchObject({
        signal: expect.any(AbortSignal),
        redirect: "error",
        cache: "no-store",
      });
      expect(vi.mocked(getClienteToken).mock.calls[0]?.[0]).toBe(fetch.mock.calls[0][1].signal);
    });
    it.each([400, 401, 403, 429, 500])(`${handler.name}: sanitizes failure %i`, async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ message: "private internals" }, { status })),
      );
      const res = await run();
      expect(res.status).toBe(status);
      expect(await res.text()).not.toContain("private internals");
    });
    it(`${handler.name}: catches auth and upstream outages`, async () => {
      vi.mocked(getClienteToken).mockRejectedValueOnce(new Error("secret auth"));
      expect((await run()).status).toBe(503);
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret upstream")));
      const res = await run();
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("secret");
    });
    it(`${handler.name}: stops an aborted request before mutation`, async () => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const controller = new AbortController();
      controller.abort();
      expect((await handler(request(body, controller.signal))).status).toBe(503);
      expect(fetch).not.toHaveBeenCalled();
    });
  }
  it.each(
    [
      null,
      [],
      {},
      { nombre: " " },
      { nombre: "a".repeat(121) },
      { nombre: "QA", apellidos: null },
      { nombre: "QA", telefono: "1".repeat(21) },
    ].map((data) => ({ data })),
  )("rejects bad profiles locally", async ({ data }) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await PUT(request(data))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(
    [
      null,
      {},
      { actual: "", nueva: "password" },
      { actual: "old", nueva: "short" },
      { actual: "old", nueva: "x".repeat(101) },
    ].map((data) => ({ data })),
  )("rejects bad passwords locally", async ({ data }) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await POST(request(data))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("filters profile fields and trims ordinary input", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await PUT(request({ ...profile, role: "admin", email: "not-forwarded", clienteId: "other" }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      nombre: "QA",
      apellidos: "Demo",
      telefono: "123",
    });
  });
  it("never trims or forwards extra password fields", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await POST(request({ ...password, clienteId: "other", role: "admin" }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(password);
  });
});
