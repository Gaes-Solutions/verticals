import { getTenantClient, masterPrisma } from "@gaespos/db";
import type { FastifyBaseLogger } from "fastify";
import {
  type RecordatorioProviders,
  enviarRecordatoriosCitas,
} from "../modules/tenant/recordatorios/service.js";
import type { EmailProviderFactory } from "../plugins/email.js";
import type { MensajeriaProviderFactory } from "../plugins/mensajeria.js";

const TENANT_STATUS_ACTIVOS = ["trial", "active", "past_due"] as const;

/** Manda los recordatorios de citas próximas de cada tenant activo. */
export async function runRecordatoriosTodosLosTenants(
  log: FastifyBaseLogger,
  providers: RecordatorioProviders,
  baseUrl: string,
): Promise<{ tenants: number; enviadas: number }> {
  const tenants = await masterPrisma.tenant.findMany({
    where: { deletedAt: null, status: { in: [...TENANT_STATUS_ACTIVOS] } },
    select: { slug: true, name: true },
  });

  let enviadas = 0;
  for (const t of tenants) {
    try {
      const res = await enviarRecordatoriosCitas(getTenantClient(t.slug), providers, {
        tenantSlug: t.slug,
        clinicaNombre: t.name,
        baseUrl,
      });
      enviadas += res.enviadas;
      if (res.enviadas > 0 || res.fallidas > 0) {
        log.info({ tenant: t.slug, ...res }, "recordatorios de citas enviados");
      }
    } catch (err) {
      log.error({ err, tenant: t.slug }, "fallo al enviar recordatorios del tenant");
    }
  }
  return { tenants: tenants.length, enviadas };
}

/**
 * Arranca el scheduler de recordatorios de citas (pull-based, igual que flows).
 * Corre en proceso con `setInterval`; evita solaparse. Devuelve una función para
 * detenerlo en el shutdown.
 */
export function startRecordatoriosScheduler(
  log: FastifyBaseLogger,
  intervalMin: number,
  mensajeriaFactory: MensajeriaProviderFactory,
  emailFactory: EmailProviderFactory,
  baseUrl: string,
): () => void {
  const intervalMs = intervalMin * 60_000;
  let corriendo = false;

  const tick = async (): Promise<void> => {
    if (corriendo) return;
    corriendo = true;
    try {
      const providers: RecordatorioProviders = {
        whatsapp: mensajeriaFactory("whatsapp"),
        sms: mensajeriaFactory("sms"),
        email: emailFactory(),
      };
      const res = await runRecordatoriosTodosLosTenants(log, providers, baseUrl);
      log.info({ ...res, intervalMin }, "barrido de recordatorios completado");
    } catch (err) {
      log.error({ err }, "barrido de recordatorios falló");
    } finally {
      corriendo = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  log.info({ intervalMin }, "scheduler de recordatorios activo");

  return () => clearInterval(timer);
}
