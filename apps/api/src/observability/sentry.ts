import * as Sentry from "@sentry/node";

let activo = false;

/**
 * Inicializa Sentry si hay `SENTRY_DSN` en el entorno. Sin DSN es no-op, así que
 * en dev/tests no hace nada. Llamar lo más temprano posible (antes de buildApp).
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "production",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    ...(process.env.SENTRY_RELEASE ? { release: process.env.SENTRY_RELEASE } : {}),
  });
  activo = true;
}

/** Reporta un error a Sentry (no-op si no está configurado). */
export function captureError(err: unknown, contexto?: Record<string, unknown>): void {
  if (!activo) return;
  Sentry.captureException(err, contexto ? { extra: contexto } : undefined);
}
