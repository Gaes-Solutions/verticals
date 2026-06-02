import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-sync-1";
const OWNER = { email: "owner-sync@test.local", password: "ChangeMe!2026" };
const ALMACEN = { email: "almacen-sync@test.local", password: "ChangeMe!2026" };

let app: FastifyInstance;
let ownerToken: string;
let almacenToken: string;
let sucursalId: string;
let cajaId: string;
let varianteId: string;

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

async function push(token: string, operations: unknown[]) {
  return app.inject({
    method: "POST",
    url: "/t/sync/push",
    headers: auth(token),
    payload: { deviceId: "caja-01", operations },
  });
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tienda Sync");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER.email,
    password: OWNER.password,
    rolCodigo: "dueno",
    nombre: "Dueño Sync",
  });
  await createTenantUser(TENANT_SLUG, {
    email: ALMACEN.email,
    password: ALMACEN.password,
    rolCodigo: "almacen",
    nombre: "Almacén Sync",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER.email, OWNER.password)).accessToken;
  almacenToken = (await loginTenantUser(app, TENANT_SLUG, ALMACEN.email, ALMACEN.password))
    .accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: auth(ownerToken) });
  sucursalId = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  )!.id;
  const cajas = await app.inject({ method: "GET", url: "/t/cajas", headers: auth(ownerToken) });
  cajaId = (cajas.json() as Array<{ id: string }>)[0]!.id;
  await app.inject({
    method: "POST",
    url: `/t/cajas/${cajaId}/aperturar`,
    headers: auth(ownerToken),
    payload: { montoInicial: "100" },
  });

  const cat = await app.inject({
    method: "POST",
    url: "/t/categorias",
    headers: auth(ownerToken),
    payload: { nombre: "General", codigo: "GEN" },
  });
  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(ownerToken),
    payload: {
      skuPadre: "SYNC-001",
      nombre: "Producto Sync",
      categoriaId: cat.json().id,
      precioBase: "100.00",
    },
  });
  varianteId = prod.json().variantes[0].id;
  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: auth(ownerToken),
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "50", motivo: "Inicial" },
  });
});

afterAll(async () => {
  if (app) await app.close();
});

describe("RBAC sync", () => {
  it("usuario sin SYNC_USAR (almacén) → 403", async () => {
    const res = await push(almacenToken, [
      {
        idempotencyKey: randomUUID(),
        entityType: "cliente",
        entityIdLocal: "l1",
        operation: "create",
        payload: { nombre: "X" },
      },
    ]);
    expect(res.statusCode).toBe(403);
  });

  it("heartbeat responde ok con SYNC_USAR", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/sync/heartbeat",
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);
  });
});

describe("push venta inmutable + idempotencia", () => {
  const ventaKey = randomUUID();
  const ventaOp = () => ({
    idempotencyKey: ventaKey,
    entityType: "venta",
    entityIdLocal: "venta-local-1",
    operation: "create",
    payload: {
      sucursalId,
      cajaId,
      lineas: [{ varianteId, cantidad: "2" }],
      pagos: [{ metodo: "efectivo", monto: "232" }],
    },
  });

  it("aplica una venta encolada offline", async () => {
    const res = await push(ownerToken, [ventaOp()]);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      applied: number;
      results: Array<{ status: string; entityIdRemoto: string }>;
    };
    expect(body.applied).toBe(1);
    expect(body.results[0]?.status).toBe("applied");
    expect(body.results[0]?.entityIdRemoto).toBeTruthy();
  });

  it("reenviar el mismo batch NO duplica (deduped)", async () => {
    const before = await app.inject({ method: "GET", url: "/t/ventas", headers: auth(ownerToken) });
    const totalBefore = (before.json() as { total: number }).total;

    const res = await push(ownerToken, [ventaOp()]);
    const body = res.json() as { deduped: number; results: Array<{ status: string }> };
    expect(body.deduped).toBe(1);
    expect(body.results[0]?.status).toBe("deduped");

    const after = await app.inject({ method: "GET", url: "/t/ventas", headers: auth(ownerToken) });
    expect((after.json() as { total: number }).total).toBe(totalBefore);
  });

  it("venta inválida (sin stock suficiente) → failed reintentable", async () => {
    const res = await push(ownerToken, [
      {
        idempotencyKey: randomUUID(),
        entityType: "venta",
        entityIdLocal: "venta-local-x",
        operation: "create",
        payload: {
          sucursalId,
          cajaId,
          lineas: [{ varianteId, cantidad: "9999" }],
          pagos: [{ metodo: "efectivo", monto: "1" }],
        },
      },
    ]);
    const body = res.json() as { failed: number };
    expect(body.failed).toBe(1);
  });
});

describe("push cliente LWW + merge_required", () => {
  let clienteId: string;
  let baseUpdatedAt: string;

  it("crea un cliente desde el dispositivo", async () => {
    const res = await push(ownerToken, [
      {
        idempotencyKey: randomUUID(),
        entityType: "cliente",
        entityIdLocal: "cli-local-1",
        operation: "create",
        payload: { nombre: "Laura", apellidos: "Offline", telefonoPrincipal: "3330000001" },
      },
    ]);
    const body = res.json() as {
      applied: number;
      results: Array<{ entityIdRemoto: string; serverUpdatedAt: string }>;
    };
    expect(body.applied).toBe(1);
    clienteId = body.results[0]!.entityIdRemoto;
    baseUpdatedAt = body.results[0]!.serverUpdatedAt;
  });

  it("update con base sin cambios en el servidor ⇒ aplica", async () => {
    const res = await push(ownerToken, [
      {
        idempotencyKey: randomUUID(),
        entityType: "cliente",
        entityIdLocal: "cli-local-1",
        entityIdRemoto: clienteId,
        operation: "update",
        baseUpdatedAt,
        baseSnapshot: { nombre: "Laura", telefonoPrincipal: "3330000001" },
        payload: { telefonoPrincipal: "3339999999" },
      },
    ]);
    expect((res.json() as { applied: number }).applied).toBe(1);
  });

  it("conflicto: el servidor y el dispositivo cambian el mismo campo ⇒ merge_required", async () => {
    // El cliente cambió en el servidor (otro dispositivo ya sincronizó)
    const tprisma = getTenantClient(TENANT_SLUG);
    const actual = await tprisma.cliente.update({
      where: { id: clienteId },
      data: { telefonoPrincipal: "3331111111" },
    });
    // El dispositivo offline editó el MISMO campo, basado en un snapshot viejo
    const res = await push(ownerToken, [
      {
        idempotencyKey: randomUUID(),
        entityType: "cliente",
        entityIdLocal: "cli-local-1",
        entityIdRemoto: clienteId,
        operation: "update",
        baseUpdatedAt: new Date(actual.updatedAt.getTime() - 60000).toISOString(),
        baseSnapshot: { telefonoPrincipal: "3330000001" },
        payload: { telefonoPrincipal: "3332222222" },
      },
    ]);
    const body = res.json() as {
      conflicts: number;
      results: Array<{ status: string; conflict?: { divergentFields: string[]; reason: string } }>;
    };
    expect(body.conflicts).toBe(1);
    expect(body.results[0]?.status).toBe("conflict");
    expect(body.results[0]?.conflict?.divergentFields).toContain("telefonoPrincipal");

    // el servidor NO se sobreescribió
    const sigue = await tprisma.cliente.findUnique({ where: { id: clienteId } });
    expect(sigue?.telefonoPrincipal).toBe("3331111111");
  });
});

describe("pull diffs + tombstones", () => {
  it("pull sin `since` trae snapshot de catálogos", async () => {
    const res = await app.inject({ method: "GET", url: "/t/sync/pull", headers: auth(ownerToken) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { diffs: Array<{ entityType: string; upserts: unknown[] }> };
    const tipos = body.diffs.map((d) => d.entityType);
    expect(tipos).toContain("producto");
    expect(tipos).toContain("cliente");
  });

  it("pull con `since` solo trae lo modificado después", async () => {
    const t0 = new Date().toISOString();
    // crea un cliente nuevo después de t0
    await push(ownerToken, [
      {
        idempotencyKey: randomUUID(),
        entityType: "cliente",
        entityIdLocal: "cli-local-2",
        operation: "create",
        payload: { nombre: "Nuevo", telefonoPrincipal: "3335550000" },
      },
    ]);
    const res = await app.inject({
      method: "GET",
      url: `/t/sync/pull?since=${encodeURIComponent(t0)}`,
      headers: auth(ownerToken),
    });
    const body = res.json() as {
      diffs: Array<{ entityType: string; upserts: Array<{ nombre?: string }> }>;
    };
    const clientesDiff = body.diffs.find((d) => d.entityType === "cliente");
    expect(clientesDiff).toBeTruthy();
    expect(clientesDiff!.upserts.some((c) => c.nombre === "Nuevo")).toBe(true);
    // no debe traer productos viejos (no cambiaron tras t0)
    expect(body.diffs.find((d) => d.entityType === "producto")).toBeUndefined();
  });

  it("pull entrega tombstones de borrados duros", async () => {
    const tprisma = getTenantClient(TENANT_SLUG);
    const t0 = new Date(Date.now() - 2000).toISOString();
    await tprisma.syncTombstone.create({
      data: { entityType: "producto", entityId: "prod-borrado-1" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/t/sync/pull?since=${encodeURIComponent(t0)}`,
      headers: auth(ownerToken),
    });
    const body = res.json() as {
      diffs: Array<{ entityType: string; tombstones: Array<{ entityId: string }> }>;
    };
    const prodDiff = body.diffs.find((d) => d.entityType === "producto");
    expect(prodDiff?.tombstones.some((t) => t.entityId === "prod-borrado-1")).toBe(true);
  });
});
