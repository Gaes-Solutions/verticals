import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, cleanupTestTenants, createTestTenant } from "./helpers.js";

/**
 * El catálogo se mira sin cuenta, como en cualquier tienda en línea. Lo que
 * estas pruebas cuidan es que "sin cuenta" no signifique "sin límites": nada de
 * otra tienda, nada de costos, y nada si el negocio apagó su tienda.
 */

const ABIERTA = "test-cat-abierta";
const CERRADA = "test-cat-cerrada";
const VACIA = "test-cat-vacia";
let app: FastifyInstance;

async function sembrar(tenant: string, slug: string, precio: string, activa: boolean) {
  const client = getTenantClient(tenant);
  const producto = await client.producto.create({
    data: {
      skuPadre: slug,
      nombre: `Interno ${slug}`,
      metadata: { secreto: "no debe salir" },
      variantes: {
        create: {
          sku: slug,
          precioBase: precio,
          costoPromedio: "11",
          costoUltimo: "12",
          isDefault: true,
        },
      },
    },
  });
  await client.productoPublicado.create({
    data: {
      productoId: producto.id,
      tituloPublico: `Público ${slug}`,
      slugSeo: slug,
      fotosArray: ["https://example.test/foto.png"],
    },
  });
  const config = await client.configTiendaEcommerce.findFirst({ select: { id: true } });
  if (config)
    await client.configTiendaEcommerce.update({ where: { id: config.id }, data: { activa } });
  else
    await client.configTiendaEcommerce.create({
      data: { nombre: `Tienda ${slug}`, subdominio: tenant, activa },
    });
}

beforeAll(async () => {
  await cleanupTestTenants();
  app = await buildTestApp();
  await createTestTenant(ABIERTA, "Tienda Abierta");
  await createTestTenant(CERRADA, "Tienda Cerrada");
  await sembrar(ABIERTA, "cafe-abierto", "125", true);
  await sembrar(CERRADA, "cafe-cerrado", "900", false);
  await createTestTenant(VACIA, "Tienda Vacía");
  await getTenantClient(VACIA).configTiendaEcommerce.create({
    data: { nombre: "Tienda Vacía", subdominio: VACIA, activa: true },
  });
});

afterAll(async () => {
  await cleanupTestTenants();
  if (app) await app.close();
});

describe("catálogo público", () => {
  it("encendida pero sin productos publicados tampoco se muestra", async () => {
    const res = await app.inject({ method: "GET", url: `/public/tiendas/${VACIA}/catalogo` });
    expect(res.statusCode).toBe(404);
  });

  it("cualquiera ve el catálogo de una tienda encendida, sin sesión", async () => {
    const res = await app.inject({ method: "GET", url: `/public/tiendas/${ABIERTA}/catalogo` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ nombre?: string; tituloPublico?: string }> };
    expect(body.items.length).toBeGreaterThan(0);
  });

  it("no filtra costos, márgenes ni datos internos del producto", async () => {
    const res = await app.inject({ method: "GET", url: `/public/tiendas/${ABIERTA}/catalogo` });
    // El comprador ve el precio de venta; lo que le costó al negocio es suyo.
    for (const prohibido of ["costoPromedio", "costoUltimo", "secreto", "Interno "]) {
      expect(res.body).not.toContain(prohibido);
    }
  });

  it("la ficha del producto se ve sin sesión", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/public/tiendas/${ABIERTA}/productos/cafe-abierto`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Público cafe-abierto");
  });

  it("una tienda apagada no se puede navegar", async () => {
    // Antes solo se notaba al intentar pagar: el comprador armaba su carrito
    // para nada.
    for (const ruta of ["", "/catalogo", "/categorias"]) {
      const res = await app.inject({ method: "GET", url: `/public/tiendas/${CERRADA}${ruta}` });
      expect(res.statusCode, `ruta ${ruta}`).toBe(404);
    }
  });

  it("una tienda que no existe responde igual que una apagada", async () => {
    const res = await app.inject({ method: "GET", url: "/public/tiendas/no-existe-esta/catalogo" });
    expect(res.statusCode).toBe(404);
  });

  it("el catálogo de una tienda no trae productos de otra", async () => {
    const res = await app.inject({ method: "GET", url: `/public/tiendas/${ABIERTA}/catalogo` });
    expect(res.body).not.toContain("cafe-cerrado");
  });

  it("un slug inválido se rechaza antes de tocar la base", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/public/tiendas/..%2Fetc%2Fpasswd/catalogo",
    });
    expect([400, 404]).toContain(res.statusCode);
  });

  it("el carrito y el pago siguen exigiendo sesión", async () => {
    // Mirar es público; comprar no. Que se abra el catálogo no debe haber
    // abierto nada más.
    const res = await app.inject({ method: "GET", url: "/cliente-portal/comercio/carrito" });
    expect(res.statusCode).toBe(401);
  });
});
