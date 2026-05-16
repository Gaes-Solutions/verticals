import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-catalogo-1";
const OWNER_EMAIL = "owner-cat@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-cat@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant Catálogo");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner Cat",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero Cat",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, CASHIER_PASSWORD))
    .accessToken;
});

afterAll(async () => {
  if (app) await app.close();
});

function authOwner(): { authorization: string } {
  return { authorization: `Bearer ${ownerToken}` };
}

function authCashier(): { authorization: string } {
  return { authorization: `Bearer ${cashierToken}` };
}

describe("tenant CRUD — categorías", () => {
  let categoriaPadreId: string;

  it("owner crea categoría raíz", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/categorias",
      headers: authOwner(),
      payload: { nombre: "Belleza", slug: "belleza" },
    });
    expect(res.statusCode).toBe(201);
    categoriaPadreId = res.json().id;
  });

  it("owner crea sub-categoría con parentId válido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/categorias",
      headers: authOwner(),
      payload: { nombre: "Maquillaje", slug: "maquillaje", parentId: categoriaPadreId },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().parentId).toBe(categoriaPadreId);
  });

  it("rechaza categoría con parentId inexistente (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/categorias",
      headers: authOwner(),
      payload: { nombre: "X", slug: "x-x", parentId: "no-existe" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rechaza slug duplicado (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/categorias",
      headers: authOwner(),
      payload: { nombre: "Belleza Dup", slug: "belleza" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("owner lista categorías", async () => {
    const res = await app.inject({ method: "GET", url: "/t/categorias", headers: authOwner() });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ slug: string }>;
    expect(items.some((c) => c.slug === "belleza")).toBe(true);
  });

  it("rechaza ser su propio padre (400)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/categorias/${categoriaPadreId}`,
      headers: authOwner(),
      payload: { parentId: categoriaPadreId },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("tenant CRUD — marcas", () => {
  it("owner crea marca", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/marcas",
      headers: authOwner(),
      payload: { nombre: "L'Oréal", slug: "loreal", paisOrigen: "FR" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().slug).toBe("loreal");
  });

  it("cajero NO puede crear marca (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/marcas",
      headers: authCashier(),
      payload: { nombre: "X", slug: "x" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("tenant CRUD — productos + variantes", () => {
  let categoriaId: string;
  let marcaId: string;
  let productoId: string;
  let varianteDefaultId: string;

  beforeAll(async () => {
    const cat = await app.inject({
      method: "POST",
      url: "/t/categorias",
      headers: authOwner(),
      payload: { nombre: "Abarrotes", slug: "abarrotes" },
    });
    categoriaId = cat.json().id;
    const marca = await app.inject({
      method: "POST",
      url: "/t/marcas",
      headers: authOwner(),
      payload: { nombre: "Lala", slug: "lala" },
    });
    marcaId = marca.json().id;
  });

  it("owner crea producto con variante default + barcode auto-creados", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/productos",
      headers: authOwner(),
      payload: {
        skuPadre: "LECHE-1L",
        nombre: "Leche entera 1L",
        categoriaId,
        marcaId,
        unidadMedida: "lt",
        precioBase: "25.50",
        codigoBarras: "7501020100010",
        tasaIva: "0",
        aplicaIva: false,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      id: string;
      variantes: Array<{
        id: string;
        sku: string;
        isDefault: boolean;
        codigosBarras: Array<{ codigo: string }>;
      }>;
    };
    productoId = body.id;
    expect(body.variantes).toHaveLength(1);
    const variante = body.variantes[0];
    if (!variante) throw new Error("variante missing");
    expect(variante.sku).toBe("LECHE-1L");
    expect(variante.isDefault).toBe(true);
    expect(variante.codigosBarras[0]?.codigo).toBe("7501020100010");
    varianteDefaultId = variante.id;
  });

  it("rechaza skuPadre duplicado (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/productos",
      headers: authOwner(),
      payload: { skuPadre: "LECHE-1L", nombre: "Dup", precioBase: "10" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rechaza categoriaId inexistente (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/productos",
      headers: authOwner(),
      payload: {
        skuPadre: "X-1",
        nombre: "X",
        precioBase: "1",
        categoriaId: "no-existe-cat",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("búsqueda por barcode encuentra producto", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/productos/buscar/7501020100010",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(productoId);
  });

  it("búsqueda por SKU padre encuentra producto", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/productos/buscar/LECHE-1L",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(productoId);
  });

  it("búsqueda con código inexistente retorna 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/productos/buscar/00000000000",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("listado paginado retorna {items,total,page,pageSize}", async () => {
    const res = await app.inject({ method: "GET", url: "/t/productos", headers: authOwner() });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; total: number; page: number; pageSize: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
  });

  it("búsqueda full-text q encuentra por nombre parcial", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/productos?q=leche",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(1);
  });

  it("cajero PUEDE listar y buscar productos (necesario para POS)", async () => {
    const res = await app.inject({ method: "GET", url: "/t/productos", headers: authCashier() });
    expect(res.statusCode).toBe(200);
  });

  it("cajero NO puede crear producto (sin productos.crear, 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/productos",
      headers: authCashier(),
      payload: { skuPadre: "X-Cajero", nombre: "X", precioBase: "1" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("owner agrega variante adicional al producto", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/variantes",
      headers: authOwner(),
      payload: {
        productoId,
        sku: "LECHE-DESLACT-1L",
        nombreVariante: "Deslactosada",
        precioBase: "28.00",
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("owner archiva variante default → 409", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/t/variantes/${varianteDefaultId}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(409);
  });

  it("agrega segundo barcode a variante default", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/variantes/${varianteDefaultId}/codigos-barras`,
      headers: authOwner(),
      payload: { codigo: "INT-LECHE-001", tipo: "corto_interno", isPrimary: false },
    });
    expect(res.statusCode).toBe(201);
  });

  it("búsqueda con barcode alterno funciona", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/productos/buscar/INT-LECHE-001",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
  });

  it("PATCH producto actualiza nombre y flags fiscales", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/productos/${productoId}`,
      headers: authOwner(),
      payload: { nombre: "Leche entera 1L UHT", aplicaIva: true, tasaIva: "16" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().nombre).toBe("Leche entera 1L UHT");
  });
});
