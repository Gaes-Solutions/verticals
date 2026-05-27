import type { EmailProvider } from "@gaespos/email";
import type { MessagingProvider } from "@gaespos/mensajeria";
import { renderHandlebars } from "@gaespos/mensajeria";
import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import { clientesDeSegmento } from "../segmentos/service.js";

type TenantClient = FastifyRequest["tenantPrisma"];

export class CampanaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "CampanaError";
  }
}

export interface CanalProviders {
  whatsapp?: MessagingProvider;
  sms?: MessagingProvider;
  email?: EmailProvider;
}

/**
 * Encola envíos de una campaña: resuelve los clientes del segmento, filtra
 * opt-outs del canal, y crea CampanaEnvio pendientes con el destino.
 */
export async function encolarEnvios(
  client: TenantClient,
  campanaId: string,
): Promise<{ encolados: number; omitidosOptOut: number; sinDestino: number }> {
  const campana = await client.campana.findUnique({ where: { id: campanaId } });
  if (!campana) throw new CampanaError(404, "Campaña no encontrada");
  if (!campana.segmentoId) throw new CampanaError(400, "Campaña sin segmento");
  const canal = campana.canal === "multi" ? "whatsapp" : campana.canal;

  const clienteIds = await clientesDeSegmento(client, campana.segmentoId);
  if (clienteIds.length === 0) return { encolados: 0, omitidosOptOut: 0, sinDestino: 0 };

  const clientes = await client.cliente.findMany({
    where: { id: { in: clienteIds } },
    select: { id: true, telefonoPrincipal: true, emailPrincipal: true },
  });
  const optOuts = await client.clienteOptOut.findMany({
    where: { clienteId: { in: clienteIds }, canal: canal as never },
    select: { clienteId: true },
  });
  const optOutSet = new Set(optOuts.map((o) => o.clienteId));

  let encolados = 0;
  let omitidosOptOut = 0;
  let sinDestino = 0;
  for (const c of clientes) {
    if (optOutSet.has(c.id)) {
      omitidosOptOut += 1;
      continue;
    }
    const destino = canal === "email" ? c.emailPrincipal : c.telefonoPrincipal;
    if (!destino) {
      sinDestino += 1;
      continue;
    }
    await client.campanaEnvio.create({
      data: { campanaId, clienteId: c.id, destino, canal: canal as never, status: "pendiente" },
    });
    encolados += 1;
  }
  await client.campana.update({ where: { id: campanaId }, data: { status: "programada" } });
  return { encolados, omitidosOptOut, sinDestino };
}

function dentroDeVentana(ventana: { desde?: string; hasta?: string }, fecha: Date): boolean {
  if (!ventana.desde || !ventana.hasta) return true;
  const hhmm = `${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;
  return hhmm >= ventana.desde && hhmm <= ventana.hasta;
}

export interface ProcesarColaResult {
  enviados: number;
  fallidos: number;
  omitidosVentana: number;
  presupuestoAgotado: boolean;
}

/**
 * Worker in-process: procesa envíos pendientes de una campaña respetando
 * ventana horaria y presupuesto. Envía via el provider del canal y actualiza
 * status + stats + créditos. (V1.5 → BullMQ con reintentos.)
 */
export async function procesarColaEnvios(
  client: TenantClient,
  campanaId: string,
  providers: CanalProviders,
  ahora: Date = new Date(),
): Promise<ProcesarColaResult> {
  const campana = await client.campana.findUnique({
    where: { id: campanaId },
    include: { plantilla: true },
  });
  if (!campana) throw new CampanaError(404, "Campaña no encontrada");

  const ventana = campana.ventanaHorarioEnvio as { desde?: string; hasta?: string };
  if (!dentroDeVentana(ventana, ahora)) {
    return { enviados: 0, fallidos: 0, omitidosVentana: -1, presupuestoAgotado: false };
  }

  const pendientes = await client.campanaEnvio.findMany({
    where: { campanaId, status: "pendiente" },
    include: { cliente: { select: { nombre: true } } },
    take: 500,
  });

  const plantilla = campana.plantilla;
  let consumido = new Decimal(campana.creditosConsumidos.toString());
  const presupuesto = new Decimal(campana.presupuestoMaxCreditos.toString());
  let enviados = 0;
  let fallidos = 0;
  let presupuestoAgotado = false;

  for (const envio of pendientes) {
    if (consumido.gte(presupuesto)) {
      presupuestoAgotado = true;
      break;
    }
    const variables: Record<string, string> = { nombre: envio.cliente?.nombre ?? "" };
    const contenido = plantilla
      ? renderHandlebars(plantilla.contenidoHandlebars, variables)
      : "Mensaje de campaña";
    try {
      let creditos = new Decimal(0);
      let proveedorMsgId = "";
      if (envio.canal === "email" && providers.email) {
        const r = await providers.email.enviar({
          para: envio.destino,
          asunto: plantilla?.asunto ?? campana.nombre,
          html: contenido,
        });
        proveedorMsgId = r.emailId;
        creditos = new Decimal(0.05);
      } else {
        const prov = envio.canal === "whatsapp" ? providers.whatsapp : providers.sms;
        if (!prov) throw new CampanaError(400, `Sin provider para canal ${envio.canal}`);
        const r = await prov.enviar({ destino: envio.destino, contenido });
        if (r.status !== "enviado") throw new Error("envío rechazado");
        proveedorMsgId = r.proveedorMsgId;
        creditos = new Decimal(r.creditos);
      }
      consumido = consumido.plus(creditos);
      await client.campanaEnvio.update({
        where: { id: envio.id },
        data: {
          status: "enviado",
          proveedorMsgId,
          creditos: creditos.toFixed(4),
          enviadoAt: ahora,
        },
      });
      enviados += 1;
    } catch (err) {
      await client.campanaEnvio.update({
        where: { id: envio.id },
        data: { status: "fallido", errorMensaje: err instanceof Error ? err.message : "error" },
      });
      fallidos += 1;
    }
  }

  const stats = (campana.stats as Record<string, number>) ?? {};
  await client.campana.update({
    where: { id: campanaId },
    data: {
      status: presupuestoAgotado ? "pausada" : "enviada",
      creditosConsumidos: consumido.toFixed(2),
      stats: {
        ...stats,
        sent: (stats.sent ?? 0) + enviados,
        failed: (stats.failed ?? 0) + fallidos,
      },
    },
  });

  return { enviados, fallidos, omitidosVentana: 0, presupuestoAgotado };
}

/**
 * Evalúa triggers de un evento (carrito_abandonado_24h, post_compra_review, etc.)
 * para un cliente: encola un envío de la campaña asociada si no excede la
 * frecuencia máxima por cliente en 30 días.
 */
export async function evaluarTriggers(
  client: TenantClient,
  evento: string,
  clienteId: string,
  destino: string,
): Promise<{ encolados: number }> {
  const triggers = await client.campanaTrigger.findMany({
    where: { evento, isActive: true },
    include: { campana: true },
  });
  let encolados = 0;
  const hace30d = new Date(Date.now() - 30 * 86_400_000);
  for (const t of triggers) {
    const recientes = await client.campanaEnvio.count({
      where: { campanaId: t.campanaId, clienteId, createdAt: { gte: hace30d } },
    });
    if (recientes >= t.frecuenciaMaxPorCliente30d) continue;
    const canal = t.campana.canal === "multi" ? "whatsapp" : t.campana.canal;
    await client.campanaEnvio.create({
      data: {
        campanaId: t.campanaId,
        clienteId,
        destino,
        canal: canal as never,
        status: "pendiente",
      },
    });
    encolados += 1;
  }
  return { encolados };
}
