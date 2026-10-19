import { esObjeto } from "./direcciones-contract";

export interface ConfigCheckout {
  msiHabilitado: boolean;
  msiMeses: number[];
  msiMontoMinimo: string;
  cuponEnCheckout: boolean;
  envioGratisDesde: string | null;
  metodosPago?: string[];
  proveedorPago?: string | null;
  pagoPublicKey?: string | null;
  stripeAccountId?: string | null;
}
const importe = (v: unknown): v is string =>
  typeof v === "string" && /^\d{1,13}(?:\.\d{1,2})?$/.test(v);
const textoOpcional = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.length <= 500);
/** A successful HTTP response is not enough to enable payment controls. */
export function esConfigCheckout(value: unknown): value is ConfigCheckout {
  if (!esObjeto(value)) return false;
  return (
    value.consultaFallida !== true &&
    typeof value.msiHabilitado === "boolean" &&
    Array.isArray(value.msiMeses) &&
    value.msiMeses.length <= 24 &&
    value.msiMeses.every((m) => Number.isSafeInteger(m) && m > 1) &&
    typeof value.cuponEnCheckout === "boolean" &&
    importe(value.msiMontoMinimo) &&
    (value.envioGratisDesde === null || importe(value.envioGratisDesde)) &&
    (value.metodosPago === undefined ||
      (Array.isArray(value.metodosPago) &&
        value.metodosPago.length <= 3 &&
        new Set(value.metodosPago).size === value.metodosPago.length &&
        value.metodosPago.every((m) => ["tarjeta", "oxxo", "spei"].includes(m)))) &&
    textoOpcional(value.proveedorPago) &&
    textoOpcional(value.pagoPublicKey) &&
    textoOpcional(value.stripeAccountId)
  );
}
