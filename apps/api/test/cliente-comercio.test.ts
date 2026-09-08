import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listarCatalogo, ventaConfig } from "../src/modules/tenant/carrito/catalogo-service.js";
import { catalogoQuerySchema } from "../src/modules/tenant/carrito/schemas.js";
import { buildTestApp, createTestTenant } from "./helpers.js";

const A = "test-comercio-a";
const B = "test-comercio-b";
const prefix = "/cliente-portal/comercio";
let app: FastifyInstance;
let tokenA: string;
let tokenOther: string;
let tokenB: string;
let clienteA: string;
let clienteOther: string;
let variant: string;
let product: string;
let archivedVariant: string;
let cart: string;
const blocked: string[] = [];
const headers = (token = tokenA) => ({ authorization: `Bearer ${token}` });

async function seedProduct(tenant: string, slug: string, price: string) {
  const client = getTenantClient(tenant);
  const p = await client.producto.create({
    data: {
      skuPadre: slug,
      nombre: `Privado ${slug}`,
      metadata: { secret: "internal-metadata" },
      variantes: {
        create: {
          sku: slug,
          precioBase: price,
          costoPromedio: "23",
          costoUltimo: "24",
          isDefault: true,
        },
      },
    },
    include: { variantes: true },
  });
  await client.productoPublicado.create({
    data: {
      productoId: p.id,
      tituloPublico: `Público ${slug}`,
      slugSeo: slug,
      fotosArray: ["https://example.test/photo.png"],
    },
  });
  const createdVariant = p.variantes[0];
  if (!createdVariant) throw new Error("Fixture sin variante");
  return { product: p.id, variant: createdVariant.id };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(A, "Comercio A");
  await createTestTenant(B, "Comercio B");
  const a = getTenantClient(A);
  const b = getTenantClient(B);
  const ca = await a.cliente.create({
    data: { nombre: "Cliente A", emailPrincipal: "a@example.test" },
  });
  const other = await a.cliente.create({
    data: { nombre: "Cliente Otro", emailPrincipal: "other@example.test" },
  });
  const cb = await b.cliente.create({
    data: { nombre: "Cliente B", emailPrincipal: "b@example.test" },
  });
  clienteA = ca.id;
  clienteOther = other.id;
  tokenA = app.jwt.sign({ sub: ca.id, email: "a@example.test", tenantSlug: A, kind: "cliente" });
  tokenOther = app.jwt.sign({
    sub: other.id,
    email: "other@example.test",
    tenantSlug: A,
    kind: "cliente",
  });
  tokenB = app.jwt.sign({ sub: cb.id, email: "b@example.test", tenantSlug: B, kind: "cliente" });
  const base = await seedProduct(A, "articulo", "125");
  product = base.product;
  variant = base.variant;
  await seedProduct(B, "articulo", "900");
  archivedVariant = (
    await a.productoVariante.create({
      data: {
        productoId: product,
        sku: "archived-var",
        precioBase: "1",
        isActive: true,
        archivedAt: new Date(),
      },
    })
  ).id;
  for (const condition of [
    "inactive",
    "archived",
    "private",
    "unpublished",
    "variant-inactive",
    "variant-archived",
  ]) {
    const p = await seedProduct(A, condition, "10");
    blocked.push(p.variant);
    if (condition === "inactive")
      await a.producto.update({ where: { id: p.product }, data: { isActive: false } });
    if (condition === "archived")
      await a.producto.update({ where: { id: p.product }, data: { archivedAt: new Date() } });
    if (condition === "private")
      await a.producto.update({ where: { id: p.product }, data: { isVisiblePublico: false } });
    if (condition === "unpublished")
      await a.productoPublicado.update({
        where: { productoId: p.product },
        data: { isPublicado: false },
      });
    if (condition === "variant-inactive")
      await a.productoVariante.update({ where: { id: p.variant }, data: { isActive: false } });
    if (condition === "variant-archived")
      await a.productoVariante.update({
        where: { id: p.variant },
        data: { archivedAt: new Date() },
      });
  }
  await a.categoriaPublica.create({ data: { nombre: "Pública", slugSeo: "publica" } });
  await a.categoriaPublica.create({
    data: { nombre: "Inactiva", slugSeo: "inactiva", isActive: false },
  });
});
afterAll(async () => {
  await app?.close();
});

describe("fachada comercio con JWT cliente", () => {
  it("rechaza anónimo y token empleado", async () => {
    expect((await app.inject({ method: "GET", url: `${prefix}/catalogo` })).statusCode).toBe(401);
    const employee = app.jwt.sign({
      sub: "employee",
      email: "e@example.test",
      tenantSlug: A,
      kind: "tenant",
      permissions: ["*"],
    });
    expect(
      (await app.inject({ method: "GET", url: `${prefix}/catalogo`, headers: headers(employee) }))
        .statusCode,
    ).toBe(401);
  });
  it("catálogo paginado solo devuelve activos comprables sin costos internos", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${prefix}/catalogo?q=articulo&page=1&pageSize=1`,
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(1);
    expect(res.json().items[0].variantes).toHaveLength(1);
    expect(res.json().items[0].precioDesde).toBe("125.00");
    for (const field of ["costoPromedio", "costoUltimo", "metadata", "skuPadre", "productoId"])
      expect(res.body).not.toContain(`"${field}"`);
  });
  it("misma ruta slug se resuelve por tenant JWT, no header ajeno", async () => {
    const a = await app.inject({
      method: "GET",
      url: `${prefix}/productos/articulo`,
      headers: { ...headers(), "x-tenant-slug": B },
    });
    const b = await app.inject({
      method: "GET",
      url: `${prefix}/productos/articulo`,
      headers: headers(tokenB),
    });
    expect(a.json().precioDesde).toBe("125.00");
    expect(b.json().precioDesde).toBe("900.00");
  });
  it.each([
    "inactive",
    "archived",
    "private",
    "unpublished",
    "variant-inactive",
    "variant-archived",
  ])("detalle oculta %s", async (slug) => {
    expect(
      (await app.inject({ method: "GET", url: `${prefix}/productos/${slug}`, headers: headers() }))
        .statusCode,
    ).toBe(404);
  });
  it("regresión catálogo web compartido oculta inactivos y variantes archivadas", async () => {
    const client = getTenantClient(A);
    const result = await listarCatalogo(
      client,
      await ventaConfig(client),
      catalogoQuerySchema.parse({}),
    );
    expect(result.total).toBe(1);
    expect(result.items[0]?.producto.variantes.map((v) => v.id)).toEqual([variant]);
    expect(result.items[0]?.precioDesde).toBe("125.00");
  });
  it.each(["pageSize=101", "page=0", "tenantSlug=test-comercio-b", `q=${"x".repeat(121)}`])(
    "limita query %s",
    async (query) => {
      expect(
        (
          await app.inject({
            method: "GET",
            url: `${prefix}/catalogo?${query}`,
            headers: headers(),
          })
        ).statusCode,
      ).toBe(400);
    },
  );
  it("categorías activas y config pública sin secretos", async () => {
    const cats = await app.inject({
      method: "GET",
      url: `${prefix}/categorias`,
      headers: headers(),
    });
    expect(cats.json().map((c: { nombre: string }) => c.nombre)).toEqual(["Pública"]);
    const config = await app.inject({ method: "GET", url: `${prefix}/config`, headers: headers() });
    expect(config.statusCode).toBe(200);
    expect(config.body).not.toContain("pasarelaPagoProvider");
    expect(config.body).not.toContain("tagsAnalytics");
  });
});

describe("carrito cliente aislado y precio servidor", () => {
  it("crea carrito con identidad JWT y recálculo de precio", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${prefix}/carrito`,
      headers: headers(),
      payload: { items: [{ varianteId: variant, cantidad: 2 }] },
    });
    expect(res.statusCode).toBe(200);
    cart = res.json().id;
    expect(Number(res.json().items[0].precioUnitario)).toBe(125);
    expect(Number(res.json().subtotal)).toBe(250);
    const saved = await getTenantClient(A).carritoEcommerce.findUniqueOrThrow({
      where: { id: cart },
    });
    expect(saved.clienteId).toBe(clienteA);
    expect(saved.canal).toBe("mobile");
    for (const key of ["clienteId", "emailAnonimo", "recoveryCodigo", "direccionEnvio", "ip"])
      expect(res.body).not.toContain(`"${key}"`);
  });
  it.each([
    { clienteId: "forged" },
    { tenantSlug: B },
    { total: "0" },
    { sessionIdAnonimo: "victim" },
  ])("rechaza autoridad extra %j", async (extra) => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${prefix}/carrito`,
          headers: headers(),
          payload: { items: [{ varianteId: variant, cantidad: 1 }], ...extra },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("rechaza precio cliente, cantidades inválidas, duplicados y exceso de líneas", async () => {
    const invalid = [
      [{ varianteId: variant, cantidad: 1, precioUnitario: "0" }],
      [{ varianteId: variant, cantidad: 0 }],
      [{ varianteId: variant, cantidad: 100001 }],
      [
        { varianteId: variant, cantidad: 1 },
        { varianteId: variant, cantidad: 1 },
      ],
      Array.from({ length: 101 }, (_, i) => ({ varianteId: `v${i}`, cantidad: 1 })),
    ];
    for (const items of invalid)
      expect(
        (
          await app.inject({
            method: "POST",
            url: `${prefix}/carrito`,
            headers: headers(),
            payload: { items },
          })
        ).statusCode,
      ).toBe(400);
  });
  it("rechaza variantes no públicas/archivadas antes de mutar carrito", async () => {
    for (const id of [...blocked, archivedVariant, "foreign-variant"])
      expect(
        (
          await app.inject({
            method: "POST",
            url: `${prefix}/carrito`,
            headers: headers(),
            payload: { items: [{ varianteId: id, cantidad: 1 }] },
          })
        ).statusCode,
      ).toBe(422);
    expect(
      (
        await getTenantClient(A).carritoEcommerce.findUniqueOrThrow({ where: { id: cart } })
      ).total.toString(),
    ).toBe("250");
  });
  it("GET id ajeno cliente o tenant falla y restore propio existe", async () => {
    for (const token of [tokenOther, tokenB])
      expect(
        (
          await app.inject({
            method: "GET",
            url: `${prefix}/carrito/${cart}`,
            headers: headers(token),
          })
        ).statusCode,
      ).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: `${prefix}/carrito`, headers: headers() })).json().id,
    ).toBe(cart);
    expect(
      (await app.inject({ method: "GET", url: `${prefix}/carrito`, headers: headers(tokenOther) }))
        .statusCode,
    ).toBe(404);
  });
  it("reemplaza líneas con precio actualizado y omisión quita cupón previo", async () => {
    await getTenantClient(A).productoVariante.update({
      where: { id: variant },
      data: { precioBase: "140" },
    });
    let res = await app.inject({
      method: "POST",
      url: `${prefix}/carrito`,
      headers: headers(),
      payload: { items: [{ varianteId: variant, cantidad: 1 }], cuponCodigo: "PENDIENTE" },
    });
    expect(res.json().id).toBe(cart);
    expect(Number(res.json().total)).toBe(140);
    res = await app.inject({
      method: "POST",
      url: `${prefix}/carrito`,
      headers: headers(),
      payload: { items: [{ varianteId: variant, cantidad: 1 }] },
    });
    expect(res.json().cuponCodigo).toBeNull();
  });
  it("no modifica ni abandona carrito ligado a intento de pago", async () => {
    const client = getTenantClient(A);
    await client.checkoutAttempt.create({
      data: {
        key: "mobile-pending",
        requestHash: "test-hash",
        requestedBy: "service",
        carritoId: cart,
      },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${prefix}/carrito`,
          headers: headers(),
          payload: { items: [{ varianteId: variant, cantidad: 3 }] },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await app.inject({ method: "DELETE", url: `${prefix}/carrito`, headers: headers() }))
        .statusCode,
    ).toBe(409);
    await client.checkoutAttempt.delete({ where: { key: "mobile-pending" } });
  });
  it("DELETE abandona propios mobile, conserva ajenos y es idempotente", async () => {
    const client = getTenantClient(A);
    const other = await client.carritoEcommerce.create({
      data: { clienteId: clienteOther, canal: "mobile" },
    });
    const web = await client.carritoEcommerce.create({
      data: { clienteId: clienteA, canal: "web" },
    });
    expect(
      (await app.inject({ method: "DELETE", url: `${prefix}/carrito`, headers: headers() }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: "DELETE", url: `${prefix}/carrito`, headers: headers() }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: "GET", url: `${prefix}/carrito/${cart}`, headers: headers() }))
        .statusCode,
    ).toBe(404);
    expect(
      (await client.carritoEcommerce.findUniqueOrThrow({ where: { id: other.id } })).status,
    ).toBe("activo");
    expect(
      (await client.carritoEcommerce.findUniqueOrThrow({ where: { id: web.id } })).status,
    ).toBe("activo");
  });
  it("convertido no se entrega como activo", async () => {
    await getTenantClient(A).carritoEcommerce.update({
      where: { id: cart },
      data: { status: "convertido" },
    });
    expect(
      (await app.inject({ method: "GET", url: `${prefix}/carrito/${cart}`, headers: headers() }))
        .statusCode,
    ).toBe(404);
  });
});

describe("serialización de carrito móvil", () => {
  it("dos altas concurrentes del mismo cliente conservan un solo activo", async () => {
    const results = await Promise.all(
      [1, 3].map((cantidad) =>
        app.inject({
          method: "POST",
          url: `${prefix}/carrito`,
          headers: headers(),
          payload: { items: [{ varianteId: variant, cantidad }] },
        }),
      ),
    );
    expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
    expect(results[0]?.json().id).toBe(results[1]?.json().id);
    expect(
      await getTenantClient(A).carritoEcommerce.count({
        where: { clienteId: clienteA, canal: "mobile", status: "activo" },
      }),
    ).toBe(1);
  });
});
