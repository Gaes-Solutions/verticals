import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import type { CatalogManifest, CatalogPage } from "@gaespos/sync";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCatalogSnapshot, readCatalogPage } from "../src/modules/tenant/sync/catalog.js";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-sync-1";
const OWNER = { email: "owner-sync@test.local", password: "ChangeMe!2026" };
const ALMACEN = { email: "almacen-sync@test.local", password: "ChangeMe!2026" };

let app: FastifyInstance;
let ownerToken: string;
let almacenToken: string;
let sucursalId: string;
let cajaId: string;
let aperturaId: string;
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

  const opening = await getTenantClient(TENANT_SLUG).cajaApertura.findFirstOrThrow({
    where: { cajaId, estado: "abierta" },
  });
  aperturaId = opening.id;

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
      expectedTotal: "200",
      expectedAperturaId: aperturaId,
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

  it("dos reintentos simultáneos crean una sola venta", async () => {
    const op = { ...ventaOp(), idempotencyKey: randomUUID(), entityIdLocal: "simultanea" };
    const responses = await Promise.all([push(ownerToken, [op]), push(ownerToken, [op])]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(responses.map((r) => r.json().results[0].status).sort()).toEqual(["applied", "deduped"]);
    expect(responses[0]!.json().results[0].entityIdRemoto).toBe(
      responses[1]!.json().results[0].entityIdRemoto,
    );
  });

  it("rechaza reutilizar una clave con otro contenido", async () => {
    const res = await push(ownerToken, [{ ...ventaOp(), entityIdLocal: "suplantada" }]);
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0].status).toBe("failed");
    expect(res.json().results[0].entityIdRemoto).toBeNull();
  });

  it("revierte la venta si falla guardar su confirmación", async () => {
    const db = getTenantClient(TENANT_SLUG);
    const op = { ...ventaOp(), idempotencyKey: randomUUID(), entityIdLocal: "rollback" };
    const before = await db.venta.count();
    await db.$executeRawUnsafe(
      `CREATE FUNCTION fail_sync_receipt_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt fault injection'; END; $$`,
    );
    await db.$executeRawUnsafe(
      "CREATE TRIGGER fail_sync_receipt_test BEFORE INSERT ON sync_processed_ops FOR EACH ROW EXECUTE FUNCTION fail_sync_receipt_test()",
    );
    try {
      const res = await push(ownerToken, [op]);
      expect(res.statusCode).toBe(500);
      expect(await db.venta.count()).toBe(before);
      expect(
        await db.syncProcessedOp.findUnique({ where: { idempotencyKey: op.idempotencyKey } }),
      ).toBeNull();
    } finally {
      await db.$executeRawUnsafe("DROP TRIGGER fail_sync_receipt_test ON sync_processed_ops");
      await db.$executeRawUnsafe("DROP FUNCTION fail_sync_receipt_test()");
    }
    const retried = await push(ownerToken, [op]);
    expect(retried.json().results[0].status).toBe("applied");
    expect(await db.venta.count()).toBe(before + 1);
  });

  it("otro usuario no puede recuperar el comprobante de una clave ajena", async () => {
    await createTenantUser(TENANT_SLUG, {
      email: "other-sync@test.local",
      password: OWNER.password,
      rolCodigo: "dueno",
      nombre: "Otro",
    });
    const token = (await loginTenantUser(app, TENANT_SLUG, "other-sync@test.local", OWNER.password))
      .accessToken;
    const res = await push(token, [ventaOp()]);
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0]).toMatchObject({ status: "failed", entityIdRemoto: null });
  });

  it.each(["expectedTotal", "expectedAperturaId", "cajaId"])(
    "no aplica una venta sin %s ni inventa el dato al sincronizar",
    async (field) => {
      const op = { ...ventaOp(), idempotencyKey: randomUUID() };
      Reflect.deleteProperty(op.payload, field);
      const db = getTenantClient(TENANT_SLUG);
      const before = await db.venta.count();
      const res = await push(ownerToken, [op]);
      expect(res.json().results[0]).toMatchObject({ status: "failed", entityIdRemoto: null });
      expect(await db.venta.count()).toBe(before);
      expect(await db.syncProcessedOp.count({ where: { idempotencyKey: op.idempotencyKey } })).toBe(
        0,
      );
    },
  );

  it.each(["90", "110"])("no cambia el total cobrado si el precio pasa a %s", async (price) => {
    const db = getTenantClient(TENANT_SLUG);
    const op = { ...ventaOp(), idempotencyKey: randomUUID() };
    const original = await db.productoVariante.findUniqueOrThrow({ where: { id: varianteId } });
    const before = await db.venta.count();
    try {
      await db.productoVariante.update({ where: { id: varianteId }, data: { precioBase: price } });
      const res = await push(ownerToken, [op]);
      expect(res.json().results[0]).toMatchObject({ status: "failed", entityIdRemoto: null });
      expect(res.json().results[0].error).toContain("total cambió");
      expect(await db.venta.count()).toBe(before);
      expect(await db.syncProcessedOp.count({ where: { idempotencyKey: op.idempotencyKey } })).toBe(
        0,
      );
    } finally {
      await db.productoVariante.update({
        where: { id: varianteId },
        data: { precioBase: original.precioBase },
      });
    }
    const retry = await push(ownerToken, [op]);
    expect(retry.json().results[0].status).toBe("applied");
  });

  it("una apertura nueva no recibe la venta pendiente de una apertura cerrada", async () => {
    const db = getTenantClient(TENANT_SLUG);
    const opening = await db.cajaApertura.findUniqueOrThrow({ where: { id: aperturaId } });
    const op = { ...ventaOp(), idempotencyKey: randomUUID() };
    const before = await db.venta.count();
    await db.cajaApertura.update({
      where: { id: aperturaId },
      data: { estado: "cerrada", cerradaAt: new Date() },
    });
    const next = await db.cajaApertura.create({
      data: { cajaId, sucursalId, usuarioId: opening.usuarioId, montoInicial: "100" },
    });
    try {
      const response = await push(ownerToken, [op]);
      expect(response.json().results[0]).toMatchObject({ status: "failed", entityIdRemoto: null });
      expect(response.json().results[0].error).toContain("apertura de caja cambió");
      expect(await db.venta.count()).toBe(before);
      expect(await db.syncProcessedOp.count({ where: { idempotencyKey: op.idempotencyKey } })).toBe(
        0,
      );
      const replay = await push(ownerToken, [ventaOp()]);
      expect(replay.json().results[0].status).toBe("deduped");
    } finally {
      await db.cajaApertura.delete({ where: { id: next.id } });
      await db.cajaApertura.update({
        where: { id: aperturaId },
        data: { estado: "abierta", cerradaAt: null },
      });
    }
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
          expectedTotal: "999900",
          expectedAperturaId: aperturaId,
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

describe("catálogo completo de escritorio", () => {
  it("descarga más de 500 registros, fija los precios y excluye credenciales", async () => {
    const db = getTenantClient(TENANT_SLUG);
    await db.cliente.create({
      data: { nombre: "Cliente con acceso", passwordHash: "NEVER_EXPORT_THIS_HASH" },
    });
    const legacyBefore = await app.inject({
      method: "GET",
      url: "/t/sync/pull",
      headers: auth(ownerToken),
    });
    expect(legacyBefore.statusCode).toBe(200);
    expect(legacyBefore.body).not.toContain("passwordHash");
    expect(legacyBefore.body).not.toContain("NEVER_EXPORT_THIS_HASH");
    const prefix = randomUUID();
    await db.producto.createMany({
      data: Array.from({ length: 501 }, (_, i) => ({
        skuPadre: `${prefix}-${i}`,
        nombre: `Catálogo ${i}`,
      })),
    });

    const created = await app.inject({
      method: "POST",
      url: "/t/sync/catalog",
      headers: auth(ownerToken),
    });
    expect(created.statusCode).toBe(200);
    const manifest = created.json<CatalogManifest>();
    await db.productoVariante.update({ where: { id: varianteId }, data: { precioBase: "777" } });
    const pages: CatalogPage[] = [];
    for (let i = 0; i < manifest.pageCount; i++) {
      const page = await app.inject({
        method: "GET",
        url: `/t/sync/catalog/${manifest.id}/${i}`,
        headers: auth(ownerToken),
      });
      expect(page.statusCode).toBe(200);
      expect(page.body).not.toContain("passwordHash");
      expect(page.body).not.toContain("NEVER_EXPORT_THIS_HASH");
      pages.push(page.json<CatalogPage>());
    }
    expect(pages.filter((p) => p.entityType === "producto").flatMap((p) => p.rows)).toHaveLength(
      502,
    );
    expect(
      pages.find((p) => p.entityType === "variante")?.rows.find((r) => r.id === varianteId)
        ?.precioBase,
    ).toBe("100");
    const legacy = await app.inject({
      method: "GET",
      url: "/t/sync/pull",
      headers: auth(ownerToken),
    });
    expect(legacy.statusCode).toBe(409);
    const refreshed = await app.inject({
      method: "POST",
      url: "/t/sync/catalog",
      headers: auth(ownerToken),
    });
    expect(refreshed.statusCode).toBe(200);
    const old = await app.inject({
      method: "GET",
      url: `/t/sync/catalog/${manifest.id}/0`,
      headers: auth(ownerToken),
    });
    expect(old.statusCode).toBe(404);
  });

  it("no permite leer una descarga de otra cuenta ni una caducada", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/t/sync/catalog",
      headers: auth(ownerToken),
    });
    expect(created.statusCode).toBe(200);
    const manifest = created.json<CatalogManifest>();
    const token = (await loginTenantUser(app, TENANT_SLUG, "other-sync@test.local", OWNER.password))
      .accessToken;
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/t/sync/catalog/${manifest.id}/0`,
          headers: auth(token),
        })
      ).statusCode,
    ).toBe(404);
    await getTenantClient(TENANT_SLUG).syncCatalogSnapshot.update({
      where: { id: manifest.id },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/t/sync/catalog/${manifest.id}/0`,
          headers: auth(ownerToken),
        })
      ).statusCode,
    ).toBe(404);
  });

  it("omite clientes sin permiso e invalida páginas tras un cambio de permisos", async () => {
    const db = getTenantClient(TENANT_SLUG);
    const user = await db.usuario.findUniqueOrThrow({ where: { email: OWNER.email } });
    const principal = { permissions: ["sync.usar", "productos.leer", "precios.leer"] };
    const manifest = await createCatalogSnapshot(db, principal, user.id);
    const pages = await Promise.all(
      Array.from({ length: manifest.pageCount }, (_, index) =>
        readCatalogPage(db, principal, user.id, manifest.id, index),
      ),
    );
    expect(pages.find((p) => p.entityType === "cliente")?.rows).toEqual([]);
    await expect(
      readCatalogPage(
        db,
        { permissions: [...principal.permissions, "clientes.leer"] },
        user.id,
        manifest.id,
        0,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
