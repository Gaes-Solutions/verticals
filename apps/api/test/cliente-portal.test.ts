import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTestTenant } from "./helpers.js";

const TENANT_SLUG = "test-cliente-1";
const EMAIL = "ana@cliente.mx";
const PASSWORD = "Cliente!2026";

let app: FastifyInstance;
let clienteToken: string;
let clienteId: string;

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tienda Cliente Test");
});

afterAll(async () => {
  if (app) await app.close();
});

describe("registro y login de cliente B2C", () => {
  it("registra un cliente nuevo y devuelve JWT", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/registro",
      payload: { tenantSlug: TENANT_SLUG, nombre: "Ana", email: EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { accessToken: string; cliente: { id: string; nombre: string } };
    expect(body.cliente.nombre).toBe("Ana");
    clienteToken = body.accessToken;
    clienteId = body.cliente.id;
  });

  it("registro con email duplicado → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/registro",
      payload: { tenantSlug: TENANT_SLUG, nombre: "Otra", email: EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(409);
  });

  it("login con credenciales válidas", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/login",
      payload: { tenantSlug: TENANT_SLUG, email: EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { accessToken: string }).accessToken).toBeTruthy();
  });

  it("login con password incorrecta → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente/login",
      payload: { tenantSlug: TENANT_SLUG, email: EMAIL, password: "malísima" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("portal de cuenta del cliente", () => {
  it("GET /cliente-portal/me devuelve sus datos", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/cliente-portal/me",
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { email: string }).email).toBe(EMAIL);
  });

  it("portal rechaza token que no es de cliente", async () => {
    const res = await app.inject({ method: "GET", url: "/cliente-portal/me" });
    expect(res.statusCode).toBe(401);
  });

  it("mis pedidos incluye pedidos hechos como invitado con el mismo correo", async () => {
    // simula un pedido guest con el email del cliente (checkout sin cuenta)
    const prisma = getTenantClient(TENANT_SLUG);
    await prisma.pedidoEcommerce.create({
      data: {
        folioPublico: `GP-${Date.now().toString().slice(-8)}`,
        emailComprador: EMAIL,
        subtotal: "100",
        total: "100",
        moneda: "MXN",
        metodoEnvio: "paqueteria",
        direccionEnvio: {},
        statusPedido: "entregado",
        statusPago: "pago_confirmado",
      },
    });
    const res = await app.inject({
      method: "GET",
      url: "/cliente-portal/pedidos",
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    expect(res.statusCode).toBe(200);
    const pedidos = res.json() as Array<{ emailComprador?: string; total: string }>;
    expect(pedidos.length).toBeGreaterThanOrEqual(1);
  });

  it("clienteId quedó persistido con passwordHash", async () => {
    const prisma = getTenantClient(TENANT_SLUG);
    const c = await prisma.cliente.findUnique({ where: { id: clienteId } });
    expect(c?.passwordHash).toBeTruthy();
    expect(c?.passwordHash).not.toBe(PASSWORD); // hasheada, no plana
  });
});

describe("wishlist del cliente", () => {
  let productoPublicadoId: string;

  it("setup: publica un producto", async () => {
    const prisma = getTenantClient(TENANT_SLUG);
    const cat = await prisma.categoria.create({ data: { nombre: "Cat", slug: "cat-wl" } });
    const producto = await prisma.producto.create({
      data: {
        skuPadre: "WL-001",
        nombre: "Producto Wishlist",
        categoriaId: cat.id,
        variantes: { create: [{ sku: "WL-001-V", precioBase: "99.00" }] },
      },
    });
    const pub = await prisma.productoPublicado.create({
      data: {
        productoId: producto.id,
        tituloPublico: "Producto Wishlist",
        slugSeo: "producto-wishlist",
        descripcionMd: "x",
      },
    });
    productoPublicadoId = pub.id;
    expect(productoPublicadoId).toBeTruthy();
  });

  it("wishlist vacía al inicio", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/cliente-portal/wishlist",
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as unknown[]).length).toBe(0);
  });

  it("agrega un producto a la wishlist", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/cliente-portal/wishlist/items",
      headers: { authorization: `Bearer ${clienteToken}` },
      payload: { productoPublicadoId },
    });
    expect(res.statusCode).toBe(201);
  });

  it("agregar el mismo producto es idempotente (no duplica)", async () => {
    await app.inject({
      method: "POST",
      url: "/cliente-portal/wishlist/items",
      headers: { authorization: `Bearer ${clienteToken}` },
      payload: { productoPublicadoId },
    });
    const res = await app.inject({
      method: "GET",
      url: "/cliente-portal/wishlist",
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    const items = res.json() as Array<{ itemId: string; tituloPublico: string; precio: string }>;
    expect(items.length).toBe(1);
    expect(items[0]?.tituloPublico).toBe("Producto Wishlist");
    expect(Number(items[0]?.precio)).toBeCloseTo(99, 0);
  });

  it("quita el producto de la wishlist", async () => {
    const lista = await app.inject({
      method: "GET",
      url: "/cliente-portal/wishlist",
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    const itemId = (lista.json() as Array<{ itemId: string }>)[0]?.itemId;
    const del = await app.inject({
      method: "DELETE",
      url: `/cliente-portal/wishlist/items/${itemId}`,
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    expect(del.statusCode).toBe(204);
    const res = await app.inject({
      method: "GET",
      url: "/cliente-portal/wishlist",
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    expect((res.json() as unknown[]).length).toBe(0);
  });
});

describe("reseñas del cliente (verificadas por compra)", () => {
  let pedidoEntregadoId: string;
  let pubId: string;

  it("setup: pedido entregado con el producto publicado", async () => {
    const prisma = getTenantClient(TENANT_SLUG);
    const variante = await prisma.productoVariante.findFirstOrThrow({
      where: { sku: "WL-001-V" },
    });
    const pub = await prisma.productoPublicado.findUniqueOrThrow({
      where: { slugSeo: "producto-wishlist" },
    });
    pubId = pub.id;
    const pedido = await prisma.pedidoEcommerce.create({
      data: {
        folioPublico: `GP-RES${Date.now().toString().slice(-5)}`,
        clienteId,
        emailComprador: EMAIL,
        items: [
          {
            varianteId: variante.id,
            cantidad: "1",
            nombre: "Producto Wishlist",
            precioUnitario: "99",
            subtotal: "99",
          },
        ],
        subtotal: "99",
        total: "99",
        moneda: "MXN",
        metodoEnvio: "paqueteria",
        statusPedido: "entregado",
        statusPago: "pago_confirmado",
      },
    });
    pedidoEntregadoId = pedido.id;
    expect(pedidoEntregadoId).toBeTruthy();
  });

  it("GET /resenables lista el producto del pedido entregado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/cliente-portal/resenables",
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ productoPublicadoId: string; yaResenado: boolean }>;
    const item = items.find((i) => i.productoPublicadoId === pubId);
    expect(item).toBeDefined();
    expect(item?.yaResenado).toBe(false);
  });

  it("POST /resenas crea reseña con comentario → pendiente de moderación", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/cliente-portal/resenas",
      headers: { authorization: `Bearer ${clienteToken}` },
      payload: {
        pedidoId: pedidoEntregadoId,
        productoPublicadoId: pubId,
        rating: 5,
        titulo: "Excelente",
        comentario: "Muy buen producto, llegó rápido",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().estado).toBe("pendiente");
  });

  it("reseña duplicada del mismo producto/pedido → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/cliente-portal/resenas",
      headers: { authorization: `Bearer ${clienteToken}` },
      payload: { pedidoId: pedidoEntregadoId, productoPublicadoId: pubId, rating: 4 },
    });
    expect(res.statusCode).toBe(409);
  });

  it("resenables ahora marca yaResenado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/cliente-portal/resenables",
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    const items = res.json() as Array<{ productoPublicadoId: string; yaResenado: boolean }>;
    expect(items.find((i) => i.productoPublicadoId === pubId)?.yaResenado).toBe(true);
  });

  it("pedido ajeno → 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/cliente-portal/resenas",
      headers: { authorization: `Bearer ${clienteToken}` },
      payload: { pedidoId: "ped-de-otro", productoPublicadoId: pubId, rating: 5 },
    });
    expect(res.statusCode).toBe(404);
  });
});
