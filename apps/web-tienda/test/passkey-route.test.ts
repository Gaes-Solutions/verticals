import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/cliente", () => ({ getClienteToken: vi.fn(), COOKIE: "gaespos_cliente_token" }));
vi.mock("@/lib/api", () => ({ slugActual: vi.fn().mockResolvedValue("fixture-shop") }));
import { POST } from "../src/app/api/cuenta/passkey/[accion]/route";
import { getClienteToken } from "../src/lib/cliente";
import { listaLlaves, opcionesLogin, opcionesRegistro } from "../src/lib/passkey-contract";
const origin = "https://shop.example";
const key = { id: "qa-key", deviceName: "QA", createdAt: "2026-10-17T12:00:00Z", lastUsedAt: null };
const login = {
  options: { challenge: "Y2hhbGxlbmdl", rpId: "shop.example", userVerification: "required" },
  challengeToken: "fixture-challenge",
};
const registration = {
  options: {
    challenge: "Y2hhbGxlbmdl",
    rp: { id: "shop.example", name: "QA" },
    user: { id: "dXNlcg", name: "qa@example.invalid", displayName: "QA" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  },
  challengeToken: "fixture-challenge",
};
const session = {
  accessToken: "e30.e30.c2ln",
  cliente: { id: "qa-user", nombre: "QA", email: "qa@example.invalid" },
};
const cases = [
  { action: "list", body: {}, result: [key] },
  { action: "remove", body: { id: "qa-key" }, result: { ok: true } },
  { action: "register-options", body: { password: "password" }, result: registration },
  {
    action: "register-verify",
    body: { response: { id: "fixture" }, challengeToken: "fixture", deviceName: "QA" },
    result: { ok: true },
  },
  { action: "login-options", body: {}, result: login },
  {
    action: "login-verify",
    body: { response: { id: "fixture" }, challengeToken: "fixture" },
    result: session,
  },
];
function run(
  action: string,
  body: unknown = {},
  headers: Record<string, string> = { origin, host: "shop.example" },
  signal?: AbortSignal,
) {
  return POST(
    new Request(`${origin}/api/cuenta/passkey/${action}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    }),
    { params: Promise.resolve({ accion: action }) },
  );
}
describe("customer passkey BFF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClienteToken).mockResolvedValue("fixture-token");
  });
  afterEach(() => vi.unstubAllGlobals());
  for (const c of cases) {
    it(`${c.action}: accepts the documented receipt with a private bounded request`, async () => {
      const fetch = vi.fn().mockResolvedValue(Response.json(c.result));
      vi.stubGlobal("fetch", fetch);
      const res = await run(c.action, c.body);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(fetch.mock.calls[0][1]).toMatchObject({
        signal: expect.any(AbortSignal),
        cache: "no-store",
        redirect: "error",
      });
      if (!c.action.startsWith("login-"))
        expect(vi.mocked(getClienteToken).mock.calls[0]?.[0]).toBe(fetch.mock.calls[0][1].signal);
      if (c.action === "login-verify") {
        expect(await res.json()).toEqual({ cliente: session.cliente });
        const cookie = res.headers.get("set-cookie") ?? "";
        expect(cookie).toContain("gaespos_cliente_token=");
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=lax/i);
        expect(cookie).toMatch(/Path=\//i);
      }
    });
    it(`${c.action}: rejects empty successful data without issuing a session`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
      const res = await run(c.action, c.body);
      expect(res.status).toBe(502);
      expect(res.headers.get("set-cookie")).toBeNull();
    });
    it(`${c.action}: sanitizes provider failures`, async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ message: "PRIVATE PROVIDER DETAIL" }, { status: 429 }),
          ),
      );
      const res = await run(c.action, c.body);
      expect(res.status).toBe(429);
      expect(await res.text()).not.toContain("PRIVATE");
      expect(res.headers.get("set-cookie")).toBeNull();
    });
    it(`${c.action}: catches network failures`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("PRIVATE NETWORK")));
      const res = await run(c.action, c.body);
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("PRIVATE");
    });
    if (!c.action.startsWith("login-"))
      it(`${c.action}: guests cannot reach the provider`, async () => {
        vi.mocked(getClienteToken).mockResolvedValueOnce(null);
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        expect((await run(c.action, c.body)).status).toBe(401);
        expect(fetch).not.toHaveBeenCalled();
      });
  }
  it.each([
    {},
    { origin, host: "other.example" },
    { origin: "https://attacker.example", host: "shop.example" },
    { origin: "null", host: "shop.example" },
    { origin: "http://shop.example", host: "shop.example" },
    { origin: `${origin}/`, host: "shop.example" },
  ])("rejects untrusted request origins", async (headers) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const res = await run("list", {}, headers as Record<string, string>);
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each(
    [
      { accessToken: "", cliente: session.cliente },
      { accessToken: " ", cliente: session.cliente },
      { accessToken: "not-a-jwt", cliente: session.cliente },
      { ...session, cliente: null },
      { ...session, cliente: { id: "" } },
      { ...session, cliente: { ...session.cliente, email: null } },
    ].map((data) => ({ data })),
  )("never sets a cookie for a malformed login result", async ({ data }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
    const res = await run("login-verify", cases[5]?.body);
    expect(res.status).toBe(502);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it.each(
    [
      ["remove", {}],
      ["remove", { id: " " }],
      ["register-options", { password: "" }],
      ["register-options", { password: "x".repeat(121) }],
      ["register-verify", { response: {}, challengeToken: "x", deviceName: " " }],
      ["login-verify", { response: null, challengeToken: "x" }],
    ].map(([action, body]) => ({ action: action as string, body })),
  )("filters malformed input before writing", async ({ action, body }) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await run(action, body)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("binds origin/tenant server-side and drops injected identity fields", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await run("remove", {
      id: "qa-key",
      tenantSlug: "victim",
      origin: "https://attacker.example",
      clienteId: "other",
      password: "NOT FORWARD",
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      id: "qa-key",
      tenantSlug: "fixture-shop",
      origin,
    });
  });
  it("catches session outages and aborted requests before mutation", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.mocked(getClienteToken).mockRejectedValueOnce(new Error("PRIVATE"));
    expect((await run("list")).status).toBe(503);
    const c = new AbortController();
    c.abort();
    expect((await run("remove", { id: "qa" }, undefined, c.signal)).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unknown operations", async () => {
    expect((await run("unknown")).status).toBe(404);
  });
  it.each(
    [null, {}, [key, key], [{ ...key, lastUsedAt: "bad" }], [{ ...key, deviceName: null }]].map(
      (data) => ({ data }),
    ),
  )("validates list structure and unique IDs", ({ data }) => expect(listaLlaves(data)).toBe(false));
  it("rejects another RP and lowered device verification", () => {
    expect(opcionesLogin(login, "other.example")).toBe(false);
    expect(
      opcionesLogin(
        { ...login, options: { ...login.options, userVerification: "preferred" } },
        "shop.example",
      ),
    ).toBe(false);
    expect(opcionesRegistro(registration, "other.example")).toBe(false);
    expect(
      opcionesRegistro(
        {
          ...registration,
          options: {
            ...registration.options,
            authenticatorSelection: { userVerification: "required" },
          },
        },
        "shop.example",
      ),
    ).toBe(false);
  });
});
