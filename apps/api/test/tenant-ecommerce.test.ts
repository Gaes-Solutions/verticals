import { getTenantClient } from "@gaespos/db";
import { MockEmailProvider } from "@gaespos/email";
import { MockPaymentProvider, StripeClient } from "@gaespos/pagos";
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
    {
      // stripe sin keys reproduce el comportamiento del factory default (lanza)
      pagoProviderFactory: (proveedor) =>
        proveedor === "stripe" ? new StripeClient({ apiKey: "", webhookSecret: "" }) : pagoMock,
      emailProviderFactory: () => emailMock,
    },
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

  it("proveedor de pago sin configurar → 503 con mensaje claro", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/checkout/iniciar",
      headers: auth(ownerToken),
      payload: {
        carritoId,
        emailComprador: "comprador@test.mx",
        metodoPago: "tarjeta",
        proveedorPago: "stripe",
        metodoEnvio: "paqueteria",
        direccionEnvio: {
          nombre: "Ana",
          calle: "Reforma",
          ciudad: "GDL",
          estado: "Jalisco",
          cp: "44100",
        },
      },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toContain("Stripe");
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

describe("pulido pedidos: etiquetas configurables + asignación + campana", () => {
  let pedidoId: string;

  beforeAll(async () => {
    const list = await app.inject({
      method: "GET",
      url: "/t/pedidos-ecommerce",
      headers: auth(ownerToken),
    });
    pedidoId = (list.json() as { items: Array<{ id: string }> }).items[0]!.id;
  });

  it("config devuelve etiquetas default", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/pedidos-ecommerce/config",
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as { etiquetas: Record<string, string>; estados: string[] };
    expect(r.etiquetas.preparando).toBe("Preparando");
    expect(r.estados).toContain("entregado");
  });

  it("renombra estados con el vocabulario del negocio (preparando→Surtido)", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/t/pedidos-ecommerce/config",
      headers: auth(ownerToken),
      payload: { etiquetasEstado: { preparando: "Surtido", en_camino: "En proceso" } },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().etiquetas.preparando).toBe("Surtido");

    // la lista ahora refleja la etiqueta personalizada
    const list = await app.inject({
      method: "GET",
      url: "/t/pedidos-ecommerce/config",
      headers: auth(ownerToken),
    });
    expect(list.json().etiquetas.en_camino).toBe("En proceso");
  });

  it("la lista de pedidos trae statusLabel resuelto", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/pedidos-ecommerce",
      headers: auth(ownerToken),
    });
    const items = res.json().items as Array<{ statusLabel: string }>;
    expect(items[0]?.statusLabel).toBeTruthy();
  });

  it("asigna el pedido a un empleado (registra evento interno)", async () => {
    const me = await loginTenantUser(app, TENANT_SLUG, OWNER.email, OWNER.password);
    const res = await app.inject({
      method: "PATCH",
      url: `/t/pedidos-ecommerce/${pedidoId}/asignar`,
      headers: auth(ownerToken),
      payload: { usuarioId: me.userId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().asignadoA?.id).toBe(me.userId);

    const det = await app.inject({
      method: "GET",
      url: `/t/pedidos-ecommerce/${pedidoId}`,
      headers: auth(ownerToken),
    });
    const eventos = det.json().eventos as Array<{ tipo: string }>;
    expect(eventos.some((e) => e.tipo === "asignado")).toBe(true);
  });

  it("desasigna (usuarioId null)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/pedidos-ecommerce/${pedidoId}/asignar`,
      headers: auth(ownerToken),
      payload: { usuarioId: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().asignadoA).toBeNull();
  });

  it("el empleado recibió campana de nuevo pedido (pago confirmado)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/notificaciones",
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as { items: Array<{ tipo: string }>; noLeidas: number };
    expect(r.items.some((n) => n.tipo === "pedido_nuevo")).toBe(true);
  });

  it("marcar todas baja el conteo a 0", async () => {
    await app.inject({
      method: "POST",
      url: "/t/notificaciones/leer-todas",
      headers: auth(ownerToken),
    });
    const res = await app.inject({
      method: "GET",
      url: "/t/notificaciones",
      headers: auth(ownerToken),
    });
    expect(res.json().noLeidas).toBe(0);
  });
});

describe("carrito abandonado + recovery", () => {
  let recoveryCodigo: string;

  it("crea carrito con email y lo marca abandonado al correr el ciclo", async () => {
    const crear = await app.inject({
      method: "POST",
      url: "/t/tienda",
      headers: auth(ownerToken),
      payload: {
        sessionIdAnonimo: "sess-abandono-1",
        canal: "web",
        emailAnonimo: "olvidadizo@test.mx",
        items: [{ varianteId, cantidad: 1 }],
      },
    });
    expect(crear.statusCode).toBe(201);
    const carritoAbandonadoId = crear.json().id as string;

    // umbrales en 0 para no esperar horas reales (configurables por tenant)
    const correr = await app.inject({
      method: "POST",
      url: "/t/tienda/recovery/correr",
      headers: auth(ownerToken),
      payload: {
        minutosInactividad: 0,
        horasPrimerRecordatorio: 0,
        urlBaseTienda: "https://tienda.test",
      },
    });
    expect(correr.statusCode).toBe(200);
    expect(correr.json().marcados).toBeGreaterThanOrEqual(1);
    expect(correr.json().recordatorios24h).toBeGreaterThanOrEqual(1);

    const carrito = await app.inject({
      method: "GET",
      url: `/t/tienda/${carritoAbandonadoId}`,
      headers: auth(ownerToken),
    });
    expect(carrito.json().status).toBe("abandonado");
    recoveryCodigo = carrito.json().recoveryCodigo;
    expect(recoveryCodigo).toMatch(/^rec_/);

    const email = emailMock.enviados.find((e) => e.para === "olvidadizo@test.mx");
    expect(email).toBeDefined();
    expect(email?.html).toContain(`https://tienda.test/recovery/${recoveryCodigo}`);
  });

  it("re-correr el ciclo no duplica el primer recordatorio", async () => {
    const antes = emailMock.enviados.filter((e) => e.para === "olvidadizo@test.mx").length;
    await app.inject({
      method: "POST",
      url: "/t/tienda/recovery/correr",
      headers: auth(ownerToken),
      payload: { minutosInactividad: 0, horasPrimerRecordatorio: 0, horasSegundoRecordatorio: 999 },
    });
    const despues = emailMock.enviados.filter((e) => e.para === "olvidadizo@test.mx").length;
    expect(despues).toBe(antes);
  });

  it("segundo recordatorio sale tras el umbral (y solo una vez)", async () => {
    const correr = await app.inject({
      method: "POST",
      url: "/t/tienda/recovery/correr",
      headers: auth(ownerToken),
      payload: { minutosInactividad: 0, horasSegundoRecordatorio: 0 },
    });
    expect(correr.json().recordatorios72h).toBeGreaterThanOrEqual(1);
    const otra = await app.inject({
      method: "POST",
      url: "/t/tienda/recovery/correr",
      headers: auth(ownerToken),
      payload: { minutosInactividad: 0, horasSegundoRecordatorio: 0 },
    });
    expect(otra.json().recordatorios72h).toBe(0);
  });

  it("GET recovery/:codigo devuelve los items para restaurar", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/tienda/recovery/${recoveryCodigo}`,
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{ varianteId: string }>;
    expect(items[0]?.varianteId).toBe(varianteId);
  });

  it("código inexistente → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/tienda/recovery/rec_no-existe-123",
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(404);
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

describe("devolución desde la tienda (solicitud → aprobación) + mensajería", () => {
  let clienteToken: string;
  let pedidoId: string;
  let pedidoFolio: string;
  let solicitudId: string;

  async function stock(): Promise<number> {
    const inv = await app.inject({
      method: "GET",
      url: `/t/inventario?varianteId=${varianteId}`,
      headers: auth(ownerToken),
    });
    const filas = inv.json() as
      | Array<{ stockActual: string }>
      | { items: Array<{ stockActual: string }> };
    const lista = Array.isArray(filas) ? filas : filas.items;
    return Number(lista[0]?.stockActual);
  }

  beforeAll(async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/auth/cliente/registro",
      payload: {
        tenantSlug: TENANT_SLUG,
        nombre: "Compradora Online",
        email: "online@cliente.mx",
        password: "Cliente!2026",
      },
    });
    clienteToken = reg.json().accessToken;
    const clienteId = reg.json().cliente.id as string;

    // Toma el pedido entregado (con venta generada) y lo liga a este cliente.
    const list = await app.inject({
      method: "GET",
      url: "/t/pedidos-ecommerce?statusPedido=entregado",
      headers: auth(ownerToken),
    });
    const entregado = (list.json() as { items: Array<{ id: string; folioPublico: string }> })
      .items[0]!;
    pedidoId = entregado.id;
    pedidoFolio = entregado.folioPublico;
    await getTenantClient(TENANT_SLUG).pedidoEcommerce.update({
      where: { id: pedidoId },
      data: { clienteId, emailComprador: "online@cliente.mx" },
    });
  });

  function clienteAuth() {
    return { authorization: `Bearer ${clienteToken}` };
  }

  it("cliente solicita devolución de 1 unidad", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/cliente-portal/pedidos/${pedidoFolio}/devoluciones`,
      headers: clienteAuth(),
      payload: {
        motivo: "defectuoso",
        descripcion: "Llegó con un defecto",
        items: [{ varianteId, nombre: "Playera GaesSoft", cantidad: 1 }],
      },
    });
    expect(res.statusCode).toBe(201);
    solicitudId = res.json().id;
    expect(res.json().estado).toBe("solicitada");
  });

  it("no permite una segunda solicitud abierta para el mismo pedido", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/cliente-portal/pedidos/${pedidoFolio}/devoluciones`,
      headers: clienteAuth(),
      payload: {
        motivo: "otro",
        items: [{ varianteId, nombre: "Playera GaesSoft", cantidad: 1 }],
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("admin ve la solicitud en su bandeja", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/devoluciones-online?estado=solicitada",
      headers: auth(ownerToken),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ id: string }>;
    expect(items.some((s) => s.id === solicitudId)).toBe(true);
  });

  it("aprobar repone stock (+1), genera devolución y marca pedido reembolsado", async () => {
    const antes = await stock();
    const res = await app.inject({
      method: "POST",
      url: `/t/devoluciones-online/${solicitudId}/aprobar`,
      headers: auth(ownerToken),
      payload: { metodoReembolso: "tarjeta_misma" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().devolucionId).toBeTruthy();
    expect(await stock()).toBe(antes + 1);

    const det = await app.inject({
      method: "GET",
      url: `/t/pedidos-ecommerce/${pedidoId}`,
      headers: auth(ownerToken),
    });
    expect(det.json().statusPago).toBe("reembolsado");
  });

  it("aprobar una solicitud ya resuelta → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/devoluciones-online/${solicitudId}/aprobar`,
      headers: auth(ownerToken),
      payload: { metodoReembolso: "tarjeta_misma" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("mensajería: cliente escribe, admin ve y responde, cliente ve el hilo", async () => {
    const env = await app.inject({
      method: "POST",
      url: `/cliente-portal/pedidos/${pedidoFolio}/mensajes`,
      headers: clienteAuth(),
      payload: { cuerpo: "¿Cuándo llega mi reembolso?" },
    });
    expect(env.statusCode).toBe(201);

    const adminList = await app.inject({
      method: "GET",
      url: `/t/pedidos-ecommerce/${pedidoId}/mensajes`,
      headers: auth(ownerToken),
    });
    const msgs = adminList.json() as Array<{ autorTipo: string; cuerpo: string }>;
    expect(msgs.some((m) => m.autorTipo === "cliente")).toBe(true);

    const resp = await app.inject({
      method: "POST",
      url: `/t/pedidos-ecommerce/${pedidoId}/mensajes`,
      headers: auth(ownerToken),
      payload: { cuerpo: "En 3-5 días hábiles." },
    });
    expect(resp.statusCode).toBe(200);

    const clienteList = await app.inject({
      method: "GET",
      url: `/cliente-portal/pedidos/${pedidoFolio}/mensajes`,
      headers: clienteAuth(),
    });
    const hilo = clienteList.json() as Array<{ autorTipo: string }>;
    expect(hilo.filter((m) => m.autorTipo === "empleado").length).toBeGreaterThanOrEqual(1);
    expect(hilo.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Tanda 3: cancelar compra + Q&A público (configurable)", () => {
  let clienteToken: string;
  let clienteId: string;

  async function nuevoPedido(estado: string, statusPago = "pendiente"): Promise<string> {
    const p = await getTenantClient(TENANT_SLUG).pedidoEcommerce.create({
      data: {
        folioPublico: `GP-T3${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 99)}`,
        clienteId,
        emailComprador: "tanda3@cliente.mx",
        subtotal: "100",
        total: "100",
        moneda: "MXN",
        metodoEnvio: "paqueteria",
        statusPedido: estado as never,
        statusPago: statusPago as never,
      },
    });
    return p.folioPublico;
  }

  beforeAll(async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/auth/cliente/registro",
      payload: {
        tenantSlug: TENANT_SLUG,
        nombre: "Tanda Tres",
        email: "tanda3@cliente.mx",
        password: "Cliente!2026",
      },
    });
    clienteToken = reg.json().accessToken;
    clienteId = reg.json().cliente.id;
  });

  function cAuth() {
    return { authorization: `Bearer ${clienteToken}` };
  }

  it("cliente cancela un pedido aún no enviado", async () => {
    const folio = await nuevoPedido("preparando");
    const res = await app.inject({
      method: "POST",
      url: `/cliente-portal/pedidos/${folio}/cancelar`,
      headers: cAuth(),
      payload: { motivo: "Ya no lo necesito" },
    });
    expect(res.statusCode).toBe(200);
    const det = await app.inject({
      method: "GET",
      url: "/t/pedidos-ecommerce?statusPedido=cancelado",
      headers: auth(ownerToken),
    });
    const folios = (det.json().items as Array<{ folioPublico: string }>).map((p) => p.folioPublico);
    expect(folios).toContain(folio);
  });

  it("no se puede cancelar un pedido ya enviado → 409", async () => {
    const folio = await nuevoPedido("enviado");
    const res = await app.inject({
      method: "POST",
      url: `/cliente-portal/pedidos/${folio}/cancelar`,
      headers: cAuth(),
      payload: { motivo: "tarde" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("Q&A: cliente pregunta → owner responde → aparece pública en el producto", async () => {
    const ask = await app.inject({
      method: "POST",
      url: `/cliente-portal/productos/${productoPublicadoId}/preguntas`,
      headers: cAuth(),
      payload: { pregunta: "¿De qué material es la playera?" },
    });
    expect(ask.statusCode).toBe(201);

    const pend = await app.inject({
      method: "GET",
      url: "/t/preguntas?estado=pendiente",
      headers: auth(ownerToken),
    });
    const mia = (pend.json() as Array<{ id: string; pregunta: string }>).find((p) =>
      p.pregunta.includes("material"),
    );
    expect(mia).toBeDefined();

    const resp = await app.inject({
      method: "POST",
      url: `/t/preguntas/${mia!.id}/responder`,
      headers: auth(ownerToken),
      payload: { respuesta: "100% algodón." },
    });
    expect(resp.statusCode).toBe(200);

    const det = await app.inject({
      method: "GET",
      url: "/t/tienda/catalogo/playera-gaessoft",
      headers: auth(ownerToken),
    });
    const preguntas = det.json().preguntas as Array<{ pregunta: string; respuesta: string }>;
    expect(preguntas.some((p) => p.respuesta === "100% algodón.")).toBe(true);
  });

  it("config: con preguntas deshabilitadas → 403", async () => {
    await app.inject({
      method: "PUT",
      url: "/t/ecommerce/config",
      headers: auth(ownerToken),
      payload: { subdominio: "demo-tienda", nombre: "Mi Tienda Demo", preguntasPublicas: false },
    });
    const ask = await app.inject({
      method: "POST",
      url: `/cliente-portal/productos/${productoPublicadoId}/preguntas`,
      headers: cAuth(),
      payload: { pregunta: "¿Tienen otra talla?" },
    });
    expect(ask.statusCode).toBe(403);
    // restaurar
    await app.inject({
      method: "PUT",
      url: "/t/ecommerce/config",
      headers: auth(ownerToken),
      payload: { subdominio: "demo-tienda", nombre: "Mi Tienda Demo", preguntasPublicas: true },
    });
  });
});
