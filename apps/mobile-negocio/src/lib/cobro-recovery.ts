import type { LineaVenta } from "../services/negocio";
import {
  type CobroStorage,
  calcularEfectivo,
  cobroPendienteKey,
  montoCentavos,
  totalVerificado,
} from "./cobro-model";

export interface CobroPayload {
  sucursalId: string;
  cajaId: string;
  canal: "pos";
  lineas: LineaVenta[];
  pagos: Array<{ metodo: "efectivo"; monto: string }>;
  expectedTotal: string;
  idempotencyKey: string;
}
export interface CobroResultado {
  ventaId: string;
  folio: string;
  total: string;
  totalCobrado: string;
  cambioDado: string;
}
export type EstadoIntento =
  | { status: "ready"; result: CobroResultado; ventaEstado: string }
  | { status: "processing" | "not_found" | "cancelled" };
export interface CobroAPI {
  preparar: () => Promise<{ idempotencyKey: string }>;
  enviar: (payload: CobroPayload) => Promise<CobroResultado>;
  cancelar: (key: string) => Promise<EstadoIntento>;
  consultar: (key: string) => Promise<EstadoIntento>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const decimalNoNegativo = (value: unknown) => montoCentavos(value) !== null;
const validResult = (value: CobroResultado) =>
  value &&
  typeof value.ventaId === "string" &&
  !!value.ventaId &&
  typeof value.folio === "string" &&
  !!value.folio &&
  totalVerificado(value.total) &&
  decimalNoNegativo(value.totalCobrado) &&
  decimalNoNegativo(value.cambioDado);
const failureMessage = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo preparar el cobro";
const mutex = new Set<string>();
export type Recuperacion =
  | {
      estado:
        | "ninguno"
        | "legacy"
        | "processing"
        | "not_found"
        | "incierto"
        | "cancelado"
        | "anulado";
    }
  | { estado: "conciliar"; folio: string; ventaEstado: string }
  | { estado: "confirmado"; venta: CobroResultado }
  | { estado: "rechazado"; mensaje: string };

function decode(raw: string, owner: string): CobroPayload | null {
  try {
    const record = JSON.parse(raw);
    const p = record.payload as CobroPayload;
    if (
      record.version !== 1 ||
      record.owner !== owner ||
      !p ||
      !uuid.test(p.idempotencyKey) ||
      typeof p.sucursalId !== "string" ||
      !p.sucursalId ||
      typeof p.cajaId !== "string" ||
      !p.cajaId ||
      p.canal !== "pos" ||
      !totalVerificado(p.expectedTotal)
    )
      return null;
    if (
      !Array.isArray(p.lineas) ||
      !p.lineas.length ||
      p.lineas.length > 100 ||
      !p.lineas.every(
        (line) =>
          typeof line.varianteId === "string" &&
          !!line.varianteId &&
          /^\d+(\.\d{1,3})?$/.test(line.cantidad) &&
          Number(line.cantidad) > 0,
      )
    )
      return null;
    if (
      p.pagos?.length !== 1 ||
      p.pagos[0]?.metodo !== "efectivo" ||
      !calcularEfectivo(p.expectedTotal, p.pagos[0].monto)
    )
      return null;
    // Reconstrucción explícita evita reenviar propiedades inesperadas del almacenamiento.
    return {
      sucursalId: p.sucursalId,
      cajaId: p.cajaId,
      canal: "pos",
      idempotencyKey: p.idempotencyKey,
      expectedTotal: p.expectedTotal,
      lineas: p.lineas.map((line) => ({ varianteId: line.varianteId, cantidad: line.cantidad })),
      pagos: [{ metodo: "efectivo", monto: p.pagos[0].monto }],
    };
  } catch {
    return null;
  }
}
async function consultarResultado(
  owner: string,
  payload: CobroPayload,
  storage: CobroStorage,
  api: CobroAPI,
): Promise<Recuperacion> {
  const status = await api.consultar(payload.idempotencyKey);
  return resolverEstado(owner, payload, storage, status);
}
async function resolverEstado(
  owner: string,
  payload: CobroPayload,
  storage: CobroStorage,
  status: EstadoIntento,
): Promise<Recuperacion> {
  if (status.status === "cancelled") {
    await storage.delete(cobroPendienteKey(owner));
    return { estado: "anulado" };
  }
  if (status.status === "processing" || status.status === "not_found")
    return { estado: status.status };
  if (status.status !== "ready" || !validResult(status.result))
    throw new Error("Respuesta inválida");
  if (status.ventaEstado !== "cobrada")
    return { estado: "conciliar", folio: status.result.folio, ventaEstado: status.ventaEstado };
  const tender = calcularEfectivo(payload.expectedTotal, payload.pagos[0]?.monto ?? "");
  if (
    !tender ||
    montoCentavos(status.result.total) !== montoCentavos(payload.expectedTotal) ||
    montoCentavos(status.result.totalCobrado) !== montoCentavos(tender.monto) ||
    montoCentavos(status.result.cambioDado) !== montoCentavos(tender.cambio)
  )
    throw new Error("Los importes del intento no corresponden al efectivo recibido");
  await storage.delete(cobroPendienteKey(owner));
  return { estado: "confirmado", venta: status.result };
}
export async function recuperarCobro(
  owner: string,
  storage: CobroStorage,
  api: CobroAPI,
  vigente: () => boolean,
  accion: "consultar" | "reenviar" | "cancelar" = "consultar",
): Promise<Recuperacion> {
  if (mutex.has(owner)) return { estado: "processing" };
  mutex.add(owner);
  try {
    const raw = await storage.get(cobroPendienteKey(owner));
    if (raw === null) return { estado: "ninguno" };
    const payload = decode(raw, owner);
    if (!payload) return { estado: "legacy" };
    if (!vigente()) return { estado: "cancelado" };
    if (accion === "cancelar") {
      const status = await api.cancelar(payload.idempotencyKey);
      return await resolverEstado(owner, payload, storage, status);
    }
    if (accion === "reenviar") {
      const result = await api.enviar(payload);
      if (!validResult(result)) throw new Error("Respuesta inválida");
    }
    if (!vigente()) return { estado: "cancelado" };
    return await consultarResultado(owner, payload, storage, api);
  } catch {
    return { estado: "incierto" };
  } finally {
    mutex.delete(owner);
  }
}
export async function iniciarCobro(
  owner: string,
  input: { sucursalId: string; cajaId: string; lineas: LineaVenta[]; recibido: string },
  deps: {
    storage: CobroStorage;
    api: CobroAPI;
    vigente: () => boolean;
    validar: () => Promise<string>;
  },
): Promise<Recuperacion> {
  if (mutex.has(owner)) return { estado: "processing" };
  mutex.add(owner);
  let persisted = false;
  try {
    if ((await deps.storage.get(cobroPendienteKey(owner))) !== null) return { estado: "incierto" };
    const total = await deps.validar();
    const tender = calcularEfectivo(total, input.recibido);
    if (!tender)
      throw new Error("Escribe el efectivo recibido con hasta dos decimales y cubre el total.");
    if (!deps.vigente()) return { estado: "cancelado" };
    const prepared = await deps.api.preparar();
    if (!uuid.test(prepared.idempotencyKey))
      throw new Error("No se pudo preparar una clave de cobro válida");
    if (!deps.vigente()) return { estado: "cancelado" };
    const payload: CobroPayload = {
      sucursalId: input.sucursalId,
      cajaId: input.cajaId,
      lineas: input.lineas,
      canal: "pos",
      idempotencyKey: prepared.idempotencyKey,
      expectedTotal: total,
      pagos: [{ metodo: "efectivo", monto: tender.monto }],
    };
    if (!decode(JSON.stringify({ version: 1, owner, payload }), owner))
      throw new Error("Datos de cobro inválidos");
    await deps.storage.set(
      cobroPendienteKey(owner),
      JSON.stringify({ version: 1, owner, payload }),
    );
    persisted = true;
    if (!deps.vigente()) return { estado: "cancelado" };
    const result = await deps.api.enviar(payload);
    if (!validResult(result)) throw new Error("Respuesta inválida");
    if (!deps.vigente()) return { estado: "cancelado" };
    return await consultarResultado(owner, payload, deps.storage, deps.api);
  } catch (error) {
    return persisted
      ? { estado: "incierto" }
      : {
          estado: "rechazado",
          mensaje: failureMessage(error),
        };
  } finally {
    mutex.delete(owner);
  }
}
