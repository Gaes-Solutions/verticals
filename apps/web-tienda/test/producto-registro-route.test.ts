import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../src/lib/api")>()),
  api: vi.fn(),
}));
vi.mock("@/lib/cliente", async (original) => ({
  ...(await original<typeof import("../src/lib/cliente")>()),
  getClienteSession: vi.fn(),
}));
import { POST as stock } from "../src/app/api/avisos-stock/route";
import {
  GET as owner,
  POST as question,
} from "../src/app/api/cuenta/productos/[id]/preguntas/route";
import { ApiError, api } from "../src/lib/api";
import { ClienteSessionError, getClienteSession } from "../src/lib/cliente";
const uuid = "55555555-5555-4555-a555-555555555555";
const session = {
  token: "fixture-token",
  cliente: { id: "qa-customer", tenantSlug: "qa-store", nombre: "QA", email: null },
};
const body = {
  pregunta: "¿Cuál es el material?",
  solicitudId: uuid,
  clienteIdEsperado: "qa-customer",
};
const params = (id = "qa-product") => ({ params: Promise.resolve({ id }) });
const req = (
  body: unknown = {},
  options: { origin?: string; signal?: AbortSignal; type?: string } = {},
) =>
  new Request("http://localhost/api/qa", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      host: "localhost",
      origin: options.origin ?? "http://localhost",
      "content-type": options.type ?? "application/json",
    },
    signal: options.signal,
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getClienteSession).mockResolvedValue(session);
  vi.mocked(api).mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("product stock subscription boundary", () => {
  it("confirms only ok=true, trims the email and strips caller ownership/internal receipt fields", async () => {
    vi.mocked(api).mockResolvedValue({ ok: true, private: "SECRET" });
    const res = await stock(
      req({
        productoPublicadoId: "qa-product",
        email: " Qa@Example.invalid ",
        clienteId: "attacker",
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(api).toHaveBeenCalledWith("/tienda/avisos-stock/registrar", {
      signal: expect.any(AbortSignal),
      body: { productoPublicadoId: "qa-product", email: "Qa@Example.invalid" },
    });
  });
  it.each([null, {}, [], { ok: false }, { ok: "true" }].map((data) => ({ data })))(
    "rejects malformed successful receipt %#",
    async ({ data }) => {
      vi.mocked(api).mockResolvedValue(data);
      expect(
        (await stock(req({ productoPublicadoId: "qa", email: "qa@example.invalid" }))).status,
      ).toBe(502);
    },
  );
  it.each(
    [
      { productoPublicadoId: "../private", email: "qa@example.invalid" },
      { productoPublicadoId: "qa", email: "invalid" },
      { productoPublicadoId: "qa", email: `${"a".repeat(255)}@x.test` },
      null,
      [],
    ].map((data) => ({ data })),
  )("rejects invalid input %# before upstream", async ({ data }) => {
    expect((await stock(req(data))).status).toBe(400);
    expect(api).not.toHaveBeenCalled();
  });
  it.each([400, 403, 404, 422, 429, 500])("sanitizes service status %i", async (status) => {
    vi.mocked(api).mockRejectedValue(new ApiError(status, "PRIVATE"));
    const res = await stock(req({ productoPublicadoId: "qa", email: "qa@example.invalid" }));
    expect(res.status).toBe(status === 500 ? 503 : status);
    expect(await res.text()).not.toContain("PRIVATE");
  });
  it("does not confirm an aborted request", async () => {
    const res = await stock(
      req(
        { productoPublicadoId: "qa", email: "qa@example.invalid" },
        { signal: AbortSignal.abort() },
      ),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
describe("product question boundary", () => {
  it("returns minimal verified owner without forwarding a mutation", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const res = await owner(new Request("http://localhost/api/qa"), params());
    expect(await res.json()).toEqual({ clienteId: "qa-customer", tenantSlug: "qa-store" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("only confirms the exact request receipt, filters fields and shares one signal through session and write", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: uuid, private: "SECRET" }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetch);
    const res = await question(
      req({ ...body, pregunta: ` ${body.pregunta} `, clienteId: "attacker" }),
      params(),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: uuid });
    expect(fetch.mock.calls[0]?.[0]).toContain("/preguntas/solicitudes");
    const options = fetch.mock.calls[0]?.[1];
    expect(JSON.parse(options.body)).toEqual({ pregunta: body.pregunta, solicitudId: uuid });
    expect(options.signal).toBe(vi.mocked(getClienteSession).mock.calls[0]?.[0]);
    expect(options.redirect).toBe("error");
  });
  it("rejects a changed account before writing, without adopting the caller's identity", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const res = await question(req({ ...body, clienteIdEsperado: "other-customer" }), params());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "SESSION_CHANGED" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(
    [null, {}, [], { id: "other-id" }, { id: uuid.toUpperCase() }, { ok: true }].map((data) => ({
      data,
    })),
  )("rejects wrong/missing successful receipt %#", async ({ data }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
    expect((await question(req(body), params())).status).toBe(502);
  });
  it.each([
    { pregunta: "tiny" },
    { pregunta: "x".repeat(501) },
    { solicitudId: "bad" },
    { clienteIdEsperado: "../private" },
  ])("rejects invalid question field %#", async (patch) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await question(req({ ...body, ...patch }), params())).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 409, 422, 429, 500])("redacts upstream error %i", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "PRIVATE" }), { status })),
    );
    const res = await question(req(body), params());
    expect(res.status).toBe(status === 500 ? 503 : status);
    expect(await res.text()).not.toContain("PRIVATE");
  });
  it("handles network exceptions and malformed JSON without a success receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("PRIVATE NETWORK")));
    expect((await question(req(body), params())).status).toBe(503);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("broken")));
    expect((await question(req(body), params())).status).toBe(502);
  });
  it.each([401, 403])(
    "signals a session change when buyer verification fails with %i",
    async (status) => {
      vi.mocked(getClienteSession).mockRejectedValue(new ClienteSessionError(status, "PRIVATE"));
      const res = await question(req(body), params());
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ code: "SESSION_CHANGED" });
    },
  );
  it("bounds both session lookup and writes by a single deadline", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(AbortSignal.abort());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url, options: RequestInit) => {
        options.signal?.throwIfAborted();
        return new Response(JSON.stringify({ id: uuid }));
      }),
    );
    expect((await question(req(body), params())).status).toBe(503);
  });
  for (const handler of [owner, question]) {
    it("guest cannot use this account endpoint", async () => {
      vi.mocked(getClienteSession).mockResolvedValue(null);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      expect((await handler(req(body), params())).status).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
    });
    it("session service failure is private and distinct from guest", async () => {
      vi.mocked(getClienteSession).mockRejectedValue(new ClienteSessionError(503, "PRIVATE"));
      const res = await handler(req(body), params());
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("PRIVATE");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });
  }
});
for (const [name, handler] of [
  ["stock", (r: Request) => stock(r)],
  ["question", (r: Request) => question(r, params())],
] as const) {
  describe(`${name} request origin`, () => {
    it.each([{ origin: "https://evil.invalid" }, { type: "text/plain" }])(
      "rejects untrusted write before any service call %#",
      async (options) => {
        expect((await handler(req(body, options))).status).toBe(403);
        expect(api).not.toHaveBeenCalled();
        expect(getClienteSession).not.toHaveBeenCalled();
      },
    );
  });
}
