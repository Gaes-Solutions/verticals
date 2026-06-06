import { MockEmailProvider } from "@gaespos/email";
import { MockPaymentProvider } from "@gaespos/pagos";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-ecommerce-1";
const OWNER = { email: "owner-ecom@test.local", password: "ChangeMe!2026" };

let app: FastifyInstance;
let pagoMock: MockPaymentProvider;
let emailMock: MockEmailProvider;
let ownerToken: string;
let sucursalId: string;
let varianteId: string;
let productoPublicadoId: string;
let carritoId: string;
let zonaEnvioId: string;
let tarifaEnvioId: string;

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

beforeAll(async () => {
  pagoMock = new MockPaymentProvider();
  emailMock = new MockEmailProvider();
  app = await buildTestApp(
    {},
    { pagoProviderFactory: () => pagoMock, emailProviderFactory: () => emailMock },
  );
  await createTestTenant(TENANT_SLUG, "Tienda Demo");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER.email,
    password: OWNER.password,
    rolCodigo: "dueno",
    nombre: "Dueño Ecom",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER.email, OWNER.password)).accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: auth(ownerToken) });
  sucursalId = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  )!.id;

  // Producto + stock
  const cat = await app.inject({
    method: "POST",
    url: "/t/categorias",
    headers: auth(ownerToken),
    payload: { nombre: "Playeras", codigo: "PLY" },
  });
  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(ownerToken),
    payload: {
      skuPadre: "PLY-001",
      nombre: "Playera GaesSoft",
      categoriaId: cat.json().id,
      precioBase: "299.00",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  varianteId = prod.json().variantes[0].id;
  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: auth(ownerToken),
    payload: {
      varianteId,
      sucursalId,
      tipo: "ajuste_positivo",
      cantidad: "100",
      motivo: "Inicial",
    },
  });
});

afterAll(async () => {
  if (app) await app.close();
});

describe("config tienda + publicar producto", () => {
  it("dueño configura la tienda", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/t/ecommerce/config",
      headers: auth(ownerToken),
      payload: { subdominio: "demo-tienda", nombre: "Mi Tienda Demo", activa: true },
    });
    expect([200, 201]).toContain(res.statusCode);
    expect(res.json().subdominio).toBe("demo-tienda");
  });

  it("publica un producto a la tienda", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ecommerce/productos-publicados",
      headers: auth(ownerToken),
      payload: {
        productoId: await prodId(),
        tituloPublico: "Playera GaesSoft Edición Limitada",
        slugSeo: "playera-gaessoft",
        descripcionMd: "La mejor playera",
        destacadoHome: true,
      },
    });
    expect(res.statusCode).toBe(201);
    productoPublicadoId = res.json().id;
  });

  async function prodId(): Promise<string> {
    const list = await app.inject({
      method: "GET",
      url: "/t/productos",
      headers: auth(ownerToken),
    });
    return (list.json() as { items: Array<{ id: string }> }).items[0]!.id;
  }
});

describe("catálogo público + carrito", () => {
  it("catálogo lista el producto publicado destacado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/tienda/catalogo?destacado=true",
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{ slugSeo: string }>;
    expect(items.some((p) => p.slugSeo === "playera-gaessoft")).toBe(true);
  });

  it("detalle por slug devuelve el producto", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/tienda/catalogo/playera-gaessoft",
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tituloPublico).toContain("Playera GaesSoft");
  });

  it("crea carrito anónimo y calcula total", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/tienda",
      headers: auth(ownerToken),
      payload: {
        sessionIdAnonimo: "sess-abc-123",
        canal: "web",
        items: [{ varianteId, cantidad: 2 }],
      },
    });
    expect(res.statusCode).toBe(201);
    const carrito = res.json();
    carritoId = carrito.id;
    // 2 × 299 = 598
    expect(Number(carrito.total)).toBeCloseTo(598, 0);
  });
});

describe("envíos: zonas + tarifas + cotizador + pickup", () => {
  it("crea zona de envío por estado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/envios/zonas",
      headers: auth(ownerToken),
      payload: { nombre: "Occidente", estadosIncluidos: ["Jalisco"] },
    });
    expect(res.statusCode).toBe(201);
    zonaEnvioId = res.json().id;
  });

  it("crea tarifa fija $99 con envío gratis desde $1000", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/envios/tarifas",
      headers: auth(ownerToken),
      payload: {
        zonaEnvioId,
        paqueteria: "estafeta",
        nombrePublico: "Estafeta Estándar",
        tipoCalculo: "fija",
        montoFijo: 99,
        montoMinimoEnvioGratis: 1000,
        diasEntregaEstimados: 3,
      },
    });
    expect(res.statusCode).toBe(201);
    tarifaEnvioId = res.json().id;
  });

  it("cotiza por estado → tarifa $99", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/envios/cotizar?estado=Jalisco&subtotal=598",
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(200);
    const cot = res.json() as { opcionesEnvio: Array<{ costo: string; gratis: boolean }> };
    expect(cot.opcionesEnvio).toHaveLength(1);
    expect(cot.opcionesEnvio[0]?.costo).toBe("99.00");
    expect(cot.opcionesEnvio[0]?.gratis).toBe(false);
  });

  it("subtotal arriba del umbral → envío gratis", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/envios/cotizar?estado=Jalisco&subtotal=1500",
      headers: auth(ownerToken),
    });
    const cot = res.json() as { opcionesEnvio: Array<{ costo: string; gratis: boolean }> };
    expect(cot.opcionesEnvio[0]?.costo).toBe("0.00");
    expect(cot.opcionesEnvio[0]?.gratis).toBe(true);
  });

  it("estado fuera de zona → sin opciones de paquetería", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/envios/cotizar?estado=Yucatan&subtotal=598",
      headers: auth(ownerToken),
    });
    expect(res.json().opcionesEnvio).toHaveLength(0);
  });

  it("activa pickup en sucursal y aparece en la cotización", async () => {
    const up = await app.inject({
      method: "PUT",
      url: `/t/envios/pickup/${sucursalId}`,
      headers: auth(ownerToken),
      payload: { activa: true, tiempoPreparacionPromedioMin: 45 },
    });
    expect(up.statusCode).toBe(200);
    const res = await app.inject({
      method: "GET",
      url: "/t/envios/cotizar?estado=Jalisco&subtotal=598",
      headers: auth(ownerToken),
    });
    const cot = res.json() as { pickup: Array<{ sucursalId: string }> };
    expect(cot.pickup).toHaveLength(1);
    expect(cot.pickup[0]?.sucursalId).toBe(sucursalId);
  });

  it("checkout rechaza tarifa que no aplica a la dirección (422)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/checkout/iniciar",
      headers: auth(ownerToken),
      payload: {
        carritoId,
        emailComprador: "comprador@test.mx",
        metodoPago: "tarjeta",
        proveedorPago: "mock",
        metodoEnvio: "paqueteria",
        tarifaEnvioId,
        direccionEnvio: {
          nombre: "Ana",
          calle: "Calle 60",
          ciudad: "Mérida",
          estado: "Yucatan",
          cp: "97000",
        },
      },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe("checkout: pago mock → pedido → venta + stock", () => {
  let intentId: string;
  let pedidoFolio: string;

  it("inicia checkout → crea pedido + payment intent", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/checkout/iniciar",
      headers: auth(ownerToken),
      payload: {
        carritoId,
        emailComprador: "comprador@test.mx",
        metodoPago: "tarjeta",
        proveedorPago: "mock",
        metodoEnvio: "paqueteria",
        direccionEnvio: {
          nombre: "Ana",
          calle: "Reforma",
          ciudad: "GDL",
          estado: "Jalisco",
          cp: "44100",
        },
        tarifaEnvioId,
      },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json() as { folioPublico: string; intentId: string; total: string };
    expect(r.folioPublico).toMatch(/^GP-\d{8}$/);
    expect(Number(r.total)).toBeCloseTo(697, 0); // 598 + 99 envío (tarifa validada server-side)
    intentId = r.intentId;
    pedidoFolio = r.folioPublico;
  });

  it("webhook de pago confirmado → genera venta + descuenta stock", async () => {
    const { payload, signature } = pagoMock.simularWebhook(intentId);
    const res = await app.inject({
      method: "POST",
      url: "/t/checkout/webhook",
      headers: auth(ownerToken),
      payload: { payload, signature, proveedorPago: "mock" },
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as { statusPago: string; ventaIdGenerada: string | null };
    expect(r.statusPago).toBe("pago_confirmado");
    expect(r.ventaIdGenerada).not.toBeNull();

    // stock descontado de 100 → 98
    const inv = await app.inject({
      method: "GET",
      url: `/t/inventario?varianteId=${varianteId}`,
      headers: auth(ownerToken),
    });
    const filas = inv.json() as
      | Array<{ stockActual: string }>
      | { items: Array<{ stockActual: string }> };
    const lista = Array.isArray(filas) ? filas : filas.items;
    expect(Number(lista[0]?.stockActual)).toBe(98);
  });

  it("pago confirmado → email pedido_confirmado al comprador", () => {
    const email = emailMock.enviados.find(
      (e) => e.para === "comprador@test.mx" && e.asunto.includes("confirmado"),
    );
    expect(email).toBeDefined();
    expect(email?.asunto).toContain(pedidoFolio);
  });

  it("webhook idempotente: segundo llamado no re-genera venta", async () => {
    const { payload, signature } = pagoMock.simularWebhook(intentId);
    const res = await app.inject({
      method: "POST",
      url: "/t/checkout/webhook",
      headers: auth(ownerToken),
      payload: { payload, signature, proveedorPago: "mock" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().statusPago).toBe("pago_confirmado");
  });

  it("tracking público por folio + email", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/pedidos-ecommerce/seguimiento/${pedidoFolio}?email=comprador@test.mx`,
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as { statusPedido: string; eventos: unknown[] };
    expect(r.statusPedido).toBe("pago_confirmado");
    expect(r.eventos.length).toBeGreaterThanOrEqual(2);
  });

  it("tracking con email incorrecto → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/pedidos-ecommerce/seguimiento/${pedidoFolio}?email=otro@test.mx`,
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("gestión pedido + reseña", () => {
  let pedidoId: string;

  beforeAll(async () => {
    const list = await app.inject({
      method: "GET",
      url: "/t/pedidos-ecommerce",
      headers: auth(ownerToken),
    });
    pedidoId = (list.json() as { items: Array<{ id: string }> }).items[0]!.id;
  });

  it("transiciona pedido preparando → enviado con guía", async () => {
    await app.inject({
      method: "POST",
      url: `/t/pedidos-ecommerce/${pedidoId}/transicionar`,
      headers: auth(ownerToken),
      payload: { nuevoEstado: "preparando" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/t/pedidos-ecommerce/${pedidoId}/transicionar`,
      headers: auth(ownerToken),
      payload: { nuevoEstado: "enviado", guiaTracking: "FX123456", paqueteria: "fedex" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().statusPedido).toBe("enviado");
    expect(res.json().guiaTracking).toBe("FX123456");
  });

  it("estado enviado → email con guía al comprador", () => {
    const email = emailMock.enviados.find((e) => e.asunto.includes("va en camino"));
    expect(email).toBeDefined();
    expect(email?.html).toContain("FX123456");
    expect(email?.para).toBe("comprador@test.mx");
  });

  it("no se puede reseñar pedido no entregado → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/resenas",
      headers: auth(ownerToken),
      payload: { productoPublicadoId, pedidoId, rating: 5, comentario: "Excelente" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("entregar pedido y reseñar OK", async () => {
    await app.inject({
      method: "POST",
      url: `/t/pedidos-ecommerce/${pedidoId}/transicionar`,
      headers: auth(ownerToken),
      payload: { nuevoEstado: "entregado" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/t/resenas",
      headers: auth(ownerToken),
      payload: {
        productoPublicadoId,
        pedidoId,
        rating: 5,
        titulo: "Genial",
        comentario: "Muy buena calidad",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().rating).toBe(5);
    expect(res.json().verificadaPorCompra).toBe(true);
  });
});

describe("wishlist", () => {
  it("crea wishlist y agrega item", async () => {
    const cliente = await app.inject({
      method: "POST",
      url: "/t/clientes",
      headers: auth(ownerToken),
      payload: { nombre: "Sofía", apellidos: "R" },
    });
    const wl = await app.inject({
      method: "POST",
      url: "/t/wishlists",
      headers: auth(ownerToken),
      payload: { clienteId: cliente.json().id },
    });
    expect(wl.statusCode).toBe(201);
    const item = await app.inject({
      method: "POST",
      url: `/t/wishlists/${wl.json().id}/items`,
      headers: auth(ownerToken),
      payload: { productoPublicadoId },
    });
    expect(item.statusCode).toBe(201);
  });
});
