import { randomUUID } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";
import type { FiscalProvider } from "@gaespos/fiscal";
import type { PaymentProvider, ReembolsoResult } from "@gaespos/pagos";
import Decimal from "decimal.js";
import type { PagoProviderFactory } from "../../../plugins/pagos.js";
import { type ProcesarDevolucionResult, procesarDevolucion } from "../devoluciones/service.js";
import { DevolucionOnlineError } from "./service.js";

type Client = TenantPrismaClient;

export async function approveBankRefund(
  client: Client,
  fiscal: FiscalProvider,
  factory: PagoProviderFactory,
  userId: string,
  solicitudId: string,
  reponeStock: boolean,
) {
  const job = await client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ${solicitudId}, 7710023))`;
    const existing = await tx.onlineBankRefund.findUnique({ where: { solicitudId } });
    if (existing) return existing;
    const request = await tx.solicitudDevolucion.findUnique({
      where: { id: solicitudId },
      include: { pedido: true },
    });
    if (!request) throw new DevolucionOnlineError(404, "Solicitud no encontrada");
    if (request.estado !== "solicitada" || request.approvalKey)
      throw new DevolucionOnlineError(409, "La solicitud ya fue resuelta");
    const order = request.pedido;
    if (!order.ventaIdGenerada || !order.paymentIntentId || !order.paymentProvider)
      throw new DevolucionOnlineError(
        409,
        "El pedido no conserva el proveedor original. Requiere conciliación antes de reembolsar.",
      );
    if (order.metodoPago !== "tarjeta")
      throw new DevolucionOnlineError(
        422,
        "Reembolso a tarjeta requiere un pago original con tarjeta",
      );
    paymentProvider(factory, order.paymentProvider);
    return tx.onlineBankRefund.create({
      data: {
        solicitudId,
        usuarioId: userId,
        provider: order.paymentProvider,
        intentId: order.paymentIntentId,
        accountId: order.paymentAccountId,
        returnKey: randomUUID(),
        request: { reponeStock },
      },
    });
  });
  if (job.state === "preparing") {
    const request = await client.solicitudDevolucion.findUniqueOrThrow({
      where: { id: solicitudId },
      include: { pedido: true },
    });
    const sale = await client.venta.findUniqueOrThrow({
      where: { id: request.pedido.ventaIdGenerada ?? "" },
      include: { lineas: true },
    });
    const items = request.items as Array<{ varianteId: string; cantidad: number }>;
    const lineas = items.map((item) => {
      const matches = sale.lineas.filter((l) => l.varianteId === item.varianteId);
      if (matches.length !== 1 || !matches[0])
        throw new DevolucionOnlineError(
          422,
          "Artículo de devolución ambiguo o ausente en la venta",
        );
      return {
        ventaLineaId: matches[0].id,
        cantidadDevuelta: String(item.cantidad),
        reponeStock: (job.request as { reponeStock: boolean }).reponeStock,
      };
    });
    const result = await procesarDevolucion(client, fiscal, job.usuarioId, sale.id, {
      motivo: request.motivo,
      metodoReembolso: "tarjeta_misma",
      lineas,
      idempotencyKey: job.returnKey,
      notas: `Devolución online ${request.folio}; reembolso bancario pendiente`,
    });
    const amountCents = new Decimal(result.totalDevuelto).times(100).toDecimalPlaces(0).toNumber();
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
      throw new DevolucionOnlineError(422, "Importe de reembolso inválido");
    await client.onlineBankRefund.updateMany({
      where: { id: job.id, state: "preparing" },
      data: {
        state: "ready",
        amountCents,
        returnResult: result as unknown as object,
      },
    });
  }
  const ready = await client.onlineBankRefund.findUniqueOrThrow({ where: { id: job.id } });
  const provider = paymentProvider(factory, ready.provider);
  const claim = await client.onlineBankRefund.updateMany({
    where: { id: job.id, state: "ready" },
    data: { state: "sending", submittedAt: new Date() },
  });
  if (claim.count === 1) {
    let receipt: ReembolsoResult;
    try {
      receipt = await provider.reembolsar(ready.intentId, ready.amountCents ?? undefined, {
        requestKey: ready.id,
        ...(ready.accountId ? { stripeAccountId: ready.accountId } : {}),
      });
      if (!receipt.reembolsoId) throw new Error("Missing refund reference");
    } catch {
      await client.onlineBankRefund.updateMany({
        where: { id: job.id, state: "sending" },
        data: {
          state: "uncertain",
          lastError:
            "No se confirmó la respuesta bancaria. Consulta el mismo reembolso; no lo envíes otra vez.",
        },
      });
      return bankRefundStatus(client, solicitudId);
    }
    await settleRefund(client, job.id, receipt);
  }
  return bankRefundStatus(client, solicitudId);
}
function paymentProvider(factory: PagoProviderFactory, provider: string): PaymentProvider {
  if (provider !== "stripe" && provider !== "conekta" && provider !== "mock")
    throw new DevolucionOnlineError(409, "Proveedor original no soportado");
  return factory(provider);
}
async function settleRefund(client: Client, id: string, receipt: ReembolsoResult) {
  await client.$transaction(async (tx) => {
    const job = await tx.onlineBankRefund.findUniqueOrThrow({
      where: { id },
      include: { solicitud: true },
    });
    await tx.$queryRaw`SELECT id FROM pedidos_ecommerce WHERE id = ${job.solicitud.pedidoEcommerceId} FOR UPDATE`;
    const current = await tx.onlineBankRefund.findUniqueOrThrow({ where: { id } });
    if (current.state === "completed") return;
    const state =
      receipt.status === "procesado"
        ? "completed"
        : receipt.status === "fallido"
          ? "failed"
          : "pending";
    await tx.onlineBankRefund.update({
      where: { id },
      data: { state, refundId: receipt.reembolsoId, lastError: null },
    });
    if (state !== "completed") return;
    const result = job.returnResult as unknown as ProcesarDevolucionResult;
    await tx.solicitudDevolucion.update({
      where: { id: job.solicitudId },
      data: {
        estado: "aprobada",
        devolucionId: result.devolucionId,
        resueltaPorId: job.usuarioId,
        resueltaAt: new Date(),
      },
    });
    const sum = await tx.onlineBankRefund.aggregate({
      where: {
        state: "completed",
        solicitud: { pedidoEcommerceId: job.solicitud.pedidoEcommerceId },
      },
      _sum: { amountCents: true },
    });
    const order = await tx.pedidoEcommerce.findUniqueOrThrow({
      where: { id: job.solicitud.pedidoEcommerceId },
    });
    const full = new Decimal(sum._sum.amountCents ?? 0).gte(
      new Decimal(order.total).times(100).toDecimalPlaces(0),
    );
    await tx.pedidoEcommerce.update({
      where: { id: order.id },
      data: {
        ...(full ? { statusPago: "reembolsado" as const } : {}),
        eventos: {
          create: {
            tipo: "reembolso_confirmado",
            descripcion: `Reembolso bancario confirmado por $${new Decimal(job.amountCents ?? 0).div(100).toFixed(2)}. Referencia ${receipt.reembolsoId}.`,
            visibleCliente: true,
          },
        },
      },
    });
  });
}
export async function reconcileBankRefund(
  client: Client,
  factory: PagoProviderFactory,
  solicitudId: string,
  reference?: string,
) {
  const job = await client.onlineBankRefund.findUnique({ where: { solicitudId } });
  if (!job) throw new DevolucionOnlineError(404, "No existe intento bancario para esta solicitud");
  if (job.state === "completed") return bankRefundStatus(client, solicitudId);
  if (!job.returnResult || !job.amountCents)
    throw new DevolucionOnlineError(409, "La devolución aún se está preparando");
  if (job.state === "sending" && job.submittedAt && Date.now() - job.submittedAt.getTime() < 60_000)
    return bankRefundStatus(client, solicitudId);
  const provider = paymentProvider(factory, job.provider);
  if (!provider.consultarReembolso)
    throw new DevolucionOnlineError(503, "El proveedor no permite consultar este reembolso");
  const receipt = await provider.consultarReembolso(
    job.intentId,
    (job.state === "failed" ? reference : undefined) ?? job.refundId ?? reference ?? null,
    {
      requestKey: job.id,
      ...(job.accountId ? { stripeAccountId: job.accountId } : {}),
    },
  );
  if (receipt) {
    if (receipt.intentId !== job.intentId || receipt.amountCents !== job.amountCents)
      throw new DevolucionOnlineError(
        422,
        "La referencia bancaria no coincide con el pago e importe de esta devolución",
      );
    await settleRefund(client, job.id, receipt);
  }
  return bankRefundStatus(client, solicitudId);
}
export async function bankRefundStatus(client: Client, solicitudId: string) {
  const job = await client.onlineBankRefund.findUniqueOrThrow({ where: { solicitudId } });
  const result = job.returnResult as unknown as ProcesarDevolucionResult | null;
  return {
    devolucionId: result?.devolucionId ?? null,
    folio: result?.folio ?? null,
    totalDevuelto: result?.totalDevuelto ?? null,
    bankRefund: { state: job.state, reference: job.refundId, error: job.lastError },
  };
}
