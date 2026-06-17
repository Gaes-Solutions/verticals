import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-vistas";
const DUENO = { email: "dueno-vistas@test.local", password: "Dueno!2026x" };
const CAJERO = { email: "cajero-vistas@test.local", password: "Cajero!2026x" };

let app: FastifyInstance;
let tokenDueno = "";
let tokenCajero = "";

beforeAll(async () => {
  await cleanupTestTenants();
  app = await buildTestApp();
  await createTestTenant(SLUG);
  await createTenantUser(SLUG, { ...DUENO, rolCodigo: "dueno", nombre: "Dueño" });
  await createTenantUser(SLUG, { ...CAJERO, rolCodigo: "cajero", nombre: "Cajero" });
  tokenDueno = (await loginTenantUser(app, SLUG, DUENO.email, DUENO.password)).accessToken;
  tokenCajero = (await loginTenantUser(app, SLUG, CAJERO.email, CAJERO.password)).accessToken;
});

afterAll(async () => {
  await cleanupTestTenants();
  if (app) await app.close();
});

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

describe("vistas guardadas (atajos personalizables)", () => {
  let vistaId = "";

  it("crea una vista guardada (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/vistas-guardadas",
      headers: auth(tokenDueno),
      payload: {
        recurso: "ventas",
        nombre: "Ventas del mes",
        filtros: { periodo: "30d" },
        columnasVisibles: ["folio", "total"],
      },
    });
    expect(res.statusCode).toBe(201);
    vistaId = res.json().id;
    expect(res.json().recurso).toBe("ventas");
  });

  it("lista las vistas propias (filtra por recurso)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/vistas-guardadas?recurso=ventas",
      headers: auth(tokenDueno),
    });
    expect(res.statusCode).toBe(200);
    const ids = (res.json() as Array<{ id: string }>).map((v) => v.id);
    expect(ids).toContain(vistaId);
  });

  it("edita la vista propia", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/vistas-guardadas/${vistaId}`,
      headers: auth(tokenDueno),
      payload: { nombre: "Ventas 30 días" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().nombre).toBe("Ventas 30 días");
  });

  it("default es exclusivo por recurso (marcar una desmarca la anterior)", async () => {
    await app.inject({
      method: "PATCH",
      url: `/t/vistas-guardadas/${vistaId}`,
      headers: auth(tokenDueno),
      payload: { isDefault: true },
    });
    const otra = await app.inject({
      method: "POST",
      url: "/t/vistas-guardadas",
      headers: auth(tokenDueno),
      payload: { recurso: "ventas", nombre: "Hoy", isDefault: true },
    });
    expect(otra.statusCode).toBe(201);
    const lista = await app.inject({
      method: "GET",
      url: "/t/vistas-guardadas?recurso=ventas",
      headers: auth(tokenDueno),
    });
    const defaults = (lista.json() as Array<{ isDefault: boolean }>).filter((v) => v.isDefault);
    expect(defaults).toHaveLength(1);
  });

  it("otro usuario NO puede editar mi vista (404)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/vistas-guardadas/${vistaId}`,
      headers: auth(tokenCajero),
      payload: { nombre: "Hackeada" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("una vista compartida sí la ve otro usuario", async () => {
    await app.inject({
      method: "POST",
      url: "/t/vistas-guardadas",
      headers: auth(tokenDueno),
      payload: { recurso: "productos", nombre: "Bajo stock", esCompartida: true },
    });
    const res = await app.inject({
      method: "GET",
      url: "/t/vistas-guardadas?recurso=productos",
      headers: auth(tokenCajero),
    });
    const nombres = (res.json() as Array<{ nombre: string }>).map((v) => v.nombre);
    expect(nombres).toContain("Bajo stock");
  });

  it("borra la vista propia", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/t/vistas-guardadas/${vistaId}`,
      headers: auth(tokenDueno),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});
