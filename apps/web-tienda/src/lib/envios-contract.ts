export interface OpcionEnvio {
  tarifaId: string;
  nombrePublico: string;
  paqueteria: string;
  costo: string;
  gratis: boolean;
  diasEntregaEstimados: number | null;
}
export interface OpcionPickup {
  sucursalId: string;
  nombre: string;
  tiempoPreparacionPromedioMin: number;
}
export interface CotizacionEnvio {
  opcionesEnvio: OpcionEnvio[];
  pickup: OpcionPickup[];
}
function texto(value: unknown, max: number): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= max;
}
function enteroPositivo(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
export function subtotalEnvioValido(value: string): boolean {
  return (
    value.length <= 64 &&
    /^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number.isSafeInteger(Math.round(Number(value) * 100))
  );
}
export function destinoEnvioValido(cp: string, estado: string): boolean {
  return /^\d{5}$/.test(cp) && (!estado || (estado.length >= 2 && estado.length <= 40));
}
/** Both empty arrays mean no coverage. Missing or corrupt arrays are a service error. */
export function leerCotizacionEnvio(value: unknown): CotizacionEnvio | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (!Array.isArray(c.opcionesEnvio) || !Array.isArray(c.pickup)) return null;
  const opcionesEnvio: OpcionEnvio[] = [];
  const pickup: OpcionPickup[] = [];
  for (const p of c.opcionesEnvio) {
    if (
      !p ||
      typeof p !== "object" ||
      !texto(p.tarifaId, 100) ||
      !texto(p.nombrePublico, 120) ||
      !texto(p.paqueteria, 60) ||
      typeof p.costo !== "string" ||
      !/^\d{1,13}(?:\.\d{1,2})?$/.test(p.costo) ||
      !Number.isSafeInteger(Math.round(Number(p.costo) * 100)) ||
      typeof p.gratis !== "boolean" ||
      (p.gratis && Number(p.costo) !== 0) ||
      (p.diasEntregaEstimados !== null && !enteroPositivo(p.diasEntregaEstimados)) ||
      opcionesEnvio.some((o) => o.tarifaId === p.tarifaId)
    )
      return null;
    opcionesEnvio.push({
      tarifaId: p.tarifaId,
      nombrePublico: p.nombrePublico,
      paqueteria: p.paqueteria,
      costo: p.costo,
      gratis: p.gratis,
      diasEntregaEstimados: p.diasEntregaEstimados,
    });
  }
  for (const p of c.pickup) {
    if (
      !p ||
      typeof p !== "object" ||
      !texto(p.sucursalId, 100) ||
      !texto(p.nombre, 200) ||
      !enteroPositivo(p.tiempoPreparacionPromedioMin) ||
      pickup.some((o) => o.sucursalId === p.sucursalId)
    )
      return null;
    pickup.push({
      sucursalId: p.sucursalId,
      nombre: p.nombre,
      tiempoPreparacionPromedioMin: p.tiempoPreparacionPromedioMin,
    });
  }
  return { opcionesEnvio, pickup };
}
export function errorCotizacion(status: number): string {
  if (status === 400) return "Revisa el código postal y el estado antes de calcular el envío.";
  if (status === 429) return "Hay demasiadas consultas. Espera un momento para volver a calcular.";
  return "No pudimos calcular el envío. Reintenta; esto no significa que tu zona esté sin cobertura.";
}
