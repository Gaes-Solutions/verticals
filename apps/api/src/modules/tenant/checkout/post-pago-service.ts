import type { TenantPrismaClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { generarGuiaPedido } from "../envios/guias-service.js";
import { enviarPushCliente } from "../push/service.js";
import {
  claimEffect,
  enqueuePostPago,
  expireProcessingEffects,
  settleEffect,
} from "./post-pago-store.js";

async function dispatchPush(app: FastifyInstance, prisma: TenantPrismaClient, pedidoId: string) {
  const token = await claimEffect(prisma, pedidoId, "push_pago");
  if (!token) return;
  let dispatched = false;
  try {
    const config = await prisma.configTiendaEcommerce.findFirst();
    const pedido = await prisma.pedidoEcommerce.findUnique({ where: { id: pedidoId } });
    const enabled =
      config?.pushHabilitado &&
      Array.isArray(config.pushEventos) &&
      config.pushEventos.includes("pago_confirmado");
    if (!enabled || !pedido?.clienteId) {
      await settleEffect(prisma, pedidoId, "push_pago", token, "skipped");
      return;
    }
    dispatched = true;
    const result = await enviarPushCliente(prisma, pedido.clienteId, {
      titulo: `Pedido ${pedido.folioPublico}`,
      cuerpo: "Recibimos tu pago. Estamos preparando tu pedido.",
      url: `/cuenta/pedidos/${pedido.folioPublico}`,
      tag: `pedido-${pedido.folioPublico}`,
    });
    await settleEffect(
      prisma,
      pedidoId,
      "push_pago",
      token,
      result.fallidas ? "uncertain" : "done",
      result.fallidas ? "PUSH_PARTIAL_OR_UNCERTAIN" : null,
      result,
    );
  } catch {
    await settleEffect(
      prisma,
      pedidoId,
      "push_pago",
      token,
      dispatched ? "uncertain" : "pending",
      dispatched ? "PUSH_RESULT_UNCERTAIN" : "PUSH_PREPARATION_FAILED",
    );
    app.log.warn({ pedidoId }, "push postpago pendiente de revisión");
  }
}

async function dispatchGuia(app: FastifyInstance, prisma: TenantPrismaClient, pedidoId: string) {
  const config = await prisma.configTiendaEcommerce.findFirst();
  const pedido = await prisma.pedidoEcommerce.findUnique({
    where: { id: pedidoId },
    select: { metodoEnvio: true },
  });
  const proveedor = config?.paqueteriaProvider;
  if (
    !config?.paqueteriaAutoGuia ||
    pedido?.metodoEnvio !== "paqueteria" ||
    (proveedor !== "skydropx" && proveedor !== "envia" && proveedor !== "mock")
  ) {
    const token = await claimEffect(prisma, pedidoId, "guia");
    if (token) await settleEffect(prisma, pedidoId, "guia", token, "skipped");
    return;
  }
  const effect = await prisma.pedidoPostPagoEffect.findUnique({
    where: { pedidoId_tipo: { pedidoId, tipo: "guia" } },
  });
  if (effect?.status !== "pending" || effect.nextAttemptAt > new Date()) return;
  // Shared durable guard in generarGuiaPedido serializes automatic and manual callers.
  await generarGuiaPedido(prisma, app.shippingProviderFactory(proveedor), pedidoId);
}

export async function dispatchPostPago(
  app: FastifyInstance,
  prisma: TenantPrismaClient,
  pedidoId: string,
) {
  const pedido = await prisma.pedidoEcommerce.findUnique({
    where: { id: pedidoId },
    select: { statusPago: true, ventaIdGenerada: true },
  });
  if (pedido?.statusPago !== "pago_confirmado" || !pedido.ventaIdGenerada) return;
  await enqueuePostPago(prisma, pedidoId);
  await expireProcessingEffects(prisma);
  for (const dispatch of [dispatchGuia, dispatchPush]) {
    try {
      await dispatch(app, prisma, pedidoId);
    } catch {
      app.log.warn({ pedidoId }, "efecto postpago pendiente de revisión");
    }
  }
}

export async function drainPostPago(app: FastifyInstance, prisma: TenantPrismaClient) {
  await expireProcessingEffects(prisma);
  const pending = await prisma.pedidoPostPagoEffect.findMany({
    where: {
      status: "pending",
      nextAttemptAt: { lte: new Date() },
      pedido: { statusPago: "pago_confirmado", ventaIdGenerada: { not: null } },
    },
    select: { pedidoId: true },
    distinct: ["pedidoId"],
    take: 50,
    orderBy: { nextAttemptAt: "asc" },
  });
  for (const { pedidoId } of pending) await dispatchPostPago(app, prisma, pedidoId);
}
