import type { TenantPrismaClient } from "@gaespos/db";
import Decimal from "decimal.js";

type TenantClient = TenantPrismaClient;

export interface CuponEvaluado {
  valido: boolean;
  mensaje: string;
  codigo: string;
  descuentoSubtotal: string;
  envioGratis: boolean;
}

const ZERO = new Decimal(0);

/**
 * Evalúa un cupón de la tienda contra un subtotal. NUNCA lanza: si no aplica
 * devuelve `valido:false` con el motivo (para feedback en checkout y para no
 * romper la compra). Cupones a nivel pedido: monto_fijo / porcentaje / envío gratis.
 */
export async function evaluarCupon(
  client: TenantClient,
  codigo: string,
  subtotal: number,
): Promise<CuponEvaluado> {
  const base: CuponEvaluado = {
    valido: false,
    mensaje: "",
    codigo,
    descuentoSubtotal: "0.00",
    envioGratis: false,
  };
  const c = await client.cuponTenant.findUnique({ where: { codigo } });
  if (!c || !c.isActive) return { ...base, mensaje: "Cupón no válido" };

  const ahora = new Date();
  if (c.vigenteDesde && c.vigenteDesde > ahora) return { ...base, mensaje: "Cupón aún no vigente" };
  if (c.vigenteHasta && c.vigenteHasta < ahora) return { ...base, mensaje: "Cupón expirado" };
  if (c.usosTotal !== null && c.usosActuales >= c.usosTotal) {
    return { ...base, mensaje: "Cupón agotado" };
  }
  const sub = new Decimal(subtotal);
  if (c.montoMinimoCompra !== null && sub.lt(new Decimal(c.montoMinimoCompra.toString()))) {
    return { ...base, mensaje: `Compra mínima de $${Number(c.montoMinimoCompra).toFixed(2)}` };
  }

  const valor = new Decimal(c.valor.toString());
  if (c.tipo === "monto_fijo") {
    const desc = Decimal.min(valor, sub);
    return { ...base, valido: true, mensaje: "Cupón aplicado", descuentoSubtotal: desc.toFixed(2) };
  }
  if (c.tipo === "porcentaje") {
    const desc = sub.times(valor).div(100);
    return {
      ...base,
      valido: true,
      mensaje: `${valor.toFixed(0)}% de descuento`,
      descuentoSubtotal: Decimal.max(ZERO, desc).toFixed(2),
    };
  }
  if (c.tipo === "envio_gratis") {
    return { ...base, valido: true, mensaje: "Envío gratis con tu cupón", envioGratis: true };
  }
  return { ...base, mensaje: "Este cupón no aplica en compras en línea" };
}

/** Registra un uso del cupón (best-effort, tras crear el pedido). */
export async function registrarUsoCupon(client: TenantClient, codigo: string): Promise<void> {
  await client.cuponTenant
    .updateMany({ where: { codigo }, data: { usosActuales: { increment: 1 } } })
    .catch(() => {});
}
