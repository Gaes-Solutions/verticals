import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-flows";
const OWNER = { email: "owner-flows@test.local", password: "Owner!2026x" };

let app: FastifyInstance;
let token: string;
let campanaId = "";

beforeAll(async () => {
  await cleanupTestTenants();
  app = await buildTestApp();
  await createTestTenant(SLUG);
  await createTenantUser(SLUG, { ...OWNER, rolCodigo: "dueno", nombre: "Dueño" });
  token = (await loginTenantUser(app, SLUG, OWNER.email, OWNER.password)).accessToken;
  // cliente nuevo con teléfono (destino whatsapp)
  await getTenantClient(SLUG).cliente.create({
    data: { nombre: "Cliente Nuevo", telefonoPrincipal: "5213312345678" },
  });
});

afterAll(async () => {
  await cleanupTestTenants();
  if (app) await app.close();
});

function auth() {
  return { authorization: `Bearer ${token}` };
}

describe("automatizaciones (flows)", () => {
  let flowId = "";

  it("lista los eventos de flow disponibles", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/campanas/flows/eventos",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Array<{ evento: string }>).map((e) => e.evento)).toContain(
      "cliente_nuevo",
    );
  });

  it("crea una campaña y un flow de bienvenida", async () => {
    const camp = await app.inject({
      method: "POST",
      url: "/t/campanas",
      headers: auth(),
      payload: { nombre: "Bienvenida", objetivo: "fidelizacion", canal: "whatsapp" },
    });
    expect(camp.statusCode).toBe(201);
    campanaId = camp.json().id;

    const flow = await app.inject({
      method: "POST",
      url: "/t/campanas/flows",
      headers: auth(),
      payload: { evento: "cliente_nuevo", campanaId },
    });
    expect(flow.statusCode).toBe(201);
    expect(flow.json().evento).toBe("cliente_nuevo");
    flowId = flow.json().id;
  });

  it("lista los flows", async () => {
    const res = await app.inject({ method: "GET", url: "/t/campanas/flows", headers: auth() });
    expect(res.statusCode).toBe(200);
    expect((res.json() as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("ejecutar flows encola el envío de bienvenida al cliente nuevo", async () => {
    const res = await app.inject({ method: "POST", url: "/t/campanas/flows/run", headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().encolados).toBeGreaterThanOrEqual(1);
  });

  it("respeta el tope de frecuencia (no re-encola)", async () => {
    const res = await app.inject({ method: "POST", url: "/t/campanas/flows/run", headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().encolados).toBe(0);
  });

  it("desactivar el flow lo excluye de la corrida", async () => {
    await app.inject({
      method: "PATCH",
      url: `/t/campanas/flows/${flowId}`,
      headers: auth(),
      payload: { isActive: false },
    });
    const list = await app.inject({ method: "GET", url: "/t/campanas/flows", headers: auth() });
    const flow = (list.json() as Array<{ id: string; isActive: boolean }>).find(
      (f) => f.id === flowId,
    );
    expect(flow?.isActive).toBe(false);
  });
});
