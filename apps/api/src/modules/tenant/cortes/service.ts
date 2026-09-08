import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import type { CorteCreateInput, Denominaciones } from "./schemas.js";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

const ZERO = new Decimal(0);

export class CorteError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CorteError";
  }
}

const BILLETE_VALORES = [1000, 500, 200, 100, 50, 20] as const;
const MONEDA_VALORES = ["20", "10", "5", "2", "1", "0.5"] as const;

export function totalDenominaciones(d: Denominaciones): Decimal {
  let total = ZERO;
  for (const v of BILLETE_VALORES) {
    const cantidad = d.billetes[String(v) as keyof typeof d.billetes] ?? 0;
    total = total.plus(new Decimal(v).mul(cantidad));
  }
  for (const v of MONEDA_VALORES) {
    const cantidad = d.monedas[v as keyof typeof d.monedas] ?? 0;
    total = total.plus(new Decimal(v).mul(cantidad));
  }
  return total;
}

export interface AperturaActiva {
  id: string;
  estado: "abierta";
  cajaId: string;
  sucursalId: string;
  usuarioId: string;
  montoInicial: Decimal;
  createdAt: Date;
}

export async function findAperturaActiva(
  client: TenantClient,
  cajaId: string,
): Promise<AperturaActiva | null> {
  const apertura = await client.cajaApertura.findFirst({
    where: { cajaId, estado: "abierta" },
  });
  if (!apertura) return null;
  return {
    id: apertura.id,
    estado: "abierta",
    cajaId: apertura.cajaId,
    sucursalId: apertura.sucursalId,
    usuarioId: apertura.usuarioId,
    montoInicial: new Decimal(apertura.montoInicial.toString()),
    createdAt: apertura.createdAt,
  };
}

export interface AperturaInput {
  cajaId: string;
  usuarioId: string;
  montoInicial: string;
  observaciones?: string;
}

export async function abrirCaja(
  client: TenantClient,
  input: AperturaInput,
): Promise<{ id: string }> {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT c.id FROM cajas c JOIN sucursales s ON s.id = c.sucursal_id WHERE c.id = ${input.cajaId} FOR UPDATE OF c FOR SHARE OF s`;
    const caja = await tx.caja.findUnique({
      where: { id: input.cajaId },
      include: { sucursal: true },
    });
    if (!caja) throw new CorteError(404, `Caja "${input.cajaId}" no encontrada`);
    if (!caja.isActive) throw new CorteError(409, "Caja inactiva");
    if (!caja.sucursal.isActive || caja.sucursal.archivedAt)
      throw new CorteError(409, "Sucursal inactiva");
    const existing = await tx.cajaApertura.findFirst({
      where: { cajaId: input.cajaId, estado: "abierta" },
    });
    if (existing)
      throw new CorteError(409, "Caja ya tiene una apertura activa", {
        aperturaId: existing.id,
        usuarioId: existing.usuarioId,
      });
    const opening = await tx.cajaApertura.create({
      data: {
        cajaId: caja.id,
        sucursalId: caja.sucursalId,
        usuarioId: input.usuarioId,
        montoInicial: input.montoInicial,
        ...(input.observaciones ? { observacionesApertura: input.observaciones } : {}),
      },
    });
    return { id: opening.id };
  });
}

interface ArqueoData {
  desdeAt: Date;
  hastaAt: Date;
  ventasCount: number;
  ventasCanceladas: number;
  ventasTotal: Decimal;
  desglosePorMetodo: Record<string, string>;
  desgloseMovimientos: { entradas: string; salidas: string; neto: string };
  efectivoEsperado: Decimal;
}

interface VentaPagoLite {
  metodo: string;
  monto: { toString: () => string };
}
interface VentaLite {
  estado: string;
  total: { toString: () => string };
  cambioDado: { toString: () => string };
  pagos: VentaPagoLite[];
}
interface VentasSummary {
  ventasCount: number;
  ventasCanceladas: number;
  ventasTotal: Decimal;
  cambioTotal: Decimal;
  desglose: Record<string, Decimal>;
}

function summarizarVentas(ventas: VentaLite[]): VentasSummary {
  const desglose: Record<string, Decimal> = {
    efectivo: ZERO,
    tarjeta_debito: ZERO,
    tarjeta_credito: ZERO,
    transferencia: ZERO,
    vale: ZERO,
    monedero: ZERO,
    otro: ZERO,
  };
  let ventasCount = 0;
  let ventasCanceladas = 0;
  let ventasTotal = ZERO;
  let cambioTotal = ZERO;
  for (const v of ventas) {
    if (v.estado === "cancelada") {
      ventasCanceladas += 1;
      continue;
    }
    ventasCount += 1;
    ventasTotal = ventasTotal.plus(new Decimal(v.total.toString()));
    cambioTotal = cambioTotal.plus(new Decimal(v.cambioDado.toString()));
    for (const p of v.pagos) {
      const slot = desglose[p.metodo];
      if (slot) desglose[p.metodo] = slot.plus(new Decimal(p.monto.toString()));
    }
  }
  return { ventasCount, ventasCanceladas, ventasTotal, cambioTotal, desglose };
}

function summarizarMovimientos(
  movimientos: Array<{ tipo: string; monto: { toString: () => string } }>,
): { entradas: Decimal; salidas: Decimal } {
  let entradas = ZERO;
  let salidas = ZERO;
  for (const m of movimientos) {
    const monto = new Decimal(m.monto.toString());
    if (m.tipo.startsWith("entrada")) entradas = entradas.plus(monto);
    else salidas = salidas.plus(monto);
  }
  return { entradas, salidas };
}

function serializeDesglose(desglose: Record<string, Decimal>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(desglose)) {
    const val = desglose[k];
    if (val !== undefined) out[k] = val.toString();
  }
  return out;
}

async function calcularArqueo(
  client: Pick<TenantClient, "cajaApertura" | "venta" | "cajaMovimiento">,
  aperturaId: string,
  hastaAt: Date,
): Promise<ArqueoData> {
  const apertura = await client.cajaApertura.findUnique({ where: { id: aperturaId } });
  if (!apertura) throw new CorteError(404, "Apertura no encontrada");
  const desdeAt = apertura.createdAt;

  const ventasPeriodo = await client.venta.findMany({
    where: { cajaId: apertura.cajaId, cobradaAt: { gte: desdeAt, lte: hastaAt } },
    include: { pagos: true },
  });
  const v = summarizarVentas(ventasPeriodo);

  const movimientos = await client.cajaMovimiento.findMany({
    where: { aperturaId, createdAt: { gte: desdeAt, lte: hastaAt } },
  });
  const m = summarizarMovimientos(movimientos);

  const efectivoVendido = v.desglose.efectivo ?? ZERO;
  const efectivoEsperado = new Decimal(apertura.montoInicial.toString())
    .plus(efectivoVendido)
    .minus(v.cambioTotal)
    .plus(m.entradas)
    .minus(m.salidas);

  return {
    desdeAt,
    hastaAt,
    ventasCount: v.ventasCount,
    ventasCanceladas: v.ventasCanceladas,
    ventasTotal: v.ventasTotal,
    desglosePorMetodo: serializeDesglose(v.desglose),
    desgloseMovimientos: {
      entradas: m.entradas.toString(),
      salidas: m.salidas.toString(),
      neto: m.entradas.minus(m.salidas).toString(),
    },
    efectivoEsperado,
  };
}

async function nextCorteNumero(tx: Tx, aperturaId: string): Promise<number> {
  const count = await tx.corte.count({ where: { aperturaId } });
  return count + 1;
}

export async function lockAperturaAbierta(tx: Tx, aperturaId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM caja_aperturas WHERE id = ${aperturaId} FOR UPDATE`;
  const opening = await tx.cajaApertura.findUnique({
    where: { id: aperturaId },
    select: { estado: true },
  });
  if (!opening) throw new CorteError(404, "Apertura no encontrada");
  if (opening.estado !== "abierta")
    throw new CorteError(409, "Apertura ya está cerrada; abre una nueva caja primero");
}

export async function crearCorte(
  client: TenantClient,
  usuarioId: string,
  input: CorteCreateInput,
): Promise<{ corteId: string; tipo: "X" | "Z"; diferencia: string }> {
  const efectivoContado = totalDenominaciones(input.denominaciones);
  return client.$transaction(async (tx) => {
    // All X/Z devices serialize on the opening; check state after acquiring the lock.
    await lockAperturaAbierta(tx, input.aperturaId);
    const ahora = new Date();
    const arqueo = await calcularArqueo(tx, input.aperturaId, ahora);
    const diferencia = efectivoContado.minus(arqueo.efectivoEsperado);
    const numero = await nextCorteNumero(tx, input.aperturaId);
    const corte = await tx.corte.create({
      data: {
        aperturaId: input.aperturaId,
        tipo: input.tipo,
        numero,
        desdeAt: arqueo.desdeAt,
        hastaAt: arqueo.hastaAt,
        ventasCount: arqueo.ventasCount,
        ventasCanceladas: arqueo.ventasCanceladas,
        ventasTotal: arqueo.ventasTotal.toString(),
        efectivoEsperado: arqueo.efectivoEsperado.toString(),
        efectivoContado: efectivoContado.toString(),
        diferencia: diferencia.toString(),
        desglosePorMetodo: arqueo.desglosePorMetodo as unknown as object,
        desgloseMovimientos: arqueo.desgloseMovimientos as unknown as object,
        denominaciones: input.denominaciones as unknown as object,
        ...(input.observaciones ? { observaciones: input.observaciones } : {}),
        usuarioId,
      },
    });

    if (input.tipo === "Z") {
      await tx.cajaApertura.update({
        where: { id: input.aperturaId },
        data: {
          estado: "cerrada",
          cerradaAt: ahora,
          cerradaPorId: usuarioId,
          cerradaForzosa: input.cerradaForzosa,
        },
      });
    }

    return { corteId: corte.id, tipo: input.tipo, diferencia: diferencia.toString() };
  });
}

export async function registrarMovimiento(
  client: TenantClient,
  usuarioId: string,
  input: {
    aperturaId: string;
    tipo:
      | "entrada_fondo"
      | "entrada_prestamo"
      | "entrada_devolucion"
      | "entrada_otro"
      | "salida_retiro"
      | "salida_gasto"
      | "salida_deposito"
      | "salida_otro";
    monto: string;
    motivo: string;
    referencia?: string;
  },
): Promise<{ id: string }> {
  return client.$transaction(async (tx) => {
    await lockAperturaAbierta(tx, input.aperturaId);
    const mov = await tx.cajaMovimiento.create({
      data: {
        aperturaId: input.aperturaId,
        tipo: input.tipo,
        monto: input.monto,
        motivo: input.motivo,
        ...(input.referencia ? { referencia: input.referencia } : {}),
        usuarioId,
      },
    });
    return { id: mov.id };
  });
}

export async function requireAperturaAbierta(
  client: TenantClient,
  cajaId: string,
): Promise<AperturaActiva> {
  const apertura = await findAperturaActiva(client, cajaId);
  if (!apertura) {
    throw new CorteError(409, "Caja sin apertura activa; debes aperturar antes de cobrar", {
      cajaId,
    });
  }
  return apertura;
}
