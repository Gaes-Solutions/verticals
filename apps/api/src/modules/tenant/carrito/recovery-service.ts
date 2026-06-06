import { randomBytes } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";
import type { EmailProvider } from "@gaespos/email";

export interface RecoveryOpts {
  /** Minutos sin actividad para considerar un carrito abandonado. */
  minutosInactividad?: number | undefined;
  /** Horas tras el abandono para el primer recordatorio. */
  horasPrimerRecordatorio?: number | undefined;
  /** Horas tras el abandono para el segundo (y último) recordatorio. */
  horasSegundoRecordatorio?: number | undefined;
  /** Base pública de la tienda para armar el link de recuperación. */
  urlBaseTienda?: string | undefined;
}

export interface RecoveryResult {
  marcados: number;
  recordatorios24h: number;
  recordatorios72h: number;
}

const DEFAULTS = {
  minutosInactividad: 60,
  horasPrimerRecordatorio: 24,
  horasSegundoRecordatorio: 72,
};

/**
 * Ciclo de recuperación de carritos (se dispara por worker/cron o manual):
 * 1) marca como abandonados los carritos activos sin actividad reciente y les
 *    asigna un recoveryCodigo, 2) manda hasta dos recordatorios por email a
 *    los que tienen correo (checkout iniciado sin pagar). Umbrales
 *    configurables por tenant en la llamada.
 */
export async function correrRecoveryCarritos(
  prisma: TenantPrismaClient,
  email: EmailProvider,
  opts: RecoveryOpts = {},
): Promise<RecoveryResult> {
  const cfg = {
    minutosInactividad: opts.minutosInactividad ?? DEFAULTS.minutosInactividad,
    horasPrimerRecordatorio: opts.horasPrimerRecordatorio ?? DEFAULTS.horasPrimerRecordatorio,
    horasSegundoRecordatorio: opts.horasSegundoRecordatorio ?? DEFAULTS.horasSegundoRecordatorio,
  };
  const inactivosDesde = new Date(Date.now() - cfg.minutosInactividad * 60_000);
  const paraMarcar = await prisma.carritoEcommerce.findMany({
    where: { status: "activo", updatedAt: { lte: inactivosDesde } },
    select: { id: true },
  });
  for (const c of paraMarcar) {
    await prisma.carritoEcommerce.update({
      where: { id: c.id },
      data: {
        status: "abandonado",
        abandonadoAt: new Date(),
        recoveryCodigo: `rec_${randomBytes(12).toString("hex")}`,
      },
    });
  }

  // El umbral se evalúa al momento de cada consulta: con umbral 0 (tenant
  // configurable) los recién marcados entran en este mismo ciclo
  const r24 = await enviarRecordatorios(prisma, email, {
    campo: "recordatorio24hAt",
    horasTrasAbandono: cfg.horasPrimerRecordatorio,
    urlBase: opts.urlBaseTienda,
  });
  const r72 = await enviarRecordatorios(prisma, email, {
    campo: "recordatorio72hAt",
    horasTrasAbandono: cfg.horasSegundoRecordatorio,
    urlBase: opts.urlBaseTienda,
  });

  return { marcados: paraMarcar.length, recordatorios24h: r24, recordatorios72h: r72 };
}

async function enviarRecordatorios(
  prisma: TenantPrismaClient,
  email: EmailProvider,
  args: {
    campo: "recordatorio24hAt" | "recordatorio72hAt";
    horasTrasAbandono: number;
    urlBase: string | undefined;
  },
): Promise<number> {
  const pendientes = await prisma.carritoEcommerce.findMany({
    where: {
      status: "abandonado",
      abandonadoAt: { lte: new Date(Date.now() - args.horasTrasAbandono * 3_600_000) },
      [args.campo]: null,
      // el segundo recordatorio solo después del primero
      ...(args.campo === "recordatorio72hAt" ? { recordatorio24hAt: { not: null } } : {}),
    },
    include: { cliente: { select: { emailPrincipal: true } } },
  });

  let enviados = 0;
  for (const carrito of pendientes) {
    const destino = carrito.emailAnonimo ?? carrito.cliente?.emailPrincipal;
    if (!destino || !carrito.recoveryCodigo) continue;
    try {
      await email.enviarPlantilla({
        para: destino,
        plantilla: "carrito_recovery",
        datos: {
          recoveryCodigo: carrito.recoveryCodigo,
          urlCarrito: args.urlBase ? `${args.urlBase}/recovery/${carrito.recoveryCodigo}` : "",
        },
      });
      await prisma.carritoEcommerce.update({
        where: { id: carrito.id },
        data: { [args.campo]: new Date() },
      });
      enviados += 1;
    } catch {
      // best-effort: se reintenta en el siguiente ciclo
    }
  }
  return enviados;
}
