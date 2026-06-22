import { randomBytes } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";

export class MonederoError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "MonederoError";
  }
}

function codigoGiftCard(): string {
  return `GR-${randomBytes(4).toString("hex").toUpperCase()}`;
}

// ── Tarjetas de regalo ──────────────────────────────────────────────────────

export interface GiftCardDto {
  id: string;
  codigo: string;
  montoInicial: string;
  saldoActual: string;
  status: string;
  createdAt: string;
}

interface GiftRow {
  id: string;
  codigo: string;
  montoInicial: { toString(): string };
  saldoActual: { toString(): string };
  status: string;
  createdAt: Date;
}
function giftDto(r: GiftRow): GiftCardDto {
  return {
    id: r.id,
    codigo: r.codigo,
    montoInicial: Number(r.montoInicial).toFixed(2),
    saldoActual: Number(r.saldoActual).toFixed(2),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function crearGiftCard(
  client: TenantPrismaClient,
  usuarioId: string,
  input: { monto: number; vigenciaDias?: number },
): Promise<GiftCardDto> {
  const vigenciaHasta = input.vigenciaDias
    ? new Date(Date.now() + input.vigenciaDias * 24 * 60 * 60 * 1000)
    : null;
  const card = await client.tarjetaRegalo.create({
    data: {
      codigo: codigoGiftCard(),
      montoInicial: input.monto.toFixed(2),
      saldoActual: input.monto.toFixed(2),
      vigenciaHasta,
      creadoPorId: usuarioId,
    },
  });
  return giftDto(card);
}

export async function listarGiftCards(
  client: TenantPrismaClient,
): Promise<{ items: GiftCardDto[]; emitido: number; vigente: number }> {
  const rows = await client.tarjetaRegalo.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const emitido = rows.reduce((s, r) => s + Number(r.montoInicial), 0);
  const vigente = rows
    .filter((r) => r.status === "activa")
    .reduce((s, r) => s + Number(r.saldoActual), 0);
  return { items: rows.map(giftDto), emitido, vigente };
}

export async function consultarGiftCard(
  client: TenantPrismaClient,
  codigo: string,
): Promise<{ codigo: string; saldoActual: string; status: string }> {
  const card = await client.tarjetaRegalo.findUnique({ where: { codigo } });
  if (!card) throw new MonederoError(404, "Tarjeta no encontrada");
  return {
    codigo: card.codigo,
    saldoActual: Number(card.saldoActual).toFixed(2),
    status: card.status,
  };
}

export async function cancelarGiftCard(
  client: TenantPrismaClient,
  id: string,
): Promise<GiftCardDto> {
  const card = await client.tarjetaRegalo.findUnique({ where: { id } });
  if (!card) throw new MonederoError(404, "Tarjeta no encontrada");
  if (card.status === "agotada") throw new MonederoError(409, "La tarjeta ya fue canjeada");
  const upd = await client.tarjetaRegalo.update({ where: { id }, data: { status: "cancelada" } });
  return giftDto(upd);
}

// ── Monedero (saldo a favor del cliente) ────────────────────────────────────

export interface MovimientoDto {
  id: string;
  tipo: string;
  monto: string;
  saldoResultante: string;
  motivo: string;
  createdAt: string;
}

export async function getMonedero(
  client: TenantPrismaClient,
  clienteId: string,
): Promise<{ saldo: string; movimientos: MovimientoDto[] }> {
  const cliente = await client.cliente.findUnique({
    where: { id: clienteId },
    select: { saldoMonedero: true },
  });
  if (!cliente) throw new MonederoError(404, "Cliente no encontrado");
  const movs = await client.monederoMovimiento.findMany({
    where: { clienteId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    saldo: Number(cliente.saldoMonedero).toFixed(2),
    movimientos: movs.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      monto: Number(m.monto).toFixed(2),
      saldoResultante: Number(m.saldoResultante).toFixed(2),
      motivo: m.motivo,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** Aplica un movimiento (abono o cargo) en transacción y devuelve el saldo nuevo. */
export async function moverMonedero(
  client: TenantPrismaClient,
  usuarioId: string,
  clienteId: string,
  input: {
    tipo: "abono" | "cargo";
    monto: number;
    motivo: string;
    refTipo?: string;
    refId?: string;
  },
): Promise<{ saldo: string }> {
  if (input.monto <= 0) throw new MonederoError(400, "Monto inválido");
  return client.$transaction(async (tx) => {
    const cliente = await tx.cliente.findUnique({
      where: { id: clienteId },
      select: { saldoMonedero: true },
    });
    if (!cliente) throw new MonederoError(404, "Cliente no encontrado");
    const saldoActual = Number(cliente.saldoMonedero);
    const delta = input.tipo === "abono" ? input.monto : -input.monto;
    const nuevo = saldoActual + delta;
    if (nuevo < 0) throw new MonederoError(409, "Saldo insuficiente en el monedero");
    await tx.cliente.update({
      where: { id: clienteId },
      data: { saldoMonedero: nuevo.toFixed(2) },
    });
    await tx.monederoMovimiento.create({
      data: {
        clienteId,
        tipo: input.tipo,
        monto: input.monto.toFixed(2),
        saldoResultante: nuevo.toFixed(2),
        motivo: input.motivo,
        refTipo: input.refTipo ?? null,
        refId: input.refId ?? null,
        creadoPorId: usuarioId,
      },
    });
    return { saldo: nuevo.toFixed(2) };
  });
}

/** Canjea una gift card abonando su saldo al monedero de un cliente. */
export async function canjearGiftCardAMonedero(
  client: TenantPrismaClient,
  usuarioId: string,
  codigo: string,
  clienteId: string,
): Promise<{ saldo: string; abonado: string }> {
  const card = await client.tarjetaRegalo.findUnique({ where: { codigo } });
  if (!card) throw new MonederoError(404, "Tarjeta no encontrada");
  if (card.status !== "activa") throw new MonederoError(409, `La tarjeta está ${card.status}`);
  if (card.vigenciaHasta && card.vigenciaHasta < new Date()) {
    await client.tarjetaRegalo.update({ where: { id: card.id }, data: { status: "expirada" } });
    throw new MonederoError(409, "La tarjeta expiró");
  }
  const saldoCard = Number(card.saldoActual);
  if (saldoCard <= 0) throw new MonederoError(409, "La tarjeta no tiene saldo");

  const res = await moverMonedero(client, usuarioId, clienteId, {
    tipo: "abono",
    monto: saldoCard,
    motivo: `Canje tarjeta de regalo ${codigo}`,
    refTipo: "gift_card",
    refId: card.id,
  });
  await client.tarjetaRegalo.update({
    where: { id: card.id },
    data: { saldoActual: "0", status: "agotada", canjeadaAt: new Date() },
  });
  return { saldo: res.saldo, abonado: saldoCard.toFixed(2) };
}
