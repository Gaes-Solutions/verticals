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
