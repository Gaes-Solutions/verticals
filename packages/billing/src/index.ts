/**
 * Motor de billing del SaaS (Hito 6). Funciones puras de:
 *  - Prorrateo Stripe-style al cambiar de plan (upgrade inmediato, downgrade
 *    al siguiente período).
 *  - Aplicación de cupones (percent/fixed, once/repeating/forever).
 *  - Cálculo del siguiente intento de dunning (días 1/3/7).
 *
 * Sin dependencias de Prisma/Fastify — testeable como caja negra.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ProrrateoResult {
  /** Cargo prorrateado a cobrar ahora (cents). Positivo = upgrade, negativo = downgrade (crédito). */
  amount: number;
  daysRemaining: number;
  daysInPeriod: number;
  oldDailyRate: number;
  newDailyRate: number;
}

/**
 * Stripe-style: cobra al cliente solo por los días restantes del nuevo precio
 * menos el crédito de los días no usados del precio anterior.
 *
 * upgrade: amount > 0 ⇒ se genera invoice prorrateada inmediata.
 * downgrade: amount < 0 ⇒ crédito que se descuenta del siguiente período (V1
 * lo retornamos para que el caller decida; el módulo backend puede recurrir
 * a aplicarlo en la próxima invoice).
 */
export function calcularProrrateo(params: {
  oldUnitAmount: number;
  newUnitAmount: number;
  periodStart: Date;
  periodEnd: Date;
  changeAt: Date;
}): ProrrateoResult {
  const daysInPeriod = Math.max(
    1,
    Math.round((params.periodEnd.getTime() - params.periodStart.getTime()) / MS_PER_DAY),
  );
  const daysRemaining = Math.max(
    0,
    Math.round((params.periodEnd.getTime() - params.changeAt.getTime()) / MS_PER_DAY),
  );
  const oldDailyRate = params.oldUnitAmount / daysInPeriod;
  const newDailyRate = params.newUnitAmount / daysInPeriod;
  const amount = Math.round((newDailyRate - oldDailyRate) * daysRemaining);
  return { amount, daysRemaining, daysInPeriod, oldDailyRate, newDailyRate };
}

export interface CouponInput {
  discountType: "percent" | "fixed";
  discountValue: number; // percent: 0..100 ; fixed: cents
  currency?: string | null | undefined;
}

export interface CouponApplyResult {
  amountAfter: number;
  discountApplied: number;
}

/**
 * Aplica un cupón a un monto. Percent es porcentaje 0..100; fixed es cents
 * (debe coincidir con la moneda del invoice, caller valida).
 */
export function aplicarCupon(amount: number, coupon: CouponInput): CouponApplyResult {
  if (coupon.discountType === "percent") {
    const pct = Math.max(0, Math.min(100, coupon.discountValue));
    const discountApplied = Math.round((amount * pct) / 100);
    return { amountAfter: Math.max(0, amount - discountApplied), discountApplied };
  }
  const discountApplied = Math.min(amount, Math.max(0, coupon.discountValue));
  return { amountAfter: amount - discountApplied, discountApplied };
}

/**
 * Calendario de reintentos de dunning (offsets en días desde dueDate).
 * Default Stripe-like: día 1, día 3, día 7. Tras el 3er intento ⇒ suspend.
 */
export const DUNNING_RETRY_DAYS = [1, 3, 7] as const;
export const DUNNING_MAX_ATTEMPTS = DUNNING_RETRY_DAYS.length;

export type DunningDecision =
  | { action: "retry"; nextRetryAt: Date; attemptNumber: number }
  | { action: "suspend"; attemptNumber: number };

/**
 * Dado el número de intentos previos y la fecha de vencimiento, decide qué
 * sigue. Tras DUNNING_MAX_ATTEMPTS fallidos ⇒ suspender el tenant.
 */
export function siguienteDunning(params: {
  attemptsSoFar: number;
  dueDate: Date;
}): DunningDecision {
  const nextAttemptNumber = params.attemptsSoFar + 1;
  if (nextAttemptNumber > DUNNING_MAX_ATTEMPTS) {
    return { action: "suspend", attemptNumber: nextAttemptNumber };
  }
  const offsetDays = DUNNING_RETRY_DAYS[nextAttemptNumber - 1] ?? 7;
  const nextRetryAt = new Date(params.dueDate.getTime() + offsetDays * MS_PER_DAY);
  return { action: "retry", nextRetryAt, attemptNumber: nextAttemptNumber };
}

/**
 * Avanza el período de facturación al siguiente ciclo (mensual/anual).
 */
export function siguientePeriodo(
  currentEnd: Date,
  interval: "monthly" | "yearly",
): { start: Date; end: Date } {
  const start = new Date(currentEnd);
  const end = new Date(currentEnd);
  if (interval === "monthly") {
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  }
  return { start, end };
}

/**
 * Genera un folio de invoice secuencial por año: INV-2026-000001.
 */
export function formatInvoiceNumber(year: number, seq: number): string {
  return `INV-${year}-${String(seq).padStart(6, "0")}`;
}
