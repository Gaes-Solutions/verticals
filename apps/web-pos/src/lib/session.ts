import type { Session } from "../App.js";
import { ApiError, api } from "./api.js";
import type { Caja, Sucursal } from "./types.js";

export interface RegisterSelection {
  sucursalId: string;
  cajaId: string;
}
export interface CashierIdentity {
  id: string;
  tenantSlug: string;
  nombre: string;
  permissions: string[];
}
export function selectionKey(identity: CashierIdentity): string {
  return `gaespos_pos_register:${encodeURIComponent(identity.tenantSlug)}:${encodeURIComponent(identity.id)}`;
}
export function readSelection(identity: CashierIdentity): RegisterSelection | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(selectionKey(identity)) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "sucursalId" in value &&
      "cajaId" in value &&
      typeof value.sucursalId === "string" &&
      typeof value.cajaId === "string"
    )
      return { sucursalId: value.sucursalId, cajaId: value.cajaId };
  } catch {}
  return null;
}
export function saveSelection(identity: CashierIdentity, selection: RegisterSelection): void {
  localStorage.setItem(selectionKey(identity), JSON.stringify(selection));
}
export async function verifyOpening(selection: RegisterSelection): Promise<boolean> {
  try {
    const opening = await api<{ cajaId: string; sucursalId: string }>(
      `/t/cajas/${encodeURIComponent(selection.cajaId)}/apertura-actual`,
    );
    if (opening.cajaId !== selection.cajaId || opening.sucursalId !== selection.sucursalId)
      throw new Error("La apertura no corresponde a la caja y sucursal seleccionadas.");
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw error;
  }
}
export async function openRegister(selection: RegisterSelection, amount: string): Promise<void> {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount))
    throw new Error("Escribe un fondo inicial válido con hasta dos decimales.");
  await api(`/t/cajas/${encodeURIComponent(selection.cajaId)}/aperturar`, {
    body: { montoInicial: amount },
  });
  if (!(await verifyOpening(selection)))
    throw new Error("No se pudo confirmar la apertura. Consulta el estado antes de continuar.");
}
export async function resolverSession(
  cajeroNombre: string,
  selection: RegisterSelection,
): Promise<Session> {
  const sucs = await api<Sucursal[]>("/t/sucursales");
  const activeBranches = sucs.filter((branch) => branch.isActive && !branch.archivedAt);
  const sucursal = activeBranches.find((s) => s.id === selection.sucursalId);
  if (!sucursal) throw new Error("El negocio no tiene sucursales activas configuradas");

  const cajas = await api<Caja[]>(`/t/cajas?sucursalId=${encodeURIComponent(sucursal.id)}`);
  const caja = cajas.find(
    (item) => item.isActive && item.sucursalId === sucursal.id && item.id === selection.cajaId,
  );
  if (!caja)
    throw new Error("La sucursal no tiene una caja activa. Revisa la configuración de cajas.");

  if (!(await verifyOpening(selection)))
    throw new Error(
      "La caja está cerrada. Registra la apertura y su fondo inicial antes de vender.",
    );
  return { cajeroNombre, sucursal, caja };
}
