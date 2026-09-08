import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ token: undefined as string | undefined, slug: "tienda-a" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (mocks.token ? { value: mocks.token } : undefined) }),
  headers: async () => new Headers({ "x-tienda-slug": mocks.slug }),
}));
import { authClienteBackend, getClienteSession, getClienteToken } from "../src/lib/cliente";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  mocks.token = "validated-by-backend-not-decoded-locally";
  mocks.slug = "tienda-a";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const me = (tenantSlug = "tienda-a") => ({
  id: "cliente-a",
  nombre: "Prueba",
  email: "buyer@example.test",
  tenantSlug,
});

describe("sesión cliente ligada a tienda", () => {
  it("no consulta backend para invitado sin cookie", async () => {
    mocks.token = undefined;
    expect(await getClienteSession()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("obtiene identidad y tenant desde el backend autenticado", async () => {
    fetchMock.mockResolvedValue(Response.json(me()));
    expect(await getClienteSession()).toEqual({ token: mocks.token, cliente: me() });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/cliente-portal/me"), {
      headers: { Authorization: `Bearer ${mocks.token}` },
      cache: "no-store",
    });
  });
  it("rechaza sesión de otra tienda aunque haya coincidencia de email o ID", async () => {
    fetchMock.mockImplementation(async () => Response.json(me("tienda-b")));
    await expect(getClienteSession()).rejects.toMatchObject({ statusCode: 403 });
    expect(await getClienteToken()).toBeNull();
  });
  it("rechaza token inválido sin tratarlo como invitado en checkout", async () => {
    fetchMock.mockResolvedValue(Response.json({}, { status: 401 }));
    await expect(getClienteSession()).rejects.toMatchObject({ statusCode: 401 });
  });
  it.each(["network", "503", "missing-tenant", "bad-json"])(
    "cierra acceso cuando /me falla: %s",
    async (mode) => {
      if (mode === "network") fetchMock.mockRejectedValue(new Error("private upstream details"));
      if (mode === "503") fetchMock.mockResolvedValue(Response.json({}, { status: 503 }));
      if (mode === "missing-tenant")
        fetchMock.mockResolvedValue(Response.json({ id: "cliente-a" }));
      if (mode === "bad-json") fetchMock.mockResolvedValue(new Response("not JSON"));
      await expect(getClienteSession()).rejects.toMatchObject({
        statusCode: 503,
        message: "No se pudo verificar tu sesión. Reintenta.",
      });
    },
  );
  it.each(["login", "registro"] as const)(
    "%s usa la tienda resuelta e ignora tenant enviado por navegador",
    async (action) => {
      fetchMock.mockResolvedValue(Response.json({ accessToken: "new-token", cliente: me() }));
      await authClienteBackend(action, {
        email: "buyer@example.test",
        password: "test-only-password",
        tenantSlug: "attacker-tenant",
      });
      const init = fetchMock.mock.calls[0]?.[1];
      expect(JSON.parse(String(init?.body)).tenantSlug).toBe("tienda-a");
    },
  );
});
