export interface DireccionGuardada {
  id: string;
  etiqueta: string;
  calle: string;
  numeroExterior: string | null;
  colonia: string | null;
  municipio: string | null;
  estado: string | null;
  codigoPostal: string | null;
  referencias: string | null;
  isDefaultEnvio: boolean;
}
export function esObjeto(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function esDireccion(value: unknown): value is DireccionGuardada {
  if (!esObjeto(value) || typeof value.id !== "string" || !value.id.trim()) return false;
  if (
    typeof value.etiqueta !== "string" ||
    typeof value.calle !== "string" ||
    typeof value.isDefaultEnvio !== "boolean"
  )
    return false;
  return ["numeroExterior", "colonia", "municipio", "estado", "codigoPostal", "referencias"].every(
    (key) => value[key] === null || typeof value[key] === "string",
  );
}
export function esListaDirecciones(value: unknown): value is DireccionGuardada[] {
  return (
    Array.isArray(value) &&
    value.every(esDireccion) &&
    new Set(value.map((dir) => dir.id)).size === value.length
  );
}
export function direccionConfirmada(value: unknown, editando: boolean): boolean {
  if (!esObjeto(value)) return false;
  return editando ? value.ok === true : typeof value.id === "string" && !!value.id.trim();
}
