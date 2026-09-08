import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import { MockEmailProvider } from "@gaespos/email";
import { type CrearIntentInput, MockPaymentProvider } from "@gaespos/pagos";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calcularCarrito } from "../src/modules/tenant/carrito/service.js";
import { procesarWebhookPago } from "../src/modules/tenant/checkout/service.js";
import { buildTestApp, createTenantUser, createTestTenant } from "./helpers.js";

const A = "test-mobile-checkout-a";
const B = "test-mobile-checkout-b";
const base = "/cliente-portal/comercio";
let app: FastifyInstance;
let token: string;
let otherToken: string;
let foreignToken: string;
let clienteId: string;
let actorId: string;
let variant: string;
let branch: string;
let rate: string;
let configId: string;
let calls = 0;
let ambiguous = false;
const captures: CrearIntentInput[] = [];
class FakeConekta extends MockPaymentProvider {
  override async crearIntent(input: CrearIntentInput) {
    calls++;
    captures.push(input);
    const result = await super.crearIntent(input);
    if (ambiguous) throw new Error("accepted-but-timeout");
    return result;
  }
}
const provider = new FakeConekta();
const auth = (value = token) => ({ authorization: `Bearer ${value}` });
const post = (path: string, payload: Record<string, unknown>, value = token) =>
  app.inject({ method: "POST", url: `${base}${path}`, headers: auth(value), payload });
const get = (path: string, value = token) =>
  app.inject({ method: "GET", url: `${base}${path}`, headers: auth(value) });
async function cart() {
  const client = getTenantClient(A);
  const calc = await calcularCarrito(client, actorId, [{ varianteId: variant, cantidad: 1 }]);
  return (
    await client.carritoEcommerce.create({
      data: {
        clienteId,
        canal: "mobile",
        items: calc.items,
        subtotal: calc.subtotal,
        total: calc.total,
      },
    })
  ).id;
}
async function prepared() {
  const carritoId = await cart();
  const res = await post("/checkout/preparar", { carritoId });
  expect(res.statusCode).toBe(200);
  return {
    carritoId,
    idempotencyKey: res.json().idempotencyKey as string,
    metodoPago: "oxxo",
    metodoEnvio: "click_collect",
    sucursalPickupId: branch,
  };
}

beforeAll(async () => {
  app = await buildTestApp(
    {},
    { pagoProviderFactory: () => provider, emailProviderFactory: () => new MockEmailProvider() },
  );
  await createTestTenant(A);
  await createTestTenant(B);
  actorId = (
    await createTenantUser(A, {
      email: "mobile-system@example.test",
      password: "Test!2026Pass",
      rolCodigo: "dueno",
    })
  ).id;
  const client = getTenantClient(A);
  const buyer = await client.cliente.create({
    data: { nombre: "Comprador", emailPrincipal: "verified@example.test" },
  });
  clienteId = buyer.id;
  const other = await client.cliente.create({
    data: { nombre: "Otro", emailPrincipal: "other@example.test" },
  });
  const foreign = await getTenantClient(B).cliente.create({
    data: { nombre: "Ajeno", emailPrincipal: "foreign@example.test" },
  });
  token = app.jwt.sign({
    kind: "cliente",
    sub: clienteId,
    email: "verified@example.test",
    tenantSlug: A,
  });
  otherToken = app.jwt.sign({
    kind: "cliente",
    sub: other.id,
    email: "other@example.test",
    tenantSlug: A,
  });
  foreignToken = app.jwt.sign({
    kind: "cliente",
    sub: foreign.id,
    email: "foreign@example.test",
    tenantSlug: B,
  });
  branch = (await client.sucursal.findFirstOrThrow()).id;
  const product = await client.producto.create({
    data: {
      nombre: "Móvil",
      skuPadre: "MOBILEPAY",
      aplicaIva: false,
      variantes: { create: { sku: "MOBILEPAY", precioBase: "100" } },
    },
    include: { variantes: true },
  });
  const v = product.variantes[0];
  if (!v) throw new Error("Fixture sin variante");
  variant = v.id;
  await client.productoPublicado.create({
    data: { productoId: product.id, slugSeo: "mobile-pay", tituloPublico: "Móvil" },
  });
  await client.inventarioSucursal.create({
    data: { varianteId: variant, sucursalId: branch, stockActual: "100" },
  });
  const shipping = await client.producto.create({
    data: {
      nombre: "Servicio de envío",
      skuPadre: "MOBILESHIPPING",
      tipoVenta: "servicio",
      aplicaIva: false,
      variantes: { create: { sku: "MOBILESHIPPING", precioBase: "75" } },
    },
    include: { variantes: true },
  });
  const shippingVariant = shipping.variantes[0];
  if (!shippingVariant) throw new Error("Fixture sin servicio de envío");
  configId = (
    await client.configTiendaEcommerce.create({
      data: {
        subdominio: "mobile-pay",
        activa: true,
        nombre: "Tienda móvil",
        pasarelaPagoProvider: "conekta",
        envioVarianteId: shippingVariant.id,
      },
    })
  ).id;
  await client.configPickupSucursal.create({ data: { sucursalId: branch, activa: true } });
  const zone = await client.zonaEnvio.create({ data: { nombre: "Zona", cpsIncluidos: ["06000"] } });
  rate = (
    await client.tarifaEnvio.create({
      data: {
        zonaEnvioId: zone.id,
        paqueteria: "propio",
        nombrePublico: "Envío local",
        montoFijo: "75",
      },
    })
  ).id;
});
afterAll(async () => {
  await app?.close();
});

describe("checkout móvil autenticado sin proveedores reales", () => {
  it("config anuncia solo Conekta OXXO/SPEI; sin configuración no ofrece métodos", async () => {
    expect((await get("/pago-config")).json().metodos).toEqual(["oxxo", "spei"]);
    await getTenantClient(A).configTiendaEcommerce.update({
      where: { id: configId },
      data: { pasarelaPagoProvider: "stripe" },
    });
    expect((await get("/pago-config")).json().metodos).toEqual([]);
    const input = await prepared();
    const before = calls;
    expect((await post("/checkout", input)).statusCode).toBe(503);
    expect(calls).toBe(before);
    await getTenantClient(A).configTiendaEcommerce.update({
      where: { id: configId },
      data: { pasarelaPagoProvider: "conekta" },
    });
  });
  it("prepara UUID estable sin contactar proveedor y rechaza carro ajeno", async () => {
    const input = await prepared();
    const before = calls;
    expect(
      (await post("/checkout/preparar", { carritoId: input.carritoId })).json().idempotencyKey,
    ).toBe(input.idempotencyKey);
    expect(
      (await post("/checkout/preparar", { carritoId: input.carritoId }, otherToken)).statusCode,
    ).toBe(404);
    expect(calls).toBe(before);
  });
  it("cotiza subtotal servidor y no acepta subtotal/tenant externos", async () => {
    const carritoId = await cart();
    const quote = await get(`/envios?carritoId=${carritoId}&cp=06000&estado=CDMX`);
    expect(quote.statusCode).toBe(200);
    expect(quote.json().opcionesEnvio[0].costo).toBe("75.00");
    expect((await get(`/envios?carritoId=${carritoId}&subtotal=0`)).statusCode).toBe(400);
    expect((await get(`/envios?carritoId=${carritoId}`, otherToken)).statusCode).toBe(404);
  });
  it("pago OXXO pendiente devuelve referencia y reintento no duplica proveedor", async () => {
    const input = await prepared();
    const before = calls;
    const first = await post("/checkout", input);
    expect(first.statusCode).toBe(200);
    expect(first.json().intentStatus).not.toBe("confirmado");
    expect(typeof first.json().referenciaPago).toBe("string");
    const again = await post("/checkout", input);
    expect(again.json()).toEqual(first.json());
    expect(calls).toBe(before + 1);
    expect(captures.at(-1)?.emailComprador).toBe("verified@example.test");
    for (const field of [
      "clientSecret",
      "intentId",
      "pedidoId",
      "snapshotComercial",
      "requestedBy",
    ])
      expect(first.body).not.toContain(`"${field}"`);
    const last = await get("/checkout/intento");
    expect(last.json().idempotencyKey).toBe(input.idempotencyKey);
    for (const t of [otherToken, foreignToken])
      expect((await get(`/checkout/intentos/${input.idempotencyKey}`, t)).statusCode).toBe(404);
  });
  it("confirmación webhook posterior cambia recuperación a confirmado con una sola venta", async () => {
    const input = await prepared();
    await post("/checkout", input);
    const client = getTenantClient(A);
    const order = await client.pedidoEcommerce.findFirstOrThrow({
      where: { carritoOrigenId: input.carritoId },
    });
    if (!order.paymentIntentId) throw new Error("Fixture sin intent");
    const simulated = provider.simularWebhook(order.paymentIntentId);
    const event = provider.parseWebhook(simulated.payload, simulated.signature);
    await procesarWebhookPago(client, actorId, event, new MockEmailProvider());
    const before = calls;
    const response = await get(`/checkout/intentos/${input.idempotencyKey}`);
    expect(response.json().intentStatus).toBe("confirmado");
    expect((await post("/checkout", input)).json().intentStatus).toBe("confirmado");
    expect(calls).toBe(before);
    const saved = await client.pedidoEcommerce.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.ventaIdGenerada).toBeTruthy();
    expect(saved.clienteId).toBe(clienteId);
  });
  it("SPEI con envío calcula tarifa servidor dentro del monto", async () => {
    const input = await prepared();
    const response = await post("/checkout", {
      ...input,
      metodoPago: "spei",
      metodoEnvio: "paqueteria",
      tarifaEnvioId: rate,
      direccionEnvio: {
        nombre: "Comprador",
        calle: "Prueba",
        ciudad: "CDMX",
        estado: "CDMX",
        cp: "06000",
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(Number(response.json().total)).toBe(175);
    expect(captures.at(-1)?.montoCentavos).toBe(17500);
  });
  it("rechaza tarifa sin cobertura y pickup inválido antes de proveedor", async () => {
    const input = await prepared();
    const before = calls;
    expect((await post("/checkout", { ...input, sucursalPickupId: "missing" })).statusCode).toBe(
      422,
    );
    expect(
      (
        await post("/checkout", {
          ...input,
          metodoEnvio: "paqueteria",
          tarifaEnvioId: rate,
          direccionEnvio: {
            nombre: "Comprador",
            calle: "Prueba",
            ciudad: "Otro",
            estado: "Otro",
            cp: "99999",
          },
        })
      ).statusCode,
    ).toBe(422);
    expect(calls).toBe(before);
  });
  it("rechaza claves inventadas, tarjeta, proveedor y correo suministrados", async () => {
    const input = await prepared();
    const before = calls;
    expect((await post("/checkout", { ...input, idempotencyKey: randomUUID() })).statusCode).toBe(
      409,
    );
    for (const extra of [
      { metodoPago: "tarjeta" },
      { proveedorPago: "mock" },
      { emailComprador: "spoof@example.test" },
      { clienteId: "forged" },
      { tenantSlug: B },
      { total: "0" },
    ])
      expect((await post("/checkout", { ...input, ...extra })).statusCode).toBe(400);
    expect(calls).toBe(before);
  });
  it("sin actor activo rechaza antes de iniciar pago", async () => {
    const input = await prepared();
    const before = calls;
    const client = getTenantClient(A);
    await client.usuario.updateMany({ data: { isActive: false } });
    expect((await post("/checkout", input)).statusCode).toBe(503);
    expect(calls).toBe(before);
    await client.usuario.update({ where: { id: actorId }, data: { isActive: true } });
  });
  it("timeout ambiguo se conserva y no vuelve a contactar proveedor", async () => {
    const input = await prepared();
    const before = calls;
    ambiguous = true;
    try {
      const response = await post("/checkout", input);
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe("CHECKOUT_UNCERTAIN");
      expect((await post("/checkout", input)).json().code).toBe("CHECKOUT_UNCERTAIN");
      expect(calls).toBe(before + 1);
    } finally {
      ambiguous = false;
    }
  });
  it("tienda cerrada bloquea compras nuevas y conserva recovery existente", async () => {
    const existing = await prepared();
    expect((await post("/checkout", existing)).statusCode).toBe(200);
    const fresh = await prepared();
    const client = getTenantClient(A);
    const before = calls;
    await client.configTiendaEcommerce.update({ where: { id: configId }, data: { activa: false } });
    try {
      expect((await get("/pago-config")).json().metodos).toEqual([]);
      expect((await post("/checkout/preparar", { carritoId: fresh.carritoId })).statusCode).toBe(
        503,
      );
      expect((await post("/checkout", fresh)).statusCode).toBe(503);
      expect((await get(`/checkout/intentos/${existing.idempotencyKey}`)).statusCode).toBe(200);
      expect((await post("/checkout", existing)).statusCode).toBe(200);
      expect(calls).toBe(before);
    } finally {
      await client.configTiendaEcommerce.update({
        where: { id: configId },
        data: { activa: true },
      });
    }
  });
  it.each(["publicacion", "visibilidad", "variante"])(
    "revalida %s retirada después de preparar el carrito",
    async (kind) => {
      const input = await prepared();
      const client = getTenantClient(A);
      const { productoId } = await client.productoVariante.findUniqueOrThrow({
        where: { id: variant },
      });
      const set = async (active: boolean) => {
        if (kind === "publicacion")
          await client.productoPublicado.update({
            where: { productoId },
            data: { isPublicado: active },
          });
        else if (kind === "visibilidad")
          await client.producto.update({
            where: { id: productoId },
            data: { isVisiblePublico: active },
          });
        else
          await client.productoVariante.update({
            where: { id: variant },
            data: { isActive: active },
          });
      };
      const before = calls;
      await set(false);
      try {
        const response = await post("/checkout", input);
        expect(response.statusCode, response.body).toBe(422);
        expect(calls).toBe(before);
        expect(
          await client.pedidoEcommerce.count({ where: { carritoOrigenId: input.carritoId } }),
        ).toBe(0);
      } finally {
        await set(true);
      }
    },
  );
  it("limita checkout por cliente sin bloquear otro cliente del mismo IP", async () => {
    const before = calls;
    for (let i = 0; i < 31; i++) {
      const response = await post("/checkout", {}, otherToken);
      if (i === 30) expect(response.statusCode, response.body).toBe(429);
    }
    expect((await post("/checkout", {}, foreignToken)).statusCode).toBe(400);
    expect(calls).toBe(before);
  });
  it("anónimo y empleado no acceden checkout móvil", async () => {
    expect((await app.inject({ method: "GET", url: `${base}/pago-config` })).statusCode).toBe(401);
    const employee = app.jwt.sign({
      kind: "tenant",
      sub: actorId,
      email: "system@example.test",
      tenantSlug: A,
      permissions: ["*"],
    });
    expect((await get("/checkout/intento", employee)).statusCode).toBe(401);
  });
});
