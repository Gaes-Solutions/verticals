import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import { MockShippingProvider } from "@gaespos/paqueterias";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  dispatchPostPago,
  drainPostPago,
} from "../src/modules/tenant/checkout/post-pago-service.js";
import {
  claimEffect,
  enqueuePostPago,
  expireProcessingEffects,
} from "../src/modules/tenant/checkout/post-pago-store.js";
import { generarGuiaPedido } from "../src/modules/tenant/envios/guias-service.js";
import * as push from "../src/modules/tenant/push/service.js";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";
const TENANT = "test-post-pago";
const prisma = () => getTenantClient(TENANT);
let app: FastifyInstance;
let branch: string;
let user: string;
let customer: string;
let token: string;
const shipping = new MockShippingProvider();
const createGuia = vi.spyOn(shipping, "crearGuia");
const pushSend = vi.spyOn(push, "enviarPushCliente");
async function order() {
  const sale = await prisma().venta.create({
    data: {
      folio: randomUUID(),
      sucursalId: branch,
      usuarioId: user,
      estado: "cobrada",
      total: "100",
    },
  });
  return prisma().pedidoEcommerce.create({
    data: {
      folioPublico: randomUUID(),
      emailComprador: "test@local.test",
      clienteId: customer,
      subtotal: "100",
      total: "100",
      metodoEnvio: "paqueteria",
      statusPago: "pago_confirmado",
      ventaIdGenerada: sale.id,
      direccionEnvio: { nombre: "Test", cp: "44100", estado: "Jalisco", calle: "Demo" },
    },
  });
}
beforeAll(async () => {
  app = await buildTestApp({}, { shippingProviderFactory: () => shipping });
  await createTestTenant(TENANT);
  await createTenantUser(TENANT, {
    email: "owner@test.local",
    password: "ChangeMe!2026",
    rolCodigo: "dueno",
  });
  const login = await loginTenantUser(app, TENANT, "owner@test.local", "ChangeMe!2026");
  user = login.userId;
  token = login.accessToken;
  branch = (await prisma().sucursal.findFirstOrThrow()).id;
  await prisma().sucursal.update({
    where: { id: branch },
    data: { direccion: { cp: "44100", estado: "Jalisco", calle: "Origen" } },
  });
  customer = (await prisma().cliente.create({ data: { nombre: "Comprador" } })).id;
  await prisma().configTiendaEcommerce.create({
    data: {
      subdominio: TENANT,
      nombre: "Post pago",
      paqueteriaAutoGuia: true,
      paqueteriaProvider: "mock",
      pushHabilitado: true,
      pushEventos: ["pago_confirmado"],
    },
  });
  pushSend.mockResolvedValue({ enviadas: 1, eliminadas: 0, fallidas: 0 });
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app.close();
});
describe("durable post-payment effects", () => {
  it("simultaneous webhook/recovery/manual guide executes external effects once", async () => {
    const pedido = await order();
    const before = createGuia.mock.calls.length;
    const pushBefore = pushSend.mock.calls.length;
    await Promise.allSettled([
      generarGuiaPedido(prisma(), shipping, pedido.id),
      ...Array.from({ length: 8 }, () => dispatchPostPago(app, prisma(), pedido.id)),
    ]);
    await dispatchPostPago(app, prisma(), pedido.id);
    expect(createGuia.mock.calls.length - before).toBe(1);
    expect(pushSend.mock.calls.length - pushBefore).toBe(1);
    expect(
      await prisma().pedidoPostPagoEffect.count({ where: { pedidoId: pedido.id, status: "done" } }),
    ).toBe(2);
  });
  it("ambiguous provider failure remains uncertain across replay and worker", async () => {
    const pedido = await order();
    const before = createGuia.mock.calls.length;
    createGuia.mockRejectedValueOnce(new Error("timeout after accepting guide"));
    await dispatchPostPago(app, prisma(), pedido.id);
    await dispatchPostPago(app, prisma(), pedido.id);
    await drainPostPago(app, prisma());
    expect(createGuia.mock.calls.length - before).toBe(1);
    expect(
      await prisma().pedidoPostPagoEffect.findUnique({
        where: { pedidoId_tipo: { pedidoId: pedido.id, tipo: "guia" } },
      }),
    ).toMatchObject({ status: "uncertain", errorCode: "SHIPPING_RESULT_UNCERTAIN" });
  });
  it("retains provider response when local tracking persistence fails", async () => {
    const pedido = await order();
    await prisma()
      .$executeRaw`CREATE FUNCTION fail_shipping_save() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Simulated shipping persistence failure'; END; $$ LANGUAGE plpgsql`;
    await prisma()
      .$executeRaw`CREATE TRIGGER fail_shipping_save_trigger BEFORE INSERT ON envios_pedidos FOR EACH ROW EXECUTE FUNCTION fail_shipping_save()`;
    const before = createGuia.mock.calls.length;
    try {
      await dispatchPostPago(app, prisma(), pedido.id);
    } finally {
      await prisma().$executeRaw`DROP TRIGGER fail_shipping_save_trigger ON envios_pedidos`;
      await prisma().$executeRaw`DROP FUNCTION fail_shipping_save()`;
    }
    await dispatchPostPago(app, prisma(), pedido.id);
    expect(createGuia.mock.calls.length - before).toBe(1);
    const effect = await prisma().pedidoPostPagoEffect.findUniqueOrThrow({
      where: { pedidoId_tipo: { pedidoId: pedido.id, tipo: "guia" } },
    });
    expect(effect.status).toBe("uncertain");
    expect(effect.result).toMatchObject({
      proveedor: "mock",
      guia: { trackingNumber: expect.stringMatching(/^MOCK/) },
    });
  });
  it("crashed worker lease becomes uncertain rather than resending", async () => {
    const pedido = await order();
    await claimEffect(prisma(), pedido.id, "guia");
    await prisma().pedidoPostPagoEffect.updateMany({
      where: { pedidoId: pedido.id },
      data: { updatedAt: new Date(0) },
    });
    await expireProcessingEffects(prisma());
    const before = createGuia.mock.calls.length;
    await dispatchPostPago(app, prisma(), pedido.id);
    expect(createGuia.mock.calls.length).toBe(before);
    expect(await claimEffect(prisma(), pedido.id, "guia", true)).toBeNull();
  });
  it("pending records survive rollback and are drained after restart", async () => {
    const pedido = await order();
    await expect(
      prisma().$transaction(async (tx) => {
        await enqueuePostPago(tx, pedido.id);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await prisma().pedidoPostPagoEffect.count({ where: { pedidoId: pedido.id } })).toBe(0);
    await enqueuePostPago(prisma(), pedido.id);
    await drainPostPago(app, prisma());
    expect(
      await prisma().pedidoPostPagoEffect.count({ where: { pedidoId: pedido.id, status: "done" } }),
    ).toBe(2);
  });
  it("partially accepted push batch is not repeated and appears in management", async () => {
    const pedido = await order();
    const before = pushSend.mock.calls.length;
    pushSend.mockResolvedValueOnce({ enviadas: 1, eliminadas: 0, fallidas: 1 });
    await dispatchPostPago(app, prisma(), pedido.id);
    await dispatchPostPago(app, prisma(), pedido.id);
    expect(pushSend.mock.calls.length - before).toBe(1);
    const response = await app.inject({
      method: "GET",
      url: "/t/checkout/efectos-postpago",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toContainEqual(
      expect.objectContaining({ pedidoId: pedido.id, tipo: "push_pago", status: "uncertain" }),
    );
  });
});
