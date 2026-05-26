import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

const ZERO = new Decimal(0);

export class CxcError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CxcError";
  }
}

export type CxcTipoOrigen =
  | "venta_credito"
  | "regularizacion_fiado"
  | "manual"
  | "apertura_saldo_inicial";

export interface CrearCxcInput {
  sucursalId: string;
  tipoOrigen: CxcTipoOrigen;
  clienteId?: string;
  clienteB2bId?: string;
  ventaId?: string;
  vendedorId?: string;
  montoOriginal: string;
  diasCreditoOtorgados: number;
  tasaInteresMoraPct?: number | null;
  notas?: string;
  currency?: string;
}

export interface CrearCxcResult {
  cuentaCobrarId: string;
  folio: string;
  montoOriginal: string;
  saldoActual: string;
  fechaVencimiento: Date;
}

async function nextFolio(tx: Tx, sucursalId: string, sucursalCodigo: string): Promise<string> {
  const counter = await tx.cxcFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `CXC-${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

function validateClienteRefs(input: { clienteId?: string; clienteB2bId?: string }): void {
  const tieneB2c = Boolean(input.clienteId);
  const tieneB2b = Boolean(input.clienteB2bId);
  if (tieneB2c === tieneB2b) {
    throw new CxcError(400, "CxC requiere exactamente uno de clienteId o clienteB2bId");
  }
}

export async function lineaCreditoDisponible(
  client: TenantClient,
  clienteB2bId: string,
): Promise<{
  lineaAutorizada: string;
  saldoCxcAbiertas: string;
  disponible: string;
  diasCredito: number;
  tasaInteresMoraPct: string | null;
}> {
  const credito = await client.clienteB2bCredito.findFirst({
    where: { clienteB2bId, isActive: true },
    orderBy: { vigenteDesde: "desc" },
  });
  if (!credito) {
    throw new CxcError(409, "Cliente B2B no tiene línea de crédito activa", { clienteB2bId });
  }
  if (credito.vigenteHasta && credito.vigenteHasta < new Date()) {
    throw new CxcError(409, "Línea de crédito B2B expirada", {
      vigenteHasta: credito.vigenteHasta.toISOString(),
    });
  }

  const abiertas = await client.cuentaCobrar.findMany({
    where: { clienteB2bId, estado: { in: ["activa", "vencida"] } },
    select: { montoOriginal: true, montoPagado: true },
  });
  const saldoAbiertas = abiertas.reduce(
    (acc, c) =>
      acc.plus(
        new Decimal(c.montoOriginal.toString()).minus(new Decimal(c.montoPagado.toString())),
      ),
    ZERO,
  );
  const lineaAutorizada = new Decimal(credito.lineaAutorizada.toString());
  const disponible = Decimal.max(lineaAutorizada.minus(saldoAbiertas), ZERO);
  return {
    lineaAutorizada: lineaAutorizada.toString(),
    saldoCxcAbiertas: saldoAbiertas.toString(),
    disponible: disponible.toString(),
    diasCredito: credito.diasCredito,
    tasaInteresMoraPct: credito.tasaInteresMoraPct?.toString() ?? null,
  };
}

export async function validarCreditoB2bSuficiente(
  client: TenantClient,
  clienteB2bId: string,
  montoSolicitado: string,
): Promise<{ diasCredito: number; tasaInteresMoraPct: string | null }> {
  const info = await lineaCreditoDisponible(client, clienteB2bId);
  const monto = new Decimal(montoSolicitado);
  if (monto.gt(new Decimal(info.disponible))) {
    throw new CxcError(409, "Excede la línea de crédito disponible del cliente B2B", {
      lineaAutorizada: info.lineaAutorizada,
      saldoCxcAbiertas: info.saldoCxcAbiertas,
      disponible: info.disponible,
      intentado: monto.toString(),
    });
  }
  return { diasCredito: info.diasCredito, tasaInteresMoraPct: info.tasaInteresMoraPct };
}

export async function crearCuentaCobrar(tx: Tx, input: CrearCxcInput): Promise<CrearCxcResult> {
  validateClienteRefs(input);

  const sucursal = await tx.sucursal.findUnique({ where: { id: input.sucursalId } });
  if (!sucursal) throw new CxcError(404, "Sucursal no encontrada");

  const monto = new Decimal(input.montoOriginal);
  if (!monto.gt(ZERO)) {
    throw new CxcError(400, "Monto original debe ser mayor a 0");
  }

  const fechaEmision = new Date();
  const fechaVencimiento = new Date(fechaEmision);
  fechaVencimiento.setDate(fechaVencimiento.getDate() + input.diasCreditoOtorgados);

  const folio = await nextFolio(tx, sucursal.id, sucursal.codigo);

  const cxc = await tx.cuentaCobrar.create({
    data: {
      folio,
      sucursalId: sucursal.id,
      tipoOrigen: input.tipoOrigen,
      ...(input.clienteId ? { clienteId: input.clienteId } : {}),
      ...(input.clienteB2bId ? { clienteB2bId: input.clienteB2bId } : {}),
      ...(input.ventaId ? { ventaId: input.ventaId } : {}),
      ...(input.vendedorId ? { vendedorId: input.vendedorId } : {}),
      montoOriginal: monto.toString(),
      currency: input.currency ?? "MXN",
      fechaEmision,
      fechaVencimiento,
      diasCreditoOtorgados: input.diasCreditoOtorgados,
      ...(input.tasaInteresMoraPct !== undefined && input.tasaInteresMoraPct !== null
        ? { tasaInteresMoraPct: input.tasaInteresMoraPct }
        : {}),
      ...(input.notas ? { notas: input.notas } : {}),
    },
  });

  return {
    cuentaCobrarId: cxc.id,
    folio,
    montoOriginal: monto.toString(),
    saldoActual: monto.toString(),
    fechaVencimiento,
  };
}

export interface CrearCxcDesdeVentaB2bInput {
  ventaId: string;
  sucursalId: string;
  clienteB2bId: string;
  vendedorId: string;
  montoCredito: string;
  diasCredito: number;
  tasaInteresMoraPct: string | null;
  notas?: string;
}

export async function crearCxcDesdeVentaB2b(
  tx: Tx,
  input: CrearCxcDesdeVentaB2bInput,
): Promise<CrearCxcResult> {
  return crearCuentaCobrar(tx, {
    sucursalId: input.sucursalId,
    tipoOrigen: "venta_credito",
    clienteB2bId: input.clienteB2bId,
    ventaId: input.ventaId,
    vendedorId: input.vendedorId,
    montoOriginal: input.montoCredito,
    diasCreditoOtorgados: input.diasCredito,
    ...(input.tasaInteresMoraPct !== null
      ? { tasaInteresMoraPct: Number(input.tasaInteresMoraPct) }
      : {}),
    ...(input.notas ? { notas: input.notas } : {}),
  });
}

export interface RegistrarPagoInput {
  cuentaCobrarId: string;
  monto: string;
  metodo: "efectivo" | "tarjeta_debito" | "tarjeta_credito" | "transferencia" | "vale" | "otro";
  referencia?: string;
  comprobanteUrl?: string;
  usuarioId: string;
}

export interface RegistrarPagoResult {
  saldoRestante: string;
  montoPagado: string;
  estado: "activa" | "vencida" | "liquidada" | "incobrable" | "condonada";
}

export async function registrarPago(
  client: TenantClient,
  input: RegistrarPagoInput,
): Promise<RegistrarPagoResult> {
  return client.$transaction(async (tx) => {
    const cxc = await tx.cuentaCobrar.findUnique({ where: { id: input.cuentaCobrarId } });
    if (!cxc) throw new CxcError(404, "CxC no encontrada");
    if (cxc.estado === "liquidada" || cxc.estado === "condonada") {
      throw new CxcError(409, `CxC en estado "${cxc.estado}" no acepta pagos`);
    }

    const monto = new Decimal(input.monto);
    const pagadoActual = new Decimal(cxc.montoPagado.toString());
    const total = new Decimal(cxc.montoOriginal.toString()).plus(
      new Decimal(cxc.interesAcumulado.toString()),
    );
    const saldoActual = total.minus(pagadoActual);
    if (monto.gt(saldoActual)) {
      throw new CxcError(409, "El pago excede el saldo de la CxC", {
        saldoActual: saldoActual.toString(),
        intentado: monto.toString(),
      });
    }

    const nuevoPagado = pagadoActual.plus(monto);
    const saldoNuevo = total.minus(nuevoPagado);
    const estado = saldoNuevo.eq(ZERO) ? "liquidada" : cxc.estado;

    await tx.cuentaCobrar.update({
      where: { id: cxc.id },
      data: {
        montoPagado: nuevoPagado.toString(),
        estado,
        ...(estado === "liquidada" ? { liquidadaAt: new Date() } : {}),
      },
    });
    await tx.cxcPago.create({
      data: {
        cuentaCobrarId: cxc.id,
        metodo: input.metodo,
        monto: monto.toString(),
        ...(input.referencia ? { referencia: input.referencia } : {}),
        ...(input.comprobanteUrl ? { comprobanteUrl: input.comprobanteUrl } : {}),
        usuarioId: input.usuarioId,
      },
    });

    return {
      saldoRestante: saldoNuevo.toString(),
      montoPagado: nuevoPagado.toString(),
      estado,
    };
  });
}

export async function condonarCxc(
  client: TenantClient,
  cuentaCobrarId: string,
  motivo: string,
): Promise<{ pendienteCondonado: string }> {
  return client.$transaction(async (tx) => {
    const cxc = await tx.cuentaCobrar.findUnique({ where: { id: cuentaCobrarId } });
    if (!cxc) throw new CxcError(404, "CxC no encontrada");
    if (cxc.estado === "liquidada" || cxc.estado === "condonada") {
      throw new CxcError(409, `CxC ya está "${cxc.estado}"`);
    }
    const total = new Decimal(cxc.montoOriginal.toString()).plus(
      new Decimal(cxc.interesAcumulado.toString()),
    );
    const pagado = new Decimal(cxc.montoPagado.toString());
    const pendiente = total.minus(pagado);
    await tx.cuentaCobrar.update({
      where: { id: cxc.id },
      data: {
        estado: "condonada",
        condonadaAt: new Date(),
        notas: cxc.notas ? `${cxc.notas}\n[CONDONADA] ${motivo}` : `[CONDONADA] ${motivo}`,
      },
    });
    return { pendienteCondonado: pendiente.toString() };
  });
}

export async function marcarIncobrable(
  client: TenantClient,
  cuentaCobrarId: string,
  motivo: string,
): Promise<{ pendienteIncobrable: string }> {
  return client.$transaction(async (tx) => {
    const cxc = await tx.cuentaCobrar.findUnique({ where: { id: cuentaCobrarId } });
    if (!cxc) throw new CxcError(404, "CxC no encontrada");
    if (cxc.estado === "liquidada" || cxc.estado === "condonada" || cxc.estado === "incobrable") {
      throw new CxcError(409, `CxC en estado "${cxc.estado}" no se puede marcar incobrable`);
    }
    const total = new Decimal(cxc.montoOriginal.toString()).plus(
      new Decimal(cxc.interesAcumulado.toString()),
    );
    const pagado = new Decimal(cxc.montoPagado.toString());
    const pendiente = total.minus(pagado);
    await tx.cuentaCobrar.update({
      where: { id: cxc.id },
      data: {
        estado: "incobrable",
        notas: cxc.notas ? `${cxc.notas}\n[INCOBRABLE] ${motivo}` : `[INCOBRABLE] ${motivo}`,
      },
    });
    return { pendienteIncobrable: pendiente.toString() };
  });
}
