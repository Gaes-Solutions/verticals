import { type CatalogoLocal, type VentaLocalCalculada, calcularVentaLocal } from "@gaespos/pricing";
import { type VentaOfflineCobrada, cobrarSinInternet } from "@gaespos/sync-client";
import type { Session } from "../App.js";
import { desktopScope, readCatalogAccess } from "./local-catalog.js";

/** Entidades del catálogo que hacen falta para llegar al mismo precio que el servidor. */
const ENTIDADES = [
  "producto",
  "variante",
  "lista_precio",
  "lista_precio_item",
  "precio_escalonado",
  "regla_precio",
  "promocion",
] as const;

export interface CalculoSinRedInput {
  lineas: Array<{ varianteId: string; cantidad: string }>;
  listaPrecioCodigo?: string | undefined;
  clienteId?: string | undefined;
}

export interface CobroSinRedInput extends CalculoSinRedInput {
  efectivo: string;
  cajaId: string;
  aperturaId: string;
}

export interface VentaSinRed extends VentaOfflineCobrada {
  calculo: VentaLocalCalculada;
  pendientes: number;
}

/** Lee el catálogo autorizado para esta sesión; sin él no se puede cobrar. */
async function catalogoGuardado(session: Session) {
  const access = await readCatalogAccess(desktopScope(session));
  if (!access)
    throw new Error(
      "Este equipo no tiene un catálogo autorizado para cobrar sin internet. Conéctate y vuelve a entrar.",
    );
  const { storage, grant } = access;
  const [productos, variantes, listas, itemsLista, escalonados, reglas, promociones] =
    await Promise.all(ENTIDADES.map((entidad) => storage.getCatalogRows(entidad, grant.catalogId)));
  const catalogo = {
    productos,
    variantes,
    listas,
    itemsLista,
    escalonados,
    reglas,
    promociones,
  } as unknown as CatalogoLocal;
  return { catalogo, storage };
}

/**
 * Lo que va a cobrar la caja sin internet, calculado con el mismo motor que el
 * servidor. Se muestra antes de cobrar: el cajero no debe cobrar a ciegas.
 */
export async function calcularSinRed(
  session: Session,
  input: CalculoSinRedInput,
): Promise<VentaLocalCalculada> {
  const usuarioId = session.identity?.id;
  if (!usuarioId)
    throw new Error("No se pudo verificar quién está en la caja; vuelve a iniciar sesión.");
  const { catalogo } = await catalogoGuardado(session);
  return calcularVentaLocal(catalogo, {
    lineas: input.lineas,
    sucursalId: session.sucursal.id,
    usuarioId,
    ...(input.listaPrecioCodigo ? { listaPrecioCodigo: input.listaPrecioCodigo } : {}),
    ...(input.clienteId ? { clienteId: input.clienteId } : {}),
  });
}

/**
 * Cobra sin internet: calcula con el catálogo del equipo y deja la venta en la
 * cola antes de dar el cobro por bueno. Si el catálogo no está disponible no se
 * cobra: adivinar un precio sería peor que decirle al cajero que no puede vender.
 */
export async function cobrarSinRed(
  session: Session,
  input: CobroSinRedInput,
): Promise<VentaSinRed> {
  const usuarioId = session.identity?.id;
  if (!usuarioId)
    throw new Error("No se pudo verificar quién está en la caja; vuelve a iniciar sesión.");
  const { catalogo, storage } = await catalogoGuardado(session);
  const calculo = calcularVentaLocal(catalogo, {
    lineas: input.lineas,
    sucursalId: session.sucursal.id,
    usuarioId,
    ...(input.listaPrecioCodigo ? { listaPrecioCodigo: input.listaPrecioCodigo } : {}),
    ...(input.clienteId ? { clienteId: input.clienteId } : {}),
  });

  const cobrada = await cobrarSinInternet(storage, {
    sucursalId: session.sucursal.id,
    cajaId: input.cajaId,
    aperturaId: input.aperturaId,
    lineas: input.lineas,
    pagos: [{ metodo: "efectivo", monto: input.efectivo }],
    total: calculo.total,
    comprobante: calculo.lineas,
    ...(input.listaPrecioCodigo ? { listaPrecioCodigo: input.listaPrecioCodigo } : {}),
    ...(input.clienteId ? { clienteId: input.clienteId } : {}),
  });

  const stats = await storage.getStats();
  return { ...cobrada, calculo, pendientes: stats.pending };
}

/** Cuántas ventas cobradas en este equipo siguen esperando confirmación del servidor. */
export async function ventasPorConfirmar(session: Session): Promise<number> {
  const access = await readCatalogAccess(desktopScope(session));
  if (!access) return 0;
  const stats = await access.storage.getStats();
  return stats.pending + stats.syncing + stats.failed + stats.conflict;
}

export interface PendientesDeCaja {
  cantidad: number;
  total: string;
}

/**
 * Lo cobrado en este equipo que el servidor todavía no asentó. El corte lo
 * necesita: ese efectivo está en el cajón pero aún no aparece en las ventas del
 * servidor, así que cerrar el turno sin avisar dejaría el corte descuadrado.
 */
export async function pendientesDeCaja(session: Session): Promise<PendientesDeCaja> {
  const access = await readCatalogAccess(desktopScope(session));
  if (!access) return { cantidad: 0, total: "0.00" };
  const entradas = await access.storage.getByStatus(
    ["pending", "syncing", "failed", "conflict"],
    200,
  );
  const ventas = entradas.filter((e) => e.operation.entityType === "venta");
  const centavos = ventas.reduce((acc, entrada) => {
    const payload = entrada.operation.payload as { expectedTotal?: unknown };
    const valor = typeof payload.expectedTotal === "string" ? Number(payload.expectedTotal) : 0;
    return acc + (Number.isFinite(valor) ? Math.round(valor * 100) : 0);
  }, 0);
  return { cantidad: ventas.length, total: (centavos / 100).toFixed(2) };
}

const APERTURA_KEY = "gaespos_pos_apertura";

/**
 * El turno de caja se abre con internet; el equipo lo recuerda para poder cobrar
 * si la conexión se cae después. El servidor lo verifica al sincronizar: si el
 * turno ya se cerró, la venta queda para revisión y no entra al turno nuevo.
 */
export function recordarApertura(cajaId: string, aperturaId: string): void {
  try {
    localStorage.setItem(`${APERTURA_KEY}:${cajaId}`, aperturaId);
  } catch {
    // Sin almacenamiento del navegador no se puede cobrar sin red; se avisa al intentar.
  }
}

export function aperturaRecordada(cajaId: string): string | null {
  try {
    return localStorage.getItem(`${APERTURA_KEY}:${cajaId}`);
  } catch {
    return null;
  }
}

export function olvidarApertura(cajaId: string): void {
  try {
    localStorage.removeItem(`${APERTURA_KEY}:${cajaId}`);
  } catch {
    // nada que limpiar
  }
}

export interface VentaRechazada {
  idempotencyKey: string;
  total: string;
  cobradaAt: string;
  motivo: string;
  intentos: number;
}

/**
 * Ventas cobradas en este equipo que el servidor rechazó (un precio que cambió,
 * un turno que se cerró). El dinero ya se recibió, así que el cajero tiene que
 * verlas y decidir; nunca se descartan solas.
 */
export async function ventasRechazadas(session: Session): Promise<VentaRechazada[]> {
  const access = await readCatalogAccess(desktopScope(session));
  if (!access) return [];
  const fallidas = await access.storage.getByStatus(["failed", "conflict"], 50);
  return fallidas
    .filter((entrada) => entrada.operation.entityType === "venta")
    .map((entrada) => {
      const payload = entrada.operation.payload as { expectedTotal?: unknown };
      return {
        idempotencyKey: entrada.operation.idempotencyKey,
        total: typeof payload.expectedTotal === "string" ? payload.expectedTotal : "0",
        cobradaAt: entrada.operation.localUpdatedAt ?? entrada.createdAt,
        motivo: entrada.lastError ?? "El servidor no aceptó la venta",
        intentos: entrada.attempts,
      };
    });
}

/** Vuelve a poner la venta en la cola para que el siguiente envío la intente. */
export async function reintentarVenta(session: Session, idempotencyKey: string): Promise<void> {
  const access = await readCatalogAccess(desktopScope(session));
  if (!access) throw new Error("No hay almacenamiento local para reintentar la venta");
  await access.storage.resolveConflict(idempotencyKey, "retry");
}
