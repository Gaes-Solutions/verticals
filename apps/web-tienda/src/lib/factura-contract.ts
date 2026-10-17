export interface FacturaEstado {
  folioFiscal: string | null;
  estado: string;
  disponible: boolean;
}

const nonempty = (value: unknown): value is string => typeof value === "string" && !!value.trim();
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function esEstadoFactura(value: unknown): value is FacturaEstado | null {
  if (value === null) return true;
  return (
    record(value) &&
    (value.folioFiscal === null || nonempty(value.folioFiscal)) &&
    nonempty(value.estado) &&
    typeof value.disponible === "boolean"
  );
}
export function esFacturaEmitida(value: unknown): value is { cfdiId: string; folioFiscal: string } {
  return record(value) && nonempty(value.cfdiId) && nonempty(value.folioFiscal);
}
