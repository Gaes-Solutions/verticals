import type { TenantPrismaClient } from "@gaespos/db";
import webpush from "web-push";

let vapidListo: boolean | null = null;

/** Configura VAPID una vez. Devuelve false si faltan llaves (push deshabilitado). */
function configurarVapid(): boolean {
  if (vapidListo !== null) return vapidListo;
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  if (!publicKey || !privateKey) {
    vapidListo = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:soporte@gaessoft.mx",
    publicKey,
    privateKey,
  );
  vapidListo = true;
  return true;
}

/** Llave pública VAPID para que el navegador genere la suscripción. */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | undefined;
}

export async function guardarSuscripcion(
  prisma: TenantPrismaClient,
  clienteId: string,
  sub: PushSubscriptionInput,
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      clienteId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      ...(sub.userAgent ? { userAgent: sub.userAgent } : {}),
    },
    update: { clienteId, p256dh: sub.p256dh, auth: sub.auth },
  });
}

export async function eliminarSuscripcion(
  prisma: TenantPrismaClient,
  clienteId: string,
  endpoint: string,
): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { clienteId, endpoint } });
}

export interface PushPayload {
  titulo: string;
  cuerpo: string;
  url?: string;
  tag?: string;
}

/**
 * Envía push a todas las suscripciones del cliente. Best-effort: si VAPID no
 * está configurado no hace nada; las suscripciones muertas (404/410) se
 * eliminan automáticamente.
 */
export async function enviarPushCliente(
  prisma: TenantPrismaClient,
  clienteId: string,
  payload: PushPayload,
): Promise<{ enviadas: number; eliminadas: number }> {
  if (!configurarVapid()) return { enviadas: 0, eliminadas: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { clienteId } });
  if (subs.length === 0) return { enviadas: 0, eliminadas: 0 };

  const body = JSON.stringify({
    title: payload.titulo,
    body: payload.cuerpo,
    ...(payload.url ? { url: payload.url } : {}),
    ...(payload.tag ? { tag: payload.tag } : {}),
  });

  let enviadas = 0;
  const muertas: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        enviadas++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) muertas.push(s.endpoint);
      }
    }),
  );
  if (muertas.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: muertas } } });
  }
  return { enviadas, eliminadas: muertas.length };
}
