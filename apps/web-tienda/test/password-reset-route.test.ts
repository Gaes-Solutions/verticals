import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as POST_OLVIDAR } from "../src/app/api/cuenta/olvidar-contrasena/route";
import { POST as POST_REESTABLECER } from "../src/app/api/cuenta/restablecer-contrasena/route";

// BFF de recuperación de contraseña: inyecta el tenant de la petición y
// reenvía al API público (/auth/cliente/*). Sin sesión: el email llega por
// fuera y el canje del token también es anónimo.

function post(route: (req: Request) => Promise<Response>, path: string, body: unknown) {
  return route(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("BFF /api/cuenta/olvidar-contrasena", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reenvía email + tenantSlug al API y propaga el mensaje genérico", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mensaje: "Si el correo existe en esta tienda, te enviamos un enlace.",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await post(POST_OLVIDAR, "/api/cuenta/olvidar-contrasena", {
      email: "a@b.mx",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      mensaje: "Si el correo existe en esta tienda, te enviamos un enlace.",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/cliente/olvidar-contrasena"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"email":"a@b.mx"'),
      }),
    );
    const bodySent = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(bodySent).toHaveProperty("tenantSlug");
  });

  it("fallo del API se propaga con su status (reintento del usuario)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 503 })));
    const res = await post(POST_OLVIDAR, "/api/cuenta/olvidar-contrasena", {
      email: "a@b.mx",
    });
    expect(res.status).toBe(503);
  });
});

describe("BFF /api/cuenta/restablecer-contrasena", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reenvía token + nuevaContraseña + tenantSlug al API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ mensaje: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await post(POST_REESTABLECER, "/api/cuenta/restablecer-contrasena", {
      token: "t".repeat(64),
      nuevaContrasena: "nuevaClave9",
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/cliente/restablecer-contrasena"),
      expect.objectContaining({ method: "POST" }),
    );
    const bodySent = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(bodySent).toEqual({
      token: "t".repeat(64),
      nuevaContrasena: "nuevaClave9",
      tenantSlug: expect.any(String),
    });
  });

  it("400 del API conserva el mensaje (inválido/expirado/usado)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Este enlace ya fue utilizado." }), {
          status: 400,
        }),
      ),
    );
    const res = await post(POST_REESTABLECER, "/api/cuenta/restablecer-contrasena", {
      token: "t".repeat(64),
      nuevaContrasena: "nuevaClave9",
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { message: string }).toEqual({
      message: "Este enlace ya fue utilizado.",
    });
  });
});
