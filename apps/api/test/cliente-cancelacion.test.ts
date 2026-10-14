import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildTestApp, createTestTenant } from "./helpers.js";

const slug = "test-cliente-cancelacion";
let app: FastifyInstance;
let token: string;
let clienteId: string;
const db = () => getTenantClient(slug);
beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(slug);
  const res = await app.inject({
    method: "POST",
    url: "/auth/cliente/registro",
    payload: {
      tenantSlug: slug,
      nombre: "QA",
      email: "cancelacion@test.local",
      password: "CancelacionQA2026!",
    },
  });
  expect(res.statusCode).toBe(201);
  token = res.json().accessToken;
  clienteId = res.json().cliente.id;
  await db().configTiendaEcommerce.create({
    data: { nombre: "Prueba", subdominio: slug, activa: true, cancelacionCliente: true },
  });
});
afterAll(async () => {
  await app?.close();
});
const cancel = (folio: string) =>
  app.inject({
    method: "POST",
    url: `/cliente-portal/pedidos/${folio}/cancelar`,
    headers: { authorization: `Bearer ${token}` },
    payload: { motivo: "Pedido de prueba" },
  });
async function order(
  data: {
    paymentProvider?: string;
    statusPago?: "pago_confirmado";
    statusPedido?: "enviado";
    clienteId?: string;
  } = {},
) {
  return db().pedidoEcommerce.create({
    data: {
      folioPublico: randomUUID(),
      clienteId,
      emailComprador: "cancelacion@test.local",
      subtotal: 100,
      total: 100,
      metodoEnvio: "click_collect",
      ...data,
    },
  });
}
it("cancels an unpaid order once, replays without duplicate events, and never claims a refund", async () => {
  const p = await order();
  expect((await cancel(p.folioPublico)).statusCode).toBe(200);
  expect((await cancel(p.folioPublico)).json()).toMatchObject({ reembolsado: false });
  const saved = await db().pedidoEcommerce.findUniqueOrThrow({
    where: { id: p.id },
    include: { eventos: true },
  });
  expect(saved.statusPedido).toBe("cancelado");
  expect(saved.statusPago).toBe("pendiente");
  expect(saved.eventos).toHaveLength(1);
});
it.each([{ paymentProvider: "stripe" }, { statusPago: "pago_confirmado" as const }])(
  "does not change financial state or inventory for unverified paid cancellation %j",
  async (data) => {
    const p = await order(data);
    const res = await cancel(p.folioPublico);
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/verificar el reembolso/);
    const saved = await db().pedidoEcommerce.findUniqueOrThrow({
      where: { id: p.id },
      include: { eventos: true },
    });
    expect(saved.statusPedido).toBe(p.statusPedido);
    expect(saved.statusPago).toBe(p.statusPago);
    expect(saved.eventos).toHaveLength(0);
  },
);
it("does not cancel shipped or another customer's orders", async () => {
  const shipped = await order({ statusPedido: "enviado" });
  expect((await cancel(shipped.folioPublico)).statusCode).toBe(409);
  const other = await db().cliente.create({ data: { nombre: "Otra persona" } });
  const foreign = await order({ clienteId: other.id });
  expect((await cancel(foreign.folioPublico)).statusCode).toBe(404);
});
