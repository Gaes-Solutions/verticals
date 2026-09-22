import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import { MockPaymentProvider } from "@gaespos/pagos";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT = "test-pago-mostrador";
let app: FastifyInstance;
let token: string;
let branchId: string;
let variantId: string;
let provider: MockPaymentProvider;
const auth = () => ({ authorization: `Bearer ${token}` });
const prisma = () => getTenantClient(TENANT);
const stock = async () =>
  (
    await prisma().inventarioSucursal.findFirstOrThrow({
      where: { varianteId: variantId, sucursalId: branchId },
    })
  ).stockActual.toString();

async function pedir(
  metodoPago: "cod" | "tarjeta",
  metodoEnvio: "click_collect" | "paqueteria" = "click_collect",
) {
  const cart = await app.inject({
    method: "POST",
    url: "/t/tienda",
    headers: auth(),
    payload: {
      sessionIdAnonimo: randomUUID(),
      canal: "web",
      items: [{ varianteId: variantId, cantidad: 1 }],
    },
  });
  expect(cart.statusCode, cart.body).toBe(201);
  return app.inject({
    method: "POST",
    url: "/t/checkout/iniciar",
    headers: auth(),
    payload: {
      carritoId: cart.json().id,
      idempotencyKey: randomUUID(),
      emailComprador: "compra@test.local",
      proveedorPago: "mock",
      metodoPago,
      metodoEnvio,
      ...(metodoEnvio === "click_collect" ? { sucursalPickupId: branchId } : {}),
      ...(metodoEnvio === "paqueteria"
        ? {
            direccionEnvio: {
              nombre: "Ana",
              calle: "Reforma 1",
              ciudad: "Morelia",
              estado: "Michoacán",
              cp: "58000",
            },
          }
        : {}),
    },
  });
}

const cobrar = (pedidoId: string, payload: Record<string, unknown> = { metodo: "efectivo" }) =>
  app.inject({
    method: "POST",
    url: `/t/pedidos-ecommerce/${pedidoId}/pago-recibido`,
    headers: auth(),
    payload,
  });

beforeAll(async () => {
  provider = new MockPaymentProvider();
  app = await buildTestApp({}, { pagoProviderFactory: () => provider });
  await createTestTenant(TENANT);
  const email = "mostrador@test.local";
  await createTenantUser(TENANT, { email, password: "ChangeMe!2026", rolCodigo: "dueno" });
  token = (await loginTenantUser(app, TENANT, email, "ChangeMe!2026")).accessToken;
  branchId = (await prisma().sucursal.findFirstOrThrow()).id;
  const product = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(),
    payload: { skuPadre: "MOST-1", nombre: "Globo mostrador", precioBase: "100" },
  });
  expect(product.statusCode, product.body).toBe(201);
  variantId = product.json().variantes[0].id;
  const inventory = await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: auth(),
    payload: {
      varianteId: variantId,
      sucursalId: branchId,
      tipo: "ajuste_positivo",
      cantidad: "20",
      motivo: "Inicial",
    },
  });
  expect(inventory.statusCode).toBe(201);
});

afterAll(async () => {
  if (app) await app.close();
});

describe("pedido que se paga al recoger", () => {
  it("se registra sin pasar por el proveedor de pagos y queda esperando el cobro", async () => {
    const espia = vi.spyOn(provider, "crearIntent");
    const res = await pedir("cod");
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().intentStatus).toBe("pendiente");
    expect(espia).not.toHaveBeenCalled();
    espia.mockRestore();

    const pedido = await prisma().pedidoEcommerce.findUniqueOrThrow({
      where: { id: res.json().pedidoId },
    });
    expect(pedido.statusPago).toBe("pendiente");
    expect(pedido.paymentProvider).toBeNull();
    expect(pedido.ventaIdGenerada).toBeNull();
  });

  it("no permite pagar al recoger si el pedido se manda por paquetería", async () => {
    const res = await pedir("cod", "paqueteria");
    expect(res.statusCode, res.body).toBe(422);
    expect(res.json().message).toContain("se recogen en la tienda");
  });

  it("al cobrar en mostrador genera la venta, descuenta inventario y avisa al cliente", async () => {
    const pedido = (await pedir("cod")).json();
    const antes = await stock();
    const ventasAntes = await prisma().venta.count();

    const res = await cobrar(pedido.pedidoId, { metodo: "efectivo", referencia: "caja-1" });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().statusPago).toBe("pago_confirmado");
    expect(res.json().ventaIdGenerada).toBeTruthy();

    expect(await prisma().venta.count()).toBe(ventasAntes + 1);
    expect(Number(await stock())).toBe(Number(antes) - 1);
    const guardado = await prisma().pedidoEcommerce.findUniqueOrThrow({
      where: { id: pedido.pedidoId },
      include: { eventos: true },
    });
    expect(guardado.statusPedido).toBe("pago_confirmado");
    expect(guardado.eventos.some((e) => e.tipo === "pago_mostrador")).toBe(true);
    expect(guardado.eventos.find((e) => e.tipo === "pago_mostrador")?.descripcion).toContain(
      "caja-1",
    );
  });

  it("cobrar dos veces el mismo pedido no duplica la venta", async () => {
    const pedido = (await pedir("cod")).json();
    const primero = await cobrar(pedido.pedidoId);
    expect(primero.statusCode).toBe(200);
    const ventas = await prisma().venta.count();

    const segundo = await cobrar(pedido.pedidoId);
    expect(segundo.statusCode).toBe(200);
    expect(segundo.json().ventaIdGenerada).toBe(primero.json().ventaIdGenerada);
    expect(await prisma().venta.count()).toBe(ventas);
  });

  it("no cobra en mostrador un pedido que se paga con el proveedor", async () => {
    const pedido = (await pedir("tarjeta")).json();
    const res = await cobrar(pedido.pedidoId);
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain("no se cobra en mostrador");
  });
});
