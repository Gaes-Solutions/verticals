import { randomUUID } from "node:crypto";
import {
  type RecargaCompaniaCodigo,
  type RecargaProveedorCodigo,
  RecargaError as RecargaProviderError,
  type RecargaTipo,
  type RechargeProvider,
  findCompania,
  validarMonto,
  validarNumeroMx,
} from "@gaespos/recargas";
import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import { CorteError, requireAperturaAbierta } from "../cortes/service.js";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

const ZERO = new Decimal(0);

export class RecargaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RecargaError";
  }
}

export interface ProcesarRecargaInput {
  sucursalId: string;
  cajaAperturaId?: string;
  companiaCodigo: RecargaCompaniaCodigo;
  numeroTelefonico: string;
  montoSolicitado: string;
  /** Monto que paga el cliente — incluye margen del tenant. Si igual a montoSolicitado, sin margen. */
  montoCobradoCliente?: string;
  tipo?: RecargaTipo;
  referenciaCapturada?: string;
  /** Override proveedor; si omitido se usa el `isPrimario` activo */
  proveedorCodigo?: RecargaProveedorCodigo;
}

export interface ProcesarRecargaResult {
  recargaId: string;
  folio: string;
  estado: "exitosa" | "fallida";
  folioProveedor: string | null;
  montoCobradoCliente: string;
  comisionTenant: string;
  motivoFalla?: string;
}

async function nextFolio(tx: Tx, sucursalId: string, sucursalCodigo: string): Promise<string> {
  const counter = await tx.recargaFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `RC-${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

async function pickProveedorConfig(
  client: TenantClient,
  preferido?: RecargaProveedorCodigo,
): Promise<{
  id: string;
  proveedorCodigo: RecargaProveedorCodigo;
  apiUrl: string | null;
  apiKeyEncrypted: string | null;
  saldoPrefondeado: { toString: () => string };
  saldoAlertaMinimo: { toString: () => string };
  comisionProveedorPct: { toString: () => string } | null;
}> {
  if (preferido) {
    const cfg = await client.recargaProveedorConfig.findFirst({
      where: { proveedorCodigo: preferido, isActive: true },
    });
    if (!cfg) {
      throw new RecargaError(409, `Proveedor "${preferido}" no configurado o inactivo`);
    }
    return cfg;
  }
  const primario = await client.recargaProveedorConfig.findFirst({
    where: { isPrimario: true, isActive: true },
  });
  if (primario) return primario;
  const cualquiera = await client.recargaProveedorConfig.findFirst({ where: { isActive: true } });
  if (!cualquiera) {
    throw new RecargaError(409, "Sin proveedor de recargas configurado para este tenant");
  }
  return cualquiera;
}

interface SaldoAlerta {
  proveedorCodigo: RecargaProveedorCodigo;
  saldoActual: string;
  alertaMinimo: string;
  bajo: boolean;
}

export async function consultarSaldos(client: TenantClient): Promise<SaldoAlerta[]> {
  const configs = await client.recargaProveedorConfig.findMany({
    where: { isActive: true },
    orderBy: { isPrimario: "desc" },
  });
  return configs.map((c) => {
    const saldo = new Decimal(c.saldoPrefondeado.toString());
    const alerta = new Decimal(c.saldoAlertaMinimo.toString());
    return {
      proveedorCodigo: c.proveedorCodigo as RecargaProveedorCodigo,
      saldoActual: saldo.toString(),
      alertaMinimo: alerta.toString(),
      bajo: saldo.lte(alerta),
    };
  });
}

function validarInput(input: ProcesarRecargaInput): {
  monto: Decimal;
  cobrado: Decimal;
  comisionTenant: Decimal;
  tipo: RecargaTipo;
} {
  if (!validarNumeroMx(input.numeroTelefonico)) {
    throw new RecargaError(400, "Número telefónico inválido (debe ser 10 dígitos MX)");
  }
  const compania = findCompania(input.companiaCodigo);
  const tipo = input.tipo ?? compania.tipo;
  const monto = new Decimal(input.montoSolicitado);
  const v = validarMonto(input.companiaCodigo, Number(input.montoSolicitado));
  if (!v.ok) {
    throw new RecargaError(400, v.error ?? "Monto inválido");
  }
  if (compania.requiereReferencia && !input.referenciaCapturada) {
    throw new RecargaError(400, `Compañía "${compania.nombre}" requiere referencia adicional`);
  }
  const cobrado = input.montoCobradoCliente ? new Decimal(input.montoCobradoCliente) : monto;
  if (cobrado.lt(monto)) {
    throw new RecargaError(400, "montoCobradoCliente no puede ser menor a montoSolicitado");
  }
  return { monto, cobrado, comisionTenant: cobrado.minus(monto), tipo };
}

async function validarAperturaAbierta(
  client: TenantClient,
  cajaAperturaId: string | undefined,
): Promise<void> {
  if (!cajaAperturaId) return;
  const apertura = await client.cajaApertura.findUnique({ where: { id: cajaAperturaId } });
  if (!apertura) throw new RecargaError(404, "Caja apertura no encontrada");
  try {
    await requireAperturaAbierta(client, apertura.cajaId);
  } catch (err) {
    if (err instanceof CorteError) throw new RecargaError(err.statusCode, err.message, err.extra);
    throw err;
  }
}

interface PersistirYProcesarInput {
  sucursalId: string;
  sucursalCodigo: string;
  input: ProcesarRecargaInput;
  usuarioId: string;
  monto: Decimal;
  cobrado: Decimal;
  comisionTenant: Decimal;
  tipo: RecargaTipo;
  proveedor: Awaited<ReturnType<typeof pickProveedorConfig>>;
}

async function ejecutarProvider(
  provider: RechargeProvider,
  input: ProcesarRecargaInput,
  monto: Decimal,
  tipo: RecargaTipo,
  idempotencyKey: string,
): Promise<{
  estado: "exitosa" | "fallida";
  folioProveedor: string | null;
  raw: Record<string, unknown>;
  motivoFalla: string | null;
  comisionProveedor: Decimal;
  costoRealTenant: Decimal;
}> {
  try {
    const r = await provider.recargar({
      companiaCodigo: input.companiaCodigo,
      numeroTelefonico: input.numeroTelefonico,
      montoSolicitado: monto.toString(),
      tipo,
      ...(input.referenciaCapturada ? { referenciaCapturada: input.referenciaCapturada } : {}),
      idempotencyKey,
    });
    return {
      estado: r.estado === "exitosa" ? "exitosa" : "fallida",
      folioProveedor: r.folioProveedor ?? null,
      raw: r.raw,
      motivoFalla: r.motivoFalla ?? null,
      comisionProveedor: new Decimal(r.comisionProveedor),
      costoRealTenant: new Decimal(r.costoRealTenant),
    };
  } catch (err) {
    if (err instanceof RecargaProviderError) {
      return {
        estado: "fallida",
        folioProveedor: null,
        raw: { code: err.code, message: err.message },
        motivoFalla: err.message,
        comisionProveedor: ZERO,
        costoRealTenant: ZERO,
      };
    }
    throw err;
  }
}

async function persistirYProcesar(
  client: TenantClient,
  provider: RechargeProvider,
  p: PersistirYProcesarInput,
): Promise<ProcesarRecargaResult> {
  const saldoActual = new Decimal(p.proveedor.saldoPrefondeado.toString());
  if (saldoActual.lt(p.monto)) {
    throw new RecargaError(409, "Saldo prefondeado insuficiente con el proveedor", {
      saldoActual: saldoActual.toString(),
      requerido: p.monto.toString(),
    });
  }

  const { recarga, folio } = await client.$transaction(async (tx) => {
    const f = await nextFolio(tx, p.sucursalId, p.sucursalCodigo);
    const r = await tx.recarga.create({
      data: {
        folio: f,
        sucursalId: p.sucursalId,
        ...(p.input.cajaAperturaId ? { cajaAperturaId: p.input.cajaAperturaId } : {}),
        usuarioId: p.usuarioId,
        tipo: p.tipo,
        companiaCodigo: p.input.companiaCodigo,
        proveedorConfigId: p.proveedor.id,
        proveedorCodigo: p.proveedor.proveedorCodigo,
        numeroTelefonico: p.input.numeroTelefonico,
        ...(p.input.referenciaCapturada
          ? { referenciaCapturada: p.input.referenciaCapturada }
          : {}),
        montoSolicitado: p.monto.toString(),
        montoCobradoCliente: p.cobrado.toString(),
        comisionTenant: p.comisionTenant.toString(),
        costoRealTenant: p.monto.toString(),
        estado: "pendiente",
        intentosTotales: 0,
      },
    });
    return { recarga: r, folio: f };
  });

  const idempotencyKey = `${recarga.id}-1`;
  let proveedorResult = await ejecutarProvider(provider, p.input, p.monto, p.tipo, idempotencyKey);
  let intento = 1;

  if (proveedorResult.estado === "fallida") {
    await client.recargaReintento.create({
      data: {
        recargaId: recarga.id,
        intentoNumero: intento,
        respuesta: proveedorResult.raw as object,
        ...(proveedorResult.motivoFalla ? { errorMensaje: proveedorResult.motivoFalla } : {}),
      },
    });
    intento = 2;
    proveedorResult = await ejecutarProvider(
      provider,
      p.input,
      p.monto,
      p.tipo,
      `${recarga.id}-${intento}`,
    );
  }

  await client.recargaReintento.create({
    data: {
      recargaId: recarga.id,
      intentoNumero: intento,
      respuesta: proveedorResult.raw as object,
      ...(proveedorResult.motivoFalla ? { errorMensaje: proveedorResult.motivoFalla } : {}),
    },
  });

  const finalEstado: "exitosa" | "fallida" = proveedorResult.estado;
  await client.recarga.update({
    where: { id: recarga.id },
    data: {
      estado: finalEstado,
      intentosTotales: intento,
      ...(proveedorResult.folioProveedor ? { folioProveedor: proveedorResult.folioProveedor } : {}),
      respuestaProveedor: proveedorResult.raw as object,
      ...(proveedorResult.motivoFalla ? { motivoFalla: proveedorResult.motivoFalla } : {}),
      ...(proveedorResult.comisionProveedor.gt(0)
        ? { comisionProveedor: proveedorResult.comisionProveedor.toString() }
        : {}),
      ...(proveedorResult.costoRealTenant.gt(0)
        ? { costoRealTenant: proveedorResult.costoRealTenant.toString() }
        : {}),
      procesadoAt: new Date(),
    },
  });

  if (finalEstado === "exitosa") {
    const costoFinal = proveedorResult.costoRealTenant.gt(0)
      ? proveedorResult.costoRealTenant
      : p.monto;
    await client.recargaProveedorConfig.update({
      where: { id: p.proveedor.id },
      data: {
        saldoPrefondeado: saldoActual.minus(costoFinal).toString(),
        lastRechargeAt: new Date(),
        totalConsumidoLifetime: {
          increment: Number(costoFinal.toFixed(4)),
        },
      },
    });
  }

  return {
    recargaId: recarga.id,
    folio,
    estado: finalEstado,
    folioProveedor: proveedorResult.folioProveedor,
    montoCobradoCliente: p.cobrado.toString(),
    comisionTenant: p.comisionTenant.toString(),
    ...(proveedorResult.motivoFalla ? { motivoFalla: proveedorResult.motivoFalla } : {}),
  };
}

export async function procesarRecarga(
  client: TenantClient,
  provider: RechargeProvider,
  usuarioId: string,
  input: ProcesarRecargaInput,
): Promise<ProcesarRecargaResult> {
  const sucursal = await client.sucursal.findUnique({ where: { id: input.sucursalId } });
  if (!sucursal) throw new RecargaError(404, "Sucursal no encontrada");
  await validarAperturaAbierta(client, input.cajaAperturaId);
  const { monto, cobrado, comisionTenant, tipo } = validarInput(input);
  const proveedor = await pickProveedorConfig(client, input.proveedorCodigo);

  return persistirYProcesar(client, provider, {
    sucursalId: sucursal.id,
    sucursalCodigo: sucursal.codigo,
    input,
    usuarioId,
    monto,
    cobrado,
    comisionTenant,
    tipo,
    proveedor,
  });
}

export async function reembolsarRecarga(
  client: TenantClient,
  recargaId: string,
  usuarioId: string,
  motivo: string,
): Promise<{ saldoDevuelto: string; nuevoSaldoPrefondeado: string }> {
  return client.$transaction(async (tx) => {
    const r = await tx.recarga.findUnique({
      where: { id: recargaId },
      include: { proveedorConfig: true },
    });
    if (!r) throw new RecargaError(404, "Recarga no encontrada");
    if (r.estado !== "fallida" && r.estado !== "disputada") {
      throw new RecargaError(
        409,
        `Solo se reembolsan recargas fallidas o disputadas (actual: ${r.estado})`,
      );
    }
    const costo = new Decimal(r.costoRealTenant.toString());
    if (costo.lte(ZERO)) {
      await tx.recarga.update({
        where: { id: recargaId },
        data: {
          estado: "reembolsada",
          reembolsadaAt: new Date(),
          reembolsadaPorId: usuarioId,
          reembolsoMotivo: motivo,
        },
      });
      return {
        saldoDevuelto: "0",
        nuevoSaldoPrefondeado: r.proveedorConfig.saldoPrefondeado.toString(),
      };
    }
    const saldoActual = new Decimal(r.proveedorConfig.saldoPrefondeado.toString());
    const nuevoSaldo = saldoActual.plus(costo);
    await tx.recargaProveedorConfig.update({
      where: { id: r.proveedorConfigId },
      data: { saldoPrefondeado: nuevoSaldo.toString() },
    });
    await tx.recarga.update({
      where: { id: recargaId },
      data: {
        estado: "reembolsada",
        reembolsadaAt: new Date(),
        reembolsadaPorId: usuarioId,
        reembolsoMotivo: motivo,
      },
    });
    return { saldoDevuelto: costo.toString(), nuevoSaldoPrefondeado: nuevoSaldo.toString() };
  });
}

export async function marcarDisputada(
  client: TenantClient,
  recargaId: string,
  motivo: string,
): Promise<{ folio: string; estado: string }> {
  const r = await client.recarga.findUnique({ where: { id: recargaId } });
  if (!r) throw new RecargaError(404, "Recarga no encontrada");
  if (r.estado === "reembolsada" || r.estado === "disputada") {
    throw new RecargaError(409, `Recarga en estado "${r.estado}" no se puede disputar nuevamente`);
  }
  const upd = await client.recarga.update({
    where: { id: recargaId },
    data: { estado: "disputada", disputadaAt: new Date(), disputaMotivo: motivo },
  });
  return { folio: upd.folio, estado: upd.estado };
}

export function generateRecargaIdempotencyKey(): string {
  return randomUUID();
}
