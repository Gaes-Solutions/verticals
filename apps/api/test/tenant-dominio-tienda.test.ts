import { masterPrisma } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-dominio-tienda";
const DOMINIO = "tienda.ejemplo-dominio-test.com";

let app: FastifyInstance;
let token: string;

function authHeaders() {
  return { authorization: `Bearer ${token}` };
}

async function putConfig(dominioPropio: string | null) {
  return app.inject({
    method: "PUT",
    url: "/t/ecommerce/config",
    headers: authHeaders(),
    payload: { subdominio: "tienda-dom-test", nombre: "Tienda Dom Test", dominioPropio },
  });
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(SLUG);
  const dueno = await createTenantUser(SLUG, {
    email: "dueno@test.local",
    password: "Test1234!",
    rolCodigo: "dueno",
  });
  token = (await loginTenantUser(app, SLUG, dueno.email, dueno.password)).accessToken;
});

afterAll(async () => {
  await app.close();
  await masterPrisma.tiendaDominio.deleteMany({ where: { tenantSlug: SLUG } });
  await cleanupTestTenants();
});

describe("dominio propio de la tienda", () => {
  it("guarda el dominio, genera token y registra el mapeo en master (sin verificar)", async () => {
    const res = await putConfig(DOMINIO);
    expect([200, 201]).toContain(res.statusCode);
    const cfg = res.json();
    expect(cfg.dominioPropio).toBe(DOMINIO);
    expect(cfg.dominioVerificado).toBe(false);
    expect(cfg.dominioTokenVerificacion).toBeTruthy();

    const registro = await masterPrisma.tiendaDominio.findUnique({ where: { host: DOMINIO } });
    expect(registro?.tenantSlug).toBe(SLUG);
    expect(registro?.tipo).toBe("propio");
    expect(registro?.verificado).toBe(false);
  });

  it("GET /dominio devuelve las instrucciones DNS (CNAME + TXT) que el sistema recomienda", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/ecommerce/dominio",
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dominioPropio).toBe(DOMINIO);
    expect(body.verificado).toBe(false);
    expect(body.instrucciones.cname.tipo).toBe("CNAME");
    expect(body.instrucciones.cname.host).toBe(DOMINIO);
    expect(body.instrucciones.txt.tipo).toBe("TXT");
    expect(body.instrucciones.txt.valor).toContain("gaessoft-verify=");
  });

  it("verificar un dominio sin el TXT real devuelve verificado=false", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ecommerce/dominio/verificar",
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().verificado).toBe(false);
  });

  it("desconectar el dominio (null) limpia el registro master", async () => {
    const res = await putConfig(null);
    expect([200, 201]).toContain(res.statusCode);
    expect(res.json().dominioPropio).toBeNull();
    const registro = await masterPrisma.tiendaDominio.findUnique({ where: { host: DOMINIO } });
    expect(registro).toBeNull();
  });
});

describe("resolución pública host → tenant", () => {
  const HOST_OK = "verificado.dominio-test.com";

  it("404 si el host no está registrado/verificado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/public/storefront/resolve?host=desconocido-xyz.com",
    });
    expect(res.statusCode).toBe(404);
  });

  it("resuelve el slug para un host verificado (ignora el puerto)", async () => {
    await masterPrisma.tiendaDominio.upsert({
      where: { host: HOST_OK },
      create: { host: HOST_OK, tenantSlug: SLUG, tipo: "propio", verificado: true },
      update: { tenantSlug: SLUG, verificado: true },
    });
    const res = await app.inject({
      method: "GET",
      url: `/public/storefront/resolve?host=${HOST_OK}:443`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tenantSlug).toBe(SLUG);
  });
});
