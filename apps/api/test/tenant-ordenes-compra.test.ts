import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-oc-1";
const OWNER = { email: "owner-oc@test.local", password: "ChangeMe!2026" };

let app: FastifyInstance;
let ownerToken: string;
let sucursalId: string;
let productoId: string;
let varianteId: string;

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

async function stockDe(): Promise<number> {
  const inv = await app.inject({
    method: "GET",
    url: `/t/inventario?varianteId=${varianteId}`,
    headers: auth(ownerToken),
  });
  const filas = inv.json() as
    | Array<{ stockActual: string }>
    | { items: Array<{ stockActual: string }> };
  const lista = Array.isArray(filas) ? filas : filas.items;
  return Number(lista[0]?.stockActual ?? 0);
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant OC");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER.email,
    password: OWNER.password,
    rolCodigo: "dueno",
    nombre: "Owner OC",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER.email, OWNER.password)).accessToken;
  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: auth(ownerToken) });
  sucursalId = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  )!.id;
  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(ownerToken),
    payload: {
      skuPadre: "OC-001",
      nombre: "Caja de tornillos",
      precioBase: "50",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  productoId = prod.json().id;
  varianteId = prod.json().variantes[0].id;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("órdenes de compra: flujo completo + recepción a inventario", () => {
  let ocId: string;
  let lineaId: string;

  it("crea OC en borrador con proveedor y líneas", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ordenes-compra",
      headers: auth(ownerToken),
      payload: {
        sucursalId,
        proveedorRfc: "PRO900101AB1",
        proveedorRazonSocial: "Ferretería Mayoreo SA",
        lineas: [
          { productoId, descripcion: "Caja de tornillos", cantidad: "100", precioUnitario: "8" },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    ocId = res.json().id;
    expect(res.json().folio).toMatch(/^OC-/);

    const det = await app.inject({
      method: "GET",
      url: `/t/ordenes-compra/${ocId}`,
      headers: auth(ownerToken),
    });
    expect(det.json().estado).toBe("borrador");
    lineaId = (det.json() as { lineas: Array<{ id: string }> }).lineas[0]!.id;
  });

  it("autoriza la OC (borrador → enviada)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${ocId}/autorizar`,
      headers: auth(ownerToken),
      payload: {},
    });
    expect(res.statusCode).toBe(204);
    const det = await app.inject({
      method: "GET",
      url: `/t/ordenes-compra/${ocId}`,
      headers: auth(ownerToken),
    });
    expect(det.json().estado).toBe("enviada");
  });

  it("recepción parcial suma stock y actualiza el costo del producto", async () => {
    expect(await stockDe()).toBe(0);
    const res = await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${ocId}/recibir`,
      headers: auth(ownerToken),
      payload: { lineas: [{ lineaId, cantidadRecibida: "60" }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("recibida_parcial");
    expect(await stockDe()).toBe(60);

    // costo último y promedio quedaron en 8 (precio de compra)
    const prod = await app.inject({
      method: "GET",
      url: `/t/productos/${productoId}`,
      headers: auth(ownerToken),
    });
    const v = (prod.json() as { variantes: Array<{ costoUltimo: string; costoPromedio: string }> })
      .variantes[0];
    expect(Number(v?.costoUltimo)).toBe(8);
    expect(Number(v?.costoPromedio)).toBe(8);
  });

  it("recepción del resto completa la OC (recibida_total) y suma el stock restante", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${ocId}/recibir`,
      headers: auth(ownerToken),
      payload: { lineas: [{ lineaId, cantidadRecibida: "40" }] },
    });
    expect(res.json().estado).toBe("recibida_total");
    expect(await stockDe()).toBe(100);
  });

  it("recibir de más rechaza (409)", async () => {
    const otra = await app.inject({
      method: "POST",
      url: "/t/ordenes-compra",
      headers: auth(ownerToken),
      payload: {
        sucursalId,
        proveedorRfc: "PRO900101AB1",
        proveedorRazonSocial: "Ferretería Mayoreo SA",
        lineas: [{ productoId, descripcion: "Tornillos", cantidad: "10", precioUnitario: "8" }],
      },
    });
    const id2 = otra.json().id;
    await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${id2}/autorizar`,
      headers: auth(ownerToken),
      payload: {},
    });
    const det = await app.inject({
      method: "GET",
      url: `/t/ordenes-compra/${id2}`,
      headers: auth(ownerToken),
    });
    const l2 = (det.json() as { lineas: Array<{ id: string }> }).lineas[0]!.id;
    const res = await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${id2}/recibir`,
      headers: auth(ownerToken),
      payload: { lineas: [{ lineaId: l2, cantidadRecibida: "999" }] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("no se puede cancelar una OC recibida totalmente (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${ocId}/cancelar`,
      headers: auth(ownerToken),
      payload: { motivo: "ya no" },
    });
    expect(res.statusCode).toBe(409);
  });
});
