import type { Session } from "../App.js";
import { ApiError, api } from "./api.js";
import type { Caja, Sucursal } from "./types.js";

/**
 * Resuelve la sesión operativa tras autenticar: sucursal default + caja.
 * Intenta aperturar la caja (monto inicial 0) para habilitar cortes; si ya
 * está abierta (409 apertura activa) la usa igual; cualquier otro problema
 * cae a venta a nivel sucursal sin bloquear al cajero.
 */
export async function resolverSession(cajeroNombre: string): Promise<Session> {
  const sucs = await api<Sucursal[]>("/t/sucursales");
  const sucursal = sucs.find((s) => s.isDefault) ?? sucs[0];
  if (!sucursal) throw new Error("El negocio no tiene sucursales configuradas");

  const cajas = await api<Caja[]>("/t/cajas");
  let caja: Caja | null = cajas[0] ?? null;

  if (caja) {
    try {
      await api(`/t/cajas/${caja.id}/aperturar`, { body: { montoInicial: "0" } });
    } catch (err) {
      const yaAbierta = err instanceof ApiError && err.status === 409;
      if (!yaAbierta) caja = null; // sin permiso u otro error → vende sin caja
    }
  }
  return { cajeroNombre, sucursal, caja };
}
