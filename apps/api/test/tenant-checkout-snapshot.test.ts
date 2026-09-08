import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import { MockFacturamaClient } from "@gaespos/fiscal";
import { MockPaymentProvider } from "@gaespos/pagos";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { procesarWebhookPago } from "../src/modules/tenant/checkout/service.js";
import { procesarDevolucion } from "../src/modules/tenant/devoluciones/service.js";
import { cancelarVenta } from "../src/modules/tenant/ventas/service.js";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT = "test-checkout-snapshot";
let app: FastifyInstance;
let token: string;
let cashierToken: string;
let userId: string;
let branchId: string;
let variantId: string;
let productId: string;
let shippingId: string;
let shippingProductId: string;
let tariffId: string;
let calls = 0;
class CountingProvider extends MockPaymentProvider {
  override async crearIntent(input: Parameters<MockPaymentProvider["crearIntent"]>[0]) {
    calls++;
    return super.crearIntent(input);
  }
}
const prisma = () => getTenantClient(TENANT);
const auth = (value = token) => ({ authorization: `Bearer ${value}` });
const config = (envioVarianteId: string | null) =>
  app.inject({
    method: "PUT",
    url: "/t/ecommerce/config",
    headers: auth(),
    payload: { subdominio: TENANT, nombre: "Snapshot Shop", envioVarianteId },
  });
async function begin(
  shipping = false,
  coupon?: string,
  items = [{ varianteId: variantId, cantidad: 1 }],
) {
  const cart = await app.inject({
    method: "POST",
    url: "/t/tienda",
    headers: auth(),
    payload: {
      sessionIdAnonimo: randomUUID(),
      canal: "web",
      items,
      ...(coupon ? { cuponCodigo: coupon } : {}),
    },
  });
  expect(cart.statusCode).toBe(201);
  const response = await app.inject({
    method: "POST",
    url: "/t/checkout/iniciar",
    headers: auth(),
    payload: {
      carritoId: cart.json().id,
      idempotencyKey: randomUUID(),
      emailComprador: "buyer@test.local",
      proveedorPago: "mock",
      metodoPago: "tarjeta",
      ...(shipping
        ? {
            metodoEnvio: "paqueteria",
            tarifaEnvioId: tariffId,
            direccionEnvio: {
              nombre: "Buyer",
              calle: "Uno",
              ciudad: "Guadalajara",
              estado: "Jalisco",
              cp: "44100",
            },
          }
        : { metodoEnvio: "click_collect", sucursalPickupId: branchId }),
    },
  });
  return response;
}
async function confirm(response: Awaited<ReturnType<typeof begin>>) {
  expect(response.statusCode).toBe(201);
  const result = await procesarWebhookPago(prisma(), userId, {
    intentId: response.json().intentId,
    montoCentavos: response.json().montoCentavos,
    status: "confirmado",
  });
  return prisma().venta.findUniqueOrThrow({
    where: { id: result.ventaIdGenerada ?? "missing" },
    include: { lineas: true, pagos: true },
  });
}
beforeAll(async () => {
  const provider = new CountingProvider();
  app = await buildTestApp({}, { pagoProviderFactory: () => provider });
  await createTestTenant(TENANT);
  for (const role of ["dueno", "cajero"]) {
    const email = `${role}-snapshot@test.local`;
    await createTenantUser(TENANT, { email, password: "ChangeMe!2026", rolCodigo: role });
    const session = await loginTenantUser(app, TENANT, email, "ChangeMe!2026");
    if (role === "dueno") {
      token = session.accessToken;
      userId = session.userId;
    } else cashierToken = session.accessToken;
  }
  branchId = (await prisma().sucursal.findFirstOrThrow()).id;
  for (const shipping of [false, true]) {
    const product = await app.inject({
      method: "POST",
      url: "/t/productos",
      headers: auth(),
      payload: {
        skuPadre: shipping ? "SHIP-SNAP" : "ITEM-SNAP",
        nombre: shipping ? "Envío contratado" : "Mercancía original",
        tipoVenta: shipping ? "servicio" : "unidad",
        precioBase: shipping ? "999" : "100",
        aplicaIva: true,
        tasaIva: "16",
      },
    });
    expect(product.statusCode).toBe(201);
    if (shipping) {
      shippingId = product.json().variantes[0].id;
      shippingProductId = product.json().id;
    } else {
      variantId = product.json().variantes[0].id;
      productId = product.json().id;
    }
  }
  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: auth(),
    payload: {
      varianteId: variantId,
      sucursalId: branchId,
      tipo: "ajuste_positivo",
      cantidad: "100",
      motivo: "Snapshot fixture",
    },
  });
  const zone = await app.inject({
    method: "POST",
    url: "/t/envios/zonas",
    headers: auth(),
    payload: { nombre: "Jalisco", estadosIncluidos: ["Jalisco"] },
  });
  expect(zone.statusCode).toBe(201);
  const tariff = await app.inject({
    method: "POST",
    url: "/t/envios/tarifas",
    headers: auth(),
    payload: {
      zonaEnvioId: zone.json().id,
      paqueteria: "estafeta",
      nombrePublico: "Envío",
      tipoCalculo: "fija",
      montoFijo: 20,
    },
  });
  expect(tariff.statusCode).toBe(201);
  tariffId = tariff.json().id;
  await prisma().cuponTenant.create({
    data: { codigo: "SNAP10", nombre: "Diez", tipo: "porcentaje", valor: "10", usosTotal: 20 },
  });
  expect((await config(shippingId)).statusCode).toBe(201);
});
afterAll(async () => {
  if (app) await app.close();
});

describe("frozen checkout agreement", () => {
  it("preserves price, coupon, tax and product identity after catalog changes and includes shipping", async () => {
    const response = await begin(true, "SNAP10");
    expect(response.statusCode).toBe(201);
    expect(response.json().total).toBe("110.00");
    const order = await prisma().pedidoEcommerce.findUniqueOrThrow({
      where: { id: response.json().pedidoId },
    });
    const originalSnapshot = order.snapshotComercial as { version: number; ivaTotal: string };
    expect(originalSnapshot.version).toBe(1);
    const stockBefore = (
      await prisma().inventarioSucursal.findFirstOrThrow({
        where: { varianteId: variantId, sucursalId: branchId },
      })
    ).stockActual;
    try {
      await prisma().productoVariante.update({
        where: { id: variantId },
        data: { precioBase: "999" },
      });
      await prisma().producto.update({
        where: { id: productId },
        data: { nombre: "Nombre cambiado", tasaIva: "8", tipoVenta: "servicio" },
      });
      await prisma().producto.update({
        where: { id: shippingProductId },
        data: { tipoVenta: "unidad", tasaIva: "8" },
      });
      const sale = await confirm(response);
      expect(sale.total.toFixed(2)).toBe("110.00");
      expect(sale.totalCobrado.toFixed(2)).toBe("110.00");
      expect(sale.cambioDado.toString()).toBe("0");
      expect(sale.descuentoTotal.toFixed(2)).toBe("10.00");
      expect(sale.pagos.reduce((sum, payment) => sum + Number(payment.monto), 0)).toBe(110);
      expect(sale.lineas.reduce((sum, line) => sum + Number(line.totalLinea), 0)).toBe(110);
      expect(sale.ivaTotal.toString()).toBe(Number(originalSnapshot.ivaTotal).toString());
      expect(
        sale.lineas.find((line) => line.varianteId === variantId)?.snapshotProducto,
      ).toMatchObject({ nombreProducto: "Mercancía original", tasaIva: "16", tipoVenta: "unidad" });
      expect(
        sale.lineas.find((line) => line.varianteId === shippingId)?.totalLinea.toFixed(2),
      ).toBe("20.00");
      expect(
        (await prisma().cuponTenant.findUniqueOrThrow({ where: { codigo: "SNAP10" } }))
          .usosActuales,
      ).toBe(1);
      expect(
        (
          await prisma().inventarioSucursal.findFirstOrThrow({
            where: { varianteId: variantId, sucursalId: branchId },
          })
        ).stockActual.toNumber(),
      ).toBe(stockBefore.toNumber() - 1);
      expect(await prisma().inventarioMovimiento.count({ where: { varianteId: shippingId } })).toBe(
        0,
      );
    } finally {
      await prisma().productoVariante.update({
        where: { id: variantId },
        data: { precioBase: "100" },
      });
      await prisma().producto.update({
        where: { id: productId },
        data: { nombre: "Mercancía original", tasaIva: "16", tipoVenta: "unidad" },
      });
      await prisma().producto.update({
        where: { id: shippingProductId },
        data: { tipoVenta: "servicio", tasaIva: "16" },
      });
    }
  });

  it("blocks paid shipping before calling the provider if its service is unconfigured", async () => {
    expect((await config(null)).statusCode).toBe(200);
    const before = calls;
    const usesBefore = (
      await prisma().cuponTenant.findUniqueOrThrow({ where: { codigo: "SNAP10" } })
    ).usosActuales;
    try {
      expect((await begin(true, "SNAP10")).statusCode).toBe(422);
      expect(calls).toBe(before);
      expect(
        (await prisma().cuponTenant.findUniqueOrThrow({ where: { codigo: "SNAP10" } }))
          .usosActuales,
      ).toBe(usesBefore);
      expect((await begin(false)).statusCode).toBe(201);
    } finally {
      await config(shippingId);
    }
  });

  it("service lookup and configuration reject merchandise, inactive and unauthorized selections", async () => {
    const lookup = await app.inject({
      method: "GET",
      url: "/t/ecommerce/servicios-envio?q=SHIP",
      headers: auth(),
    });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json().map((row: { id: string }) => row.id)).toEqual([shippingId]);
    expect((await config(variantId)).statusCode).toBe(422);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/t/ecommerce/servicios-envio",
          headers: auth(cashierToken),
        })
      ).statusCode,
    ).toBe(403);
    await prisma().productoVariante.update({
      where: { id: shippingId },
      data: { isActive: false },
    });
    try {
      expect((await config(shippingId)).statusCode).toBe(422);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/t/ecommerce/servicios-envio/${shippingId}`,
            headers: auth(),
          })
        ).statusCode,
      ).toBe(404);
      const before = calls;
      expect((await begin(true)).statusCode).toBe(422);
      expect(calls).toBe(before);
    } finally {
      await prisma().productoVariante.update({
        where: { id: shippingId },
        data: { isActive: true },
      });
    }
  });

  it("prorates cents exactly across distinct lines", async () => {
    await prisma().cuponTenant.create({
      data: { codigo: "ONECENT", nombre: "Centavo", tipo: "monto_fijo", valor: "0.01" },
    });
    const response = await begin(false, "ONECENT", [
      { varianteId: variantId, cantidad: 1 },
      { varianteId: shippingId, cantidad: 1 },
    ]);
    const sale = await confirm(response);
    expect(sale.total.toFixed(2)).toBe("1098.99");
    expect(
      sale.lineas.reduce((sum, line) => sum + Math.round(Number(line.totalLinea) * 100), 0),
    ).toBe(109899);
    expect(sale.descuentoTotal.toFixed(2)).toBe("0.01");
  });

  it("does not create shipping stock when cancelling or returning the service", async () => {
    const cancelled = await confirm(await begin(true));
    await cancelarVenta(prisma(), userId, cancelled.id, "Cancelación de prueba");
    expect(await prisma().inventarioMovimiento.count({ where: { varianteId: shippingId } })).toBe(
      0,
    );
    const returned = await confirm(await begin(true));
    const serviceLine = returned.lineas.find((line) => line.varianteId === shippingId);
    expect(serviceLine).toBeDefined();
    const refund = await procesarDevolucion(
      prisma(),
      new MockFacturamaClient(),
      userId,
      returned.id,
      {
        motivo: "otro",
        metodoReembolso: "transferencia",
        lineas: [
          { ventaLineaId: serviceLine?.id ?? "missing", cantidadDevuelta: "1", reponeStock: true },
        ],
      },
    );
    expect(Number(refund.totalDevuelto)).toBe(20);
    expect(await prisma().inventarioMovimiento.count({ where: { varianteId: shippingId } })).toBe(
      0,
    );
  });

  it("refuses historical orders without a snapshot instead of recalculating their price", async () => {
    const response = await begin(false);
    expect(response.statusCode).toBe(201);
    await prisma()
      .$executeRaw`UPDATE pedidos_ecommerce SET snapshot_comercial = NULL WHERE id = ${response.json().pedidoId}`;
    const before = await prisma().venta.count();
    await expect(confirm(response)).rejects.toMatchObject({
      statusCode: 409,
      extra: { code: "COMMERCIAL_RECONCILIATION_REQUIRED" },
    });
    expect(await prisma().venta.count()).toBe(before);
  });
});
