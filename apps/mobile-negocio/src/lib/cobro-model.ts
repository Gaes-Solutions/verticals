import type { LineaVenta } from "../services/negocio";

export function montoCentavos(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null;
  const [whole = "", fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}
export function totalVerificado(total: unknown): total is string {
  const cents = montoCentavos(total);
  return cents !== null && cents > 0;
}
export function calcularEfectivo(
  total: unknown,
  recibido: string,
): { monto: string; cambio: string } | null {
  const due = montoCentavos(total);
  const paid = montoCentavos(recibido);
  if (due === null || due <= 0 || paid === null || paid < due) return null;
  return { monto: (paid / 100).toFixed(2), cambio: ((paid - due) / 100).toFixed(2) };
}

export async function validarAntesDeCobrar(
  input: {
    sucursalId: string;
    cajaId: string;
    total: string;
    lineas: LineaVenta[];
  },
  deps: {
    branches: () => Promise<Array<{ id: string; isActive: boolean; archivedAt?: string | null }>>;
    registers: (
      id: string,
    ) => Promise<Array<{ id: string; sucursalId: string; isActive: boolean }>>;
    opening: (branch: string, register: string) => Promise<boolean>;
    preview: (branch: string, lines: LineaVenta[]) => Promise<{ total: string }>;
  },
) {
  if (!totalVerificado(input.total) || !input.lineas.length) throw new Error("Total sin validar");
  const branches = await deps.branches();
  if (!branches.some((b) => b.id === input.sucursalId && b.isActive && !b.archivedAt))
    throw new Error("Sucursal no disponible");
  const registers = await deps.registers(input.sucursalId);
  if (
    !registers.some((c) => c.id === input.cajaId && c.sucursalId === input.sucursalId && c.isActive)
  )
    throw new Error("Caja no disponible");
  if (!(await deps.opening(input.sucursalId, input.cajaId)))
    throw new Error("Abre la caja desde el POS antes de cobrar");
  const fresh = await deps.preview(input.sucursalId, input.lineas);
  if (!totalVerificado(fresh.total) || montoCentavos(fresh.total) !== montoCentavos(input.total))
    throw new Error("El total cambió. Actualiza la cotización y revísala antes de cobrar");
  return fresh.total;
}

export interface CobroStorage {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
}
export const cobroPendienteKey = (owner: string) =>
  `pos_pending_${Array.from(owner)
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("")}`;
export async function consultarCobroPendiente(owner: string, storage: CobroStorage) {
  return (await storage.get(cobroPendienteKey(owner))) !== null;
}
