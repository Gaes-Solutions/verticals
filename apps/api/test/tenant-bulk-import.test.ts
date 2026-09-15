import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-bulk-1";
const OWNER = { email: "owner-bulk@test.local", password: "ChangeMe!2026" };

let app: FastifyInstance;
let ownerToken: string;
let sucursalCodigo: string;

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant Bulk");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER.email,
    password: OWNER.password,
    rolCodigo: "dueno",
    nombre: "Owner Bulk",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER.email, OWNER.password)).accessToken;
  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: auth(ownerToken) });
  sucursalCodigo = (sucs.json() as Array<{ codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  )!.codigo;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("bulk import de productos (upsert por SKU)", () => {
  it("crea productos nuevos con costo + stock inicial y auto-crea categoría", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/productos/bulk",
      headers: auth(ownerToken),
      payload: {
        filas: [
          {
            skuPadre: "BULK-A",
            nombre: "Galletas",
            categoriaNombre: "Abarrotes",
            precioBase: "15.50",
            costo: "9",
            stockInicial: "50",
          },
          {
            skuPadre: "BULK-B",
            nombre: "Refresco",
            categoriaNombre: "Abarrotes",
            precioBase: "20",
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as { creados: number; actualizados: number; errores: number };
    expect(r.creados).toBe(2);
    expect(r.errores).toBe(0);

    // el stock inicial de BULK-A debe haber quedado en 50 en la sucursal principal
    const prods = await app.inject({
      method: "GET",
      url: "/t/productos?q=BULK-A",
      headers: auth(ownerToken),
    });
    const prod = (prods.json() as { items: Array<{ variantes: Array<{ id: string }> }> }).items[0];
    const varId = prod?.variantes[0]?.id;
    const inv = await app.inject({
      method: "GET",
      url: `/t/inventario?varianteId=${varId}`,
      headers: auth(ownerToken),
    });
    const invFilas = inv.json() as
      | Array<{ stockActual: string }>
      | { items: Array<{ stockActual: string }> };
    const invLista = Array.isArray(invFilas) ? invFilas : invFilas.items;
    expect(Number(invLista[0]?.stockActual)).toBe(50);

    const cats = await app.inject({
      method: "GET",
      url: "/t/categorias",
      headers: auth(ownerToken),
    });
    const lista = cats.json() as Array<{ nombre: string }> | { items: Array<{ nombre: string }> };
    const arr = Array.isArray(lista) ? lista : lista.items;
    expect(arr.some((c) => c.nombre === "Abarrotes")).toBe(true);
  });

  it("re-importar el mismo SKU lo actualiza (upsert), no duplica", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/productos/bulk",
      headers: auth(ownerToken),
      payload: {
        filas: [{ skuPadre: "BULK-A", nombre: "Galletas Premium", precioBase: "18" }],
      },
    });
    expect(res.json().actualizados).toBe(1);

    const prods = await app.inject({
      method: "GET",
      url: "/t/productos?q=BULK-A",
      headers: auth(ownerToken),
    });
    const items = (prods.json() as { items: Array<{ skuPadre: string; nombre: string }> }).items;
    const match = items.filter((p) => p.skuPadre === "BULK-A");
    expect(match).toHaveLength(1);
    expect(match[0]?.nombre).toBe("Galletas Premium");
  });

  it("carga y actualiza las claves SAT, que son las que habilitan facturar", async () => {
    const client = getTenantClient(TENANT_SLUG);
    const alta = await app.inject({
      method: "POST",
      url: "/t/productos/bulk",
      headers: auth(ownerToken),
      payload: {
        filas: [
          {
            skuPadre: "BULK-SAT",
            nombre: "Refresco 600ml",
            precioBase: "20",
            claveSat: "50202301",
            claveUnidadSat: "H87",
          },
        ],
      },
    });
    expect(alta.json().creados).toBe(1);
    const creado = await client.producto.findFirstOrThrow({
      where: { skuPadre: "BULK-SAT" },
      select: { claveSat: true, claveUnidadSat: true },
    });
    expect(creado.claveSat).toBe("50202301");
    expect(creado.claveUnidadSat).toBe("H87");

    // Re-importar corrige la clave de un producto que ya existía sin ella.
    const correccion = await app.inject({
      method: "POST",
      url: "/t/productos/bulk",
      headers: auth(ownerToken),
      payload: {
        filas: [
          {
            skuPadre: "BULK-SAT",
            nombre: "Refresco 600ml",
            precioBase: "20",
            claveSat: "50202306",
            claveUnidadSat: "LTR",
          },
        ],
      },
    });
    expect(correccion.json().actualizados).toBe(1);
    const actualizado = await client.producto.findFirstOrThrow({
      where: { skuPadre: "BULK-SAT" },
      select: { claveSat: true, claveUnidadSat: true },
    });
    expect(actualizado.claveSat).toBe("50202306");
    expect(actualizado.claveUnidadSat).toBe("LTR");
  });

  it("reutiliza la categoría existente (no la duplica)", async () => {
    const antes = await app.inject({
      method: "GET",
      url: "/t/categorias",
      headers: auth(ownerToken),
    });
    const arrAntes = (() => {
      const j = antes.json() as Array<unknown> | { items: Array<unknown> };
      return Array.isArray(j) ? j : j.items;
    })();
    await app.inject({
      method: "POST",
      url: "/t/productos/bulk",
      headers: auth(ownerToken),
      payload: {
        filas: [
          {
            skuPadre: "BULK-C",
            nombre: "Sabritas",
            categoriaNombre: "abarrotes",
            precioBase: "17",
          },
        ],
      },
    });
    const desp = await app.inject({
      method: "GET",
      url: "/t/categorias",
      headers: auth(ownerToken),
    });
    const arrDesp = (() => {
      const j = desp.json() as Array<unknown> | { items: Array<unknown> };
      return Array.isArray(j) ? j : j.items;
    })();
    expect(arrDesp.length).toBe(arrAntes.length); // no creó otra "Abarrotes"
  });
});

describe("configurador de columnas del import", () => {
  it("default: todas las opcionales activas, ninguna extra obligatoria", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/productos/import-config",
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(200);
    const c = res.json() as { columnasActivas: string[]; columnasObligatorias: string[] };
    expect(c.columnasActivas).toContain("costo");
    expect(c.columnasObligatorias).toEqual([]);
  });

  it("marca costo obligatorio → rechaza filas sin costo y acepta con costo", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/t/productos/import-config",
      headers: auth(ownerToken),
      payload: {
        columnasActivas: ["categoriaNombre", "costo", "stockInicial", "tasaIva", "codigoBarras"],
        columnasObligatorias: ["costo"],
      },
    });
    expect(put.statusCode).toBe(200);

    const sinCosto = await app.inject({
      method: "POST",
      url: "/t/productos/bulk",
      headers: auth(ownerToken),
      payload: { filas: [{ skuPadre: "CFG-A", nombre: "Sin costo", precioBase: "10" }] },
    });
    expect(sinCosto.json().errores).toBe(1);
    expect((sinCosto.json() as { filas: Array<{ mensaje?: string }> }).filas[0]?.mensaje).toContain(
      "Costo",
    );

    const conCosto = await app.inject({
      method: "POST",
      url: "/t/productos/bulk",
      headers: auth(ownerToken),
      payload: {
        filas: [{ skuPadre: "CFG-B", nombre: "Con costo", precioBase: "10", costo: "6" }],
      },
    });
    expect(conCosto.json().creados).toBe(1);

    // restaura el default para no afectar otros tests del archivo
    await app.inject({
      method: "PUT",
      url: "/t/productos/import-config",
      headers: auth(ownerToken),
      payload: {
        columnasActivas: ["categoriaNombre", "costo", "stockInicial", "tasaIva", "codigoBarras"],
        columnasObligatorias: [],
      },
    });
  });

  it("una obligatoria que no está activa se descarta al guardar", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/t/productos/import-config",
      headers: auth(ownerToken),
      payload: { columnasActivas: ["costo"], columnasObligatorias: ["stockInicial"] },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { columnasObligatorias: string[] }).columnasObligatorias).toEqual([]);
    await app.inject({
      method: "PUT",
      url: "/t/productos/import-config",
      headers: auth(ownerToken),
      payload: {
        columnasActivas: ["categoriaNombre", "costo", "stockInicial", "tasaIva", "codigoBarras"],
        columnasObligatorias: [],
      },
    });
  });
});

describe("bulk actualización de precios", () => {
  it("actualiza precio por SKU y reporta SKU inexistente como error", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/productos/bulk-precios",
      headers: auth(ownerToken),
      payload: {
        filas: [
          { sku: "BULK-A", precioBase: "25" },
          { sku: "NO-EXISTE", precioBase: "99" },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as { actualizados: number; errores: number };
    expect(r.actualizados).toBe(1);
    expect(r.errores).toBe(1);
  });
});

describe("bulk conteo físico de inventario", () => {
  it("ajusta al stock absoluto contado (delta) y registra el movimiento", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/inventario/bulk-conteo",
      headers: auth(ownerToken),
      payload: {
        filas: [{ sku: "BULK-A", sucursalCodigo, cantidadFisica: "120" }],
      },
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as {
      ajustados: number;
      filas: Array<{ stockAnterior: string; stockNuevo: string }>;
    };
    expect(r.ajustados).toBe(1);
    // BULK-A ya tenía 50 de stock inicial (cargado en el import de productos)
    expect(Number(r.filas[0]?.stockAnterior)).toBe(50);
    expect(Number(r.filas[0]?.stockNuevo)).toBe(120);
  });

  it("segundo conteo con la misma cantidad → sin_cambio", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/inventario/bulk-conteo",
      headers: auth(ownerToken),
      payload: { filas: [{ sku: "BULK-A", sucursalCodigo, cantidadFisica: "120" }] },
    });
    expect(res.json().sinCambio).toBe(1);
  });

  it("baja el stock si el conteo es menor (delta negativo)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/inventario/bulk-conteo",
      headers: auth(ownerToken),
      payload: { filas: [{ sku: "BULK-A", sucursalCodigo, cantidadFisica: "100" }] },
    });
    const fila = (res.json() as { filas: Array<{ stockNuevo: string }> }).filas[0];
    expect(Number(fila?.stockNuevo)).toBe(100);
  });

  it("SKU y sucursal inexistentes → error por fila", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/inventario/bulk-conteo",
      headers: auth(ownerToken),
      payload: {
        filas: [
          { sku: "NO-EXISTE", sucursalCodigo, cantidadFisica: "5" },
          { sku: "BULK-A", sucursalCodigo: "SUC-FANTASMA", cantidadFisica: "5" },
        ],
      },
    });
    expect(res.json().errores).toBe(2);
  });
});

describe("precio de mayoreo y mínimos/máximos", () => {
  const cliente = () => getTenantClient(TENANT_SLUG);

  async function importar(filas: Array<Record<string, string>>) {
    const res = await app.inject({
      method: "POST",
      url: "/t/productos/bulk",
      headers: auth(ownerToken),
      payload: { filas },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().errores).toBe(0);
  }

  async function idsDe(sku: string) {
    const variante = await cliente().productoVariante.findUniqueOrThrow({ where: { sku } });
    const sucursal = await cliente().sucursal.findFirstOrThrow({
      where: { codigo: sucursalCodigo },
    });
    return { varianteId: variante.id, sucursalId: sucursal.id };
  }

  it("guarda el mayoreo en la lista Mayoreo y los límites en la sucursal principal", async () => {
    await importar([
      {
        skuPadre: "MAY-A",
        nombre: "Globo metálico",
        precioBase: "30",
        precioMayoreo: "22",
        stockMinimo: "5",
        stockMaximo: "40",
      },
      {
        skuPadre: "MAY-B",
        nombre: "Vela chispera",
        precioBase: "9",
        precioMayoreo: "0",
        stockMaximo: "0",
      },
    ]);
    const lista = await cliente().listaPrecio.findUniqueOrThrow({
      where: { codigo: "MAYOREO" },
      include: { items: { include: { variante: { select: { sku: true } } } } },
    });
    expect(lista.items.map((i) => [i.variante.sku, i.precio.toString()])).toEqual([
      ["MAY-A", "22"],
    ]);

    const a = await idsDe("MAY-A");
    const inv = await cliente().inventarioSucursal.findUniqueOrThrow({
      where: { varianteId_sucursalId: a },
    });
    expect(inv.stockMinimo.toString()).toBe("5");
    expect(inv.stockMaximo?.toString()).toBe("40");

    // Máximo en 0 significa "sin máximo".
    const b = await idsDe("MAY-B");
    const invB = await cliente().inventarioSucursal.findUniqueOrThrow({
      where: { varianteId_sucursalId: b },
    });
    expect(invB.stockMaximo).toBeNull();
  });

  it("mayoreo en 0 al re-importar le quita el precio de mayoreo al producto", async () => {
    await importar([
      { skuPadre: "MAY-A", nombre: "Globo metálico", precioBase: "30", precioMayoreo: "0" },
    ]);
    const { varianteId } = await idsDe("MAY-A");
    expect(await cliente().listaPrecioItem.count({ where: { varianteId } })).toBe(0);
    await importar([
      { skuPadre: "MAY-A", nombre: "Globo metálico", precioBase: "30", precioMayoreo: "22" },
    ]);
    expect(await cliente().listaPrecioItem.count({ where: { varianteId } })).toBe(1);
  });

  it("el POS sabe que hay precio de mayoreo y la venta lo cobra más barato", async () => {
    const disponible = await app.inject({
      method: "GET",
      url: "/t/ventas/precio-mayoreo",
      headers: auth(ownerToken),
    });
    expect(disponible.json()).toEqual({ disponible: true, codigo: "MAYOREO" });

    const { varianteId, sucursalId } = await idsDe("MAY-A");
    const base = { sucursalId, canal: "pos", lineas: [{ varianteId, cantidad: "2" }] };
    const normal = await app.inject({
      method: "POST",
      url: "/t/ventas/preview",
      headers: auth(ownerToken),
      payload: base,
    });
    const mayoreo = await app.inject({
      method: "POST",
      url: "/t/ventas/preview",
      headers: auth(ownerToken),
      payload: { ...base, listaPrecioCodigo: "MAYOREO" },
    });
    expect(normal.statusCode).toBe(200);
    expect(mayoreo.statusCode).toBe(200);
    expect(Number(mayoreo.json().total)).toBeLessThan(Number(normal.json().total));
  });
});

describe("rollback por fila de importación", () => {
  it("revierte producto, categoría y stock si falla mayoreo, y procesa la fila siguiente", async () => {
    const client = getTenantClient(TENANT_SLUG);
    const res = await app.inject({
      method: "POST",
      url: "/t/productos/bulk",
      headers: auth(ownerToken),
      payload: {
        filas: [
          {
            skuPadre: "ROLLBACK-BAD",
            nombre: "No guardar",
            precioBase: "10",
            categoriaNombre: "Categoria rollback",
            stockInicial: "5",
            precioMayoreo: "10000000000",
          },
          {
            skuPadre: "ROLLBACK-GOOD",
            nombre: "Sí guardar",
            precioBase: "10",
            categoriaNombre: "Categoria rollback",
            stockInicial: "7",
            precioMayoreo: "8",
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      total: 2,
      creados: 1,
      actualizados: 0,
      errores: 1,
      filas: [
        { fila: 1, accion: "error" },
        { fila: 2, accion: "creado" },
      ],
    });
    expect(await client.producto.findFirst({ where: { skuPadre: "ROLLBACK-BAD" } })).toBeNull();
    expect(await client.productoVariante.findFirst({ where: { sku: "ROLLBACK-BAD" } })).toBeNull();
    const good = await client.producto.findFirstOrThrow({
      where: { skuPadre: "ROLLBACK-GOOD" },
      include: { categoria: true, variantes: true },
    });
    expect(good.categoria?.nombre).toBe("Categoria rollback");
    const variant = good.variantes[0];
    if (!variant) throw new Error("Missing imported variant");
    const stock = await client.inventarioSucursal.findFirstOrThrow({
      where: { varianteId: variant.id },
    });
    expect(stock.stockActual.toString()).toBe("7");
    const price = await client.listaPrecioItem.findFirstOrThrow({
      where: { varianteId: variant.id },
    });
    expect(price.precio.toString()).toBe("8");
  });

  it("revierte cambios de un producto existente y el mayoreo si falla el límite de inventario", async () => {
    const client = getTenantClient(TENANT_SLUG);
    const filas = [
      {
        skuPadre: "ROLLBACK-UPDATE",
        nombre: "Original",
        precioBase: "10",
        stockInicial: "4",
        precioMayoreo: "8",
        stockMinimo: "2",
      },
    ];
    const initial = await app.inject({
      method: "POST",
      url: "/t/productos/bulk",
      headers: auth(ownerToken),
      payload: { filas },
    });
    expect(initial.json().creados).toBe(1);
    const res = await app.inject({
      method: "POST",
      url: "/t/productos/bulk",
      headers: auth(ownerToken),
      payload: {
        filas: [
          {
            ...filas[0],
            nombre: "Cambio fallido",
            precioBase: "20",
            stockInicial: "15",
            precioMayoreo: "18",
            stockMinimo: "1000000000000000",
          },
        ],
      },
    });
    expect(res.json()).toMatchObject({ total: 1, creados: 0, actualizados: 0, errores: 1 });
    const prod = await client.producto.findFirstOrThrow({
      where: { skuPadre: "ROLLBACK-UPDATE" },
      include: { variantes: true },
    });
    expect(prod.nombre).toBe("Original");
    const variant = prod.variantes[0];
    if (!variant) throw new Error("Missing imported variant");
    expect(variant.precioBase.toString()).toBe("10");
    const stock = await client.inventarioSucursal.findFirstOrThrow({
      where: { varianteId: variant.id },
    });
    expect(stock.stockActual.toString()).toBe("4");
    expect(stock.stockMinimo.toString()).toBe("2");
    expect(await client.inventarioMovimiento.count({ where: { varianteId: variant.id } })).toBe(1);
    const price = await client.listaPrecioItem.findFirstOrThrow({
      where: { varianteId: variant.id },
    });
    expect(price.precio.toString()).toBe("8");
  });
});
