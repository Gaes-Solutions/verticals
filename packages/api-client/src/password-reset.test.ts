import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { restablecerContrasena, solicitarResetContrasena } from "./password-reset";

const client = createApiClient({
  baseUrl: "https://api.example.test",
  getToken: async () => "token-guardado",
});

afterEach(() => vi.unstubAllGlobals());

describe("recuperación de contraseña (api-client)", () => {
  it("solicitarResetContrasena POSTea al endpoint público sin Authorization", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ mensaje: "ok genérico" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await solicitarResetContrasena(client, {
      tenantSlug: "mi-tienda",
      email: "a@b.mx",
    });
    expect(r.mensaje).toBe("ok genérico");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/auth/cliente/olvidar-contrasena",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tenantSlug: "mi-tienda", email: "a@b.mx" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("restablecerContrasena POSTea token + nueva contraseña sin Authorization", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ mensaje: "actualizada" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await restablecerContrasena(client, {
      tenantSlug: "mi-tienda",
      token: "t".repeat(64),
      nuevaContrasena: "nuevaClave9",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/auth/cliente/restablecer-contrasena",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          tenantSlug: "mi-tienda",
          token: "t".repeat(64),
          nuevaContrasena: "nuevaClave9",
        }),
      }),
    );
    // sin cabecera Authorization aunque haya token de sesión guardado
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).not.toHaveProperty(
      "Authorization",
    );
  });

  it("propaga el mensaje de error del API (400 inválido/expirado/usado)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Este enlace ya fue utilizado." }), {
          status: 400,
        }),
      ),
    );
    await expect(
      restablecerContrasena(client, {
        tenantSlug: "mi-tienda",
        token: "t".repeat(64),
        nuevaContrasena: "nuevaClave9",
      }),
    ).rejects.toMatchObject({ status: 400, message: "Este enlace ya fue utilizado." });
  });
});
