import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.hoisted(() => ({ secret: "a".repeat(64) as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookiesMock.secret ? { value: cookiesMock.secret } : undefined),
  }),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api")>()),
  api: vi.fn(),
  slugActual: async () => "tienda-a",
}));
vi.mock("@/lib/cliente", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/cliente")>()),
  getClienteSession: vi.fn(),
}));
import { GET, POST } from "../src/app/api/checkout/route";
import { GET as bootstrap } from "../src/app/api/checkout/session/route";
import { ApiError, api } from "../src/lib/api";
import { checkoutDigest, checkoutKey, sameOriginRequest } from "../src/lib/checkout-session";
import { ClienteSessionError, getClienteSession } from "../src/lib/cliente";

const publicKey = "55555555-5555-4555-a555-555555555555";
const secret = "a".repeat(64);
const guestContext = checkoutDigest(secret, "context", "tienda-a", "guest");
const result = {
  folioPublico: "ORDER1",
  intentId: "intent1",
  total: "150.00",
  intentStatus: "confirmado",
};
const body = {
  checkoutContext: guestContext,
  idempotencyKey: publicKey,
  sessionIdAnonimo: "attacker-session",
  emailComprador: "any-email@example.test",
  clienteId: "attacker-chosen-id",
  tenantSlug: "attacker-tenant",
  items: [{ varianteId: "variant1", cantidad: 1 }],
  metodoEnvio: "click_collect",
  sucursalPickupId: "branch1",
  cardTokenId: "test-card-token",
};
const request = (data: unknown = body, origin = "http://localhost") =>
  new NextRequest("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: "localhost" },
    body: JSON.stringify(data),
  });
const recovery = (context = guestContext) =>
  new NextRequest(`http://localhost/api/checkout?context=${context}&idempotencyKey=${publicKey}`);

beforeEach(() => {
  vi.resetAllMocks();
  cookiesMock.secret = secret;
  vi.mocked(getClienteSession).mockResolvedValue(null);
  vi.mocked(api)
    .mockRejectedValueOnce(new ApiError(404))
    .mockResolvedValueOnce({ id: "cart1" })
    .mockResolvedValueOnce(result)
    .mockResolvedValue(result);
});
afterEach(() => vi.unstubAllEnvs());

describe("checkout BFF: propiedad y reintentos", () => {
  it("liga cliente validado y usa UUID privado estable, no cliente/email del body", async () => {
    vi.mocked(getClienteSession).mockResolvedValue({
      token: "private",
      cliente: {
        id: "verified-client",
        tenantSlug: "tienda-a",
        nombre: "Prueba",
        email: "verified@example.test",
      },
    });
    const context = checkoutDigest(secret, "context", "tienda-a", "verified-client");
    expect((await POST(request({ ...body, checkoutContext: context }))).status).toBe(200);
    expect(api).toHaveBeenNthCalledWith(2, "/tienda", {
      body: {
        clienteId: "verified-client",
        canal: "web",
        items: body.items,
        emailAnonimo: body.emailComprador,
      },
    });
    expect(api).toHaveBeenNthCalledWith(3, "/checkout/tienda/iniciar", {
      body: expect.objectContaining({
        idempotencyKey: checkoutKey(secret, "tienda-a", "verified-client", publicKey),
      }),
    });
  });
  it("ignora sesión anónima maliciosa y adjudicación por email", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(api).toHaveBeenNthCalledWith(2, "/tienda", {
      body: {
        sessionIdAnonimo: checkoutDigest(secret, "cart", "tienda-a"),
        canal: "web",
        items: body.items,
        emailAnonimo: body.emailComprador,
      },
    });
  });
  it("POST repetido recupera resultado sin crear carrito ni cobrar de nuevo", async () => {
    vi.mocked(api).mockReset().mockResolvedValue(result);
    const response = await POST(
      request({ ...body, cardTokenId: "different-token-must-not-be-used" }),
    );
    expect(await response.json()).toEqual({
      folioPublico: "ORDER1",
      total: "150.00",
      intentStatus: "confirmado",
    });
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(
      `/checkout/intentos/${checkoutKey(secret, "tienda-a", "guest", publicKey)}`,
    );
  });
  it.each(["CHECKOUT_PROCESSING", "CHECKOUT_UNCERTAIN", "CHECKOUT_FAILED"])(
    "%s no reinicia proveedor",
    async (code) => {
      vi.mocked(api).mockReset().mockRejectedValue(new ApiError(409, code));
      const response = await POST(request());
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe(code);
      expect(api).toHaveBeenCalledTimes(1);
    },
  );
  it("GET 404 es ambiguo y nunca crea otro intento", async () => {
    const response = await GET(recovery());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("CHECKOUT_UNCERTAIN");
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("GET pendiente no se anuncia pagado y no expone secretos de proveedor", async () => {
    vi.mocked(api)
      .mockReset()
      .mockResolvedValue({
        ...result,
        intentStatus: "pendiente",
        clientSecret: "private-provider-secret",
      });
    expect(await (await GET(recovery())).json()).toEqual({
      folioPublico: "ORDER1",
      total: "150.00",
      intentStatus: "pendiente",
    });
  });
  it("cookie distinta impide recuperar por UUID/context públicos conocidos", async () => {
    cookiesMock.secret = "b".repeat(64);
    expect((await GET(recovery())).status).toBe(409);
    expect(api).not.toHaveBeenCalled();
  });
  it("primer POST sin bootstrap no crea cookie ni inicia pago", async () => {
    cookiesMock.secret = undefined;
    expect((await POST(request())).status).toBe(409);
    expect(api).not.toHaveBeenCalled();
  });
  it.each([401, 403, 503])(
    "sesión comprador no verificable %s falla antes del carrito",
    async (status) => {
      vi.mocked(getClienteSession).mockRejectedValue(
        new ClienteSessionError(status, "Sesión no disponible"),
      );
      expect((await POST(request())).status).toBe(status);
      expect(api).not.toHaveBeenCalled();
    },
  );
  it("rechaza POST desde otro origen", async () => {
    expect((await POST(request(body, "https://attacker.example"))).status).toBe(403);
    expect(api).not.toHaveBeenCalled();
  });
  it("producción sin tarjeta no cae a mock ni crea carrito", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request({ ...body, cardTokenId: undefined }))).status).toBe(503);
    expect(api).toHaveBeenCalledTimes(1);
  });
});

describe("bootstrap y namespace privado", () => {
  it("crea cookie HttpOnly antes del checkout y devuelve solo contexto", async () => {
    cookiesMock.secret = undefined;
    const response = await bootstrap(new NextRequest("http://localhost/api/checkout/session"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(Object.keys(await response.json())).toEqual(["context"]);
    expect(api).not.toHaveBeenCalled();
  });
  it("bootstrap existente no rota dueño entre visitas", async () => {
    const response = await bootstrap(new NextRequest("http://localhost/api/checkout/session"));
    expect(await response.json()).toEqual({ context: guestContext });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("key cambia con cookie, tenant o cliente y siempre es UUID válido", () => {
    const keys = [
      checkoutKey(secret, "tenant-a", "client-a", publicKey),
      checkoutKey(secret, "tenant-b", "client-a", publicKey),
      checkoutKey(secret, "tenant-a", "client-b", publicKey),
      checkoutKey("b".repeat(64), "tenant-a", "client-a", publicKey),
    ];
    expect(new Set(keys).size).toBe(4);
    for (const key of keys)
      expect(key).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  });
});

describe("origen CSRF con autoridad Host", () => {
  const csrfRequest = (headers: Record<string, string>) =>
    new NextRequest("http://localhost:3198/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
    });
  it("acepta origen127.0 coherente con Host aunque Next normalice localhost", () => {
    expect(
      sameOriginRequest(csrfRequest({ host: "127.0.0.1:3198", origin: "http://127.0.0.1:3198" })),
    ).toBe(true);
  });
  it("rechaza Host malicioso distinto del origen y no acepta forwarded host", () => {
    expect(
      sameOriginRequest(
        csrfRequest({
          host: "attacker.example",
          origin: "http://127.0.0.1:3198",
          "x-forwarded-host": "127.0.0.1:3198",
        }),
      ),
    ).toBe(false);
  });
  it.each(["evil.example@127.0.0.1:3198", "127.0.0.1:3198/path", "127.0.0.1:3198?x=1"])(
    "rechaza Host malformado %s",
    (host) => {
      expect(sameOriginRequest(csrfRequest({ host, origin: "http://127.0.0.1:3198" }))).toBe(false);
    },
  );
  it("rechaza protocolo distinto, Origin null y Host ausente", () => {
    expect(
      sameOriginRequest(csrfRequest({ host: "127.0.0.1:3198", origin: "https://127.0.0.1:3198" })),
    ).toBe(false);
    expect(sameOriginRequest(csrfRequest({ host: "127.0.0.1:3198", origin: "null" }))).toBe(false);
    expect(sameOriginRequest(csrfRequest({ origin: "http://localhost:3198" }))).toBe(false);
  });
});
