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

/**
 * Reserva atómica de un uso del cupón: incrementa el contador SOLO si aún no se
 * agotó el tope global (`usosActuales < usosTotal`, o `usosTotal` nulo = ilimitado).
 * El guard `WHERE` + `increment` es un compare-and-swap que Postgres serializa a
 * nivel de fila, así que dos checkouts concurrentes no pueden redimir el mismo
 * cupón por encima de su tope (cierra el TOCTOU del check-then-increment).
 * Devuelve `true` si obtuvo el uso; `false` si el cupón ya estaba agotado.
 */
export async function reservarUsoCupon(client: TenantClient, codigo: string): Promise<boolean> {
  const res = await client.cuponTenant.updateMany({
    where: {
      codigo,
      OR: [{ usosTotal: null }, { usosActuales: { lt: client.cuponTenant.fields.usosTotal } }],
    },
    data: { usosActuales: { increment: 1 } },
  });
  return res.count === 1;
}

/** Libera una reserva de cupón si el checkout falla tras reservarla (best-effort). */
export async function liberarUsoCupon(client: TenantClient, codigo: string): Promise<void> {
  await client.cuponTenant
    .updateMany({
      where: { codigo, usosActuales: { gt: 0 } },
      data: { usosActuales: { decrement: 1 } },
    })
    .catch(() => {});
}
