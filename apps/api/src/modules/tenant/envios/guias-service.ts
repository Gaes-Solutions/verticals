import type { TenantPrismaClient } from "@gaespos/db";
import type {
  CrearGuiaInput,
  DireccionEnvio,
  GuiaCreada,
  Paquete,
  ShippingProvider,
  ShippingWebhookEvento,
  TarifaProveedor,
} from "@gaespos/paqueterias";
import type { ShippingProviderFactory } from "../../../plugins/paqueterias.js";
import { notificarCliente } from "../notificaciones/service.js";
import { enviarPushCliente } from "../push/service.js";

type TenantClient = TenantPrismaClient;

export class GuiaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "GuiaError";
  }
}

/** Carriers que mapean al enum EnvioPaqueteria; el resto cae en `otro`. */
type EnvioPaqueteriaEnum = "fedex" | "estafeta" | "paquete_express" | "huipix" | "propio" | "otro";
function carrierAEnum(carrier: string): EnvioPaqueteriaEnum {
  const c = carrier.toLowerCase().replace(/[\s_-]+/g, "");
  if (c.includes("fedex")) return "fedex";
  if (c.includes("estafeta")) return "estafeta";
  if (c.includes("paquetexpress") || c.includes("paqueteexpress")) return "paquete_express";
  if (c.includes("huipix")) return "huipix";
  return "otro";
}

function str(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** Normaliza una dirección guardada (JSON libre) a DireccionEnvio del proveedor. */
function aDireccionEnvio(
  raw: unknown,
  fallback: { nombre: string; telefono?: string },
): DireccionEnvio | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const cp = str(r, "cp", "codigoPostal", "codigo_postal", "postalCode");
  const estado = str(r, "estado", "state", "province");
  if (!cp || !estado) return null;
  const numero = str(r, "numero", "numeroExterior", "numero_exterior", "number");
  const colonia = str(r, "colonia", "neighborhood", "district");
  const ciudad = str(r, "ciudad", "city", "municipio");
  const telefono = str(r, "telefono", "phone") ?? fallback.telefono;
  const email = str(r, "email", "correo");
  const referencia = str(r, "referencia", "referencias", "reference");
  return {
    nombre: str(r, "nombre", "name") ?? fallback.nombre,
    calle: str(r, "calle", "street", "street1") ?? "—",
    ...(numero ? { numero } : {}),
    ...(colonia ? { colonia } : {}),
    cp,
    ...(ciudad ? { ciudad } : {}),
    estado,
    pais: str(r, "pais", "country", "countryCode", "country_code") ?? "MX",
    ...(telefono ? { telefono } : {}),
    ...(email ? { email } : {}),
    ...(referencia ? { referencia } : {}),
  };
}

/** Dirección de origen: la sucursal default (o la de pickup del pedido). */
async function resolverOrigen(
  client: TenantClient,
  sucursalPickupId: string | null,
): Promise<DireccionEnvio> {
  const sucursal = sucursalPickupId
    ? await client.sucursal.findUnique({ where: { id: sucursalPickupId } })
    : ((await client.sucursal.findFirst({ where: { isDefault: true } })) ??
      (await client.sucursal.findFirst()));
  if (!sucursal) throw new GuiaError(500, "No hay sucursal de origen para el envío");
  const dir = aDireccionEnvio(sucursal.direccion, {
    nombre: sucursal.nombre,
    ...(sucursal.telefono ? { telefono: sucursal.telefono } : {}),
  });
  if (!dir) {
    throw new GuiaError(
      422,
      "La sucursal de origen no tiene dirección completa (CP y estado) para generar la guía",
    );
  }
  return dir;
}

function paqueteDefault(pesoKg: number): Paquete {
  return { pesoKg: pesoKg > 0 ? pesoKg : 1, largoCm: 30, anchoCm: 25, altoCm: 15 };
}

export interface GenerarGuiaOpts {
  /** Tarifa concreta elegida en el admin; si falta se toma la más barata. */
  rateId?: string | undefined;
}

export interface GuiaPedidoResult {
  guia: GuiaCreada;
  pedidoId: string;
  folioPublico: string;
}

/**
 * Genera (o regenera) la guía de un pedido con el proveedor dado: cotiza,
 * elige tarifa (la indicada o la más barata), crea la guía y persiste
 * EnvioPedido + datos de tracking en el pedido. Evento visible al cliente.
 */
export async function generarGuiaPedido(
  client: TenantClient,
  provider: ShippingProvider,
  pedidoId: string,
  opts: GenerarGuiaOpts = {},
): Promise<GuiaPedidoResult> {
  const pedido = await client.pedidoEcommerce.findUnique({
    where: { id: pedidoId },
    include: { envio: true },
  });
  if (!pedido) throw new GuiaError(404, "Pedido no encontrado");
  if (pedido.metodoEnvio !== "paqueteria") {
    throw new GuiaError(422, "El pedido no es de envío por paquetería");
  }
  if (pedido.envio?.guiaTracking) {
    throw new GuiaError(409, "El pedido ya tiene una guía generada");
  }

  const config = await client.configTiendaEcommerce.findFirst();
  const pesoDefault = config ? Number(config.paqueteriaPesoDefaultKg) : 1;
  const destino = aDireccionEnvio(pedido.direccionEnvio, { nombre: pedido.emailComprador });
  if (!destino) {
    throw new GuiaError(422, "El pedido no tiene dirección de envío completa (CP y estado)");
  }
  const origen = await resolverOrigen(client, pedido.sucursalPickupId);
  const paquete = paqueteDefault(pesoDefault);

  const rates = await provider.cotizar({ origen, destino, paquete });
  const rate: TarifaProveedor | undefined = opts.rateId
    ? rates.find((r) => r.rateId === opts.rateId)
    : [...rates].sort((a, b) => a.costo - b.costo)[0];
  if (!rate) throw new GuiaError(422, "No hay tarifas disponibles para esta guía");

  const crearInput: CrearGuiaInput = {
    rateId: rate.rateId,
    carrier: rate.carrier,
    servicio: rate.servicio,
    origen,
    destino,
    paquete,
    referencia: pedido.folioPublico,
  };
  const guia = await provider.crearGuia(crearInput);

  await client.envioPedido.upsert({
    where: { pedidoId },
    create: {
      pedidoId,
      paqueteria: carrierAEnum(guia.carrier),
      guiaTracking: guia.trackingNumber,
      etiquetaUrl: guia.etiquetaUrl,
      costoReal: guia.costo.toFixed(4),
      statusExterno: "creada",
      proveedorLogistico: provider.codigo,
      carrierReal: guia.carrier,
      guiaProveedorId: guia.guiaId,
      ...(guia.trackingUrl ? { trackingUrl: guia.trackingUrl } : {}),
    },
    update: {
      paqueteria: carrierAEnum(guia.carrier),
      guiaTracking: guia.trackingNumber,
      etiquetaUrl: guia.etiquetaUrl,
      costoReal: guia.costo.toFixed(4),
      statusExterno: "creada",
      proveedorLogistico: provider.codigo,
      carrierReal: guia.carrier,
      guiaProveedorId: guia.guiaId,
      ...(guia.trackingUrl ? { trackingUrl: guia.trackingUrl } : {}),
    },
  });

  await client.pedidoEcommerce.update({
    where: { id: pedidoId },
    data: {
      guiaTracking: guia.trackingNumber,
      paqueteria: carrierAEnum(guia.carrier),
      costoEnvioReal: guia.costo.toFixed(4),
      eventos: {
        create: {
          tipo: "guia_generada",
          descripcion: `Guía de envío generada (${guia.carrier}): ${guia.trackingNumber}`,
          visibleCliente: true,
          metadata: { trackingNumber: guia.trackingNumber, carrier: guia.carrier },
        },
      },
    },
  });

  return { guia, pedidoId, folioPublico: pedido.folioPublico };
}

export interface CotizarVivoInput {
  cp: string;
  estado: string;
  pesoKg?: number | undefined;
}

/**
 * Tarifas en vivo del proveedor para una entrega (cp+estado). Solo informativo:
 * el checkout sigue validando contra las tarifas manuales del tenant.
 */
export async function cotizarEnVivo(
  client: TenantClient,
  provider: ShippingProvider,
  input: CotizarVivoInput,
): Promise<TarifaProveedor[]> {
  const config = await client.configTiendaEcommerce.findFirst();
  const pesoDefault = config ? Number(config.paqueteriaPesoDefaultKg) : 1;
  const origen = await resolverOrigen(client, null);
  const destino: DireccionEnvio = {
    nombre: "Cliente",
    calle: "—",
    cp: input.cp,
    estado: input.estado,
    pais: "MX",
  };
  return provider.cotizar({
    origen,
    destino,
    paquete: paqueteDefault(input.pesoKg ?? pesoDefault),
  });
}

/** Cancela la guía con el proveedor y limpia los datos de tracking del pedido. */
export async function cancelarGuiaPedido(
  client: TenantClient,
  provider: ShippingProvider,
  pedidoId: string,
): Promise<{ status: string }> {
  const envio = await client.envioPedido.findUnique({ where: { pedidoId } });
  if (!envio?.guiaProveedorId) throw new GuiaError(404, "El pedido no tiene guía para cancelar");
  const result = await provider.cancelarGuia(envio.guiaProveedorId);
  if (result.status === "cancelada") {
    await client.envioPedido.update({
      where: { pedidoId },
      data: { statusExterno: "cancelada", guiaTracking: null, etiquetaUrl: null },
    });
    await client.pedidoEcommerce.update({
      where: { id: pedidoId },
      data: {
        guiaTracking: null,
        eventos: {
          create: {
            tipo: "guia_cancelada",
            descripcion: "La guía de envío fue cancelada",
            visibleCliente: false,
          },
        },
      },
    });
  }
  return { status: result.status };
}

/**
 * Auto-guía tras confirmarse el pago: si el tenant activó paqueteriaAutoGuia y
 * tiene proveedor configurado, genera la guía sola. Best-effort: cualquier
 * fallo (sin API keys, dirección incompleta) se traga y deja el alta manual.
 */
export async function intentarAutoGuia(
  client: TenantClient,
  factory: ShippingProviderFactory,
  pedidoId: string,
): Promise<void> {
  try {
    const config = await client.configTiendaEcommerce.findFirst();
    if (!config?.paqueteriaAutoGuia || !config.paqueteriaProvider) return;
    const proveedor = config.paqueteriaProvider;
    if (proveedor !== "skydropx" && proveedor !== "envia" && proveedor !== "mock") return;
    const provider = factory(proveedor);
    await generarGuiaPedido(client, provider, pedidoId);
  } catch {
    // best-effort: el admin puede generar la guía manualmente
  }
}

/** ¿El evento de envío debe disparar push para este tenant? */
async function pushHabilitadoPara(client: TenantClient, eventoKey: string): Promise<boolean> {
  const config = await client.configTiendaEcommerce.findFirst();
  if (!config?.pushHabilitado) return false;
  const eventos = Array.isArray(config.pushEventos) ? (config.pushEventos as string[]) : [];
  return eventos.includes(eventoKey);
}

/**
 * Procesa el webhook de la paquetería: agrega el evento al historial externo,
 * actualiza el estatus del pedido (enviado/en_camino/entregado) y notifica al
 * cliente (campana + push si está activado). Idempotente por estatus.
 */
export async function procesarWebhookEnvio(
  client: TenantClient,
  evento: ShippingWebhookEvento,
): Promise<{ pedidoId: string | null; statusPedido: string | null }> {
  const envio = await client.envioPedido.findFirst({
    where: { guiaTracking: evento.trackingNumber },
    include: { pedido: true },
  });
  if (!envio) return { pedidoId: null, statusPedido: null };
  const pedido = envio.pedido;

  const historial = Array.isArray(envio.eventosExternos)
    ? (envio.eventosExternos as unknown[])
    : [];
  historial.push({
    status: evento.status,
    statusRaw: evento.statusRaw,
    descripcion: evento.descripcion ?? null,
    ocurridoEn: (evento.ocurridoEn ?? new Date()).toISOString(),
  });
  await client.envioPedido.update({
    where: { id: envio.id },
    data: { statusExterno: evento.status, eventosExternos: historial as object },
  });

  const ESTADOS_PRE_ENVIO = ["pago_confirmado", "preparando", "listo_pickup"];
  let nuevoEstado: "enviado" | "en_camino" | "entregado" | null = null;
  let eventoKey: "enviado" | "entregado" | null = null;
  let descripcion = "";

  if (evento.status === "recolectada" && ESTADOS_PRE_ENVIO.includes(pedido.statusPedido)) {
    nuevoEstado = "enviado";
    eventoKey = "enviado";
    descripcion = "Tu pedido fue recolectado por la paquetería";
  } else if (
    evento.status === "en_transito" &&
    [...ESTADOS_PRE_ENVIO, "enviado"].includes(pedido.statusPedido)
  ) {
    nuevoEstado = "en_camino";
    eventoKey = "enviado";
    descripcion = "Tu pedido va en camino";
  } else if (evento.status === "entregado" && pedido.statusPedido !== "entregado") {
    nuevoEstado = "entregado";
    eventoKey = "entregado";
    descripcion = "Tu pedido fue entregado";
  } else if (evento.status === "excepcion") {
    await client.pedidoEcommerce.update({
      where: { id: pedido.id },
      data: {
        eventos: {
          create: {
            tipo: "envio_excepcion",
            descripcion: evento.descripcion ?? "Incidencia reportada por la paquetería",
            visibleCliente: true,
          },
        },
      },
    });
    return { pedidoId: pedido.id, statusPedido: pedido.statusPedido };
  }

  if (!nuevoEstado) return { pedidoId: pedido.id, statusPedido: pedido.statusPedido };

  await client.pedidoEcommerce.update({
    where: { id: pedido.id },
    data: {
      statusPedido: nuevoEstado,
      ...(nuevoEstado === "enviado" ? { enviadoAt: new Date() } : {}),
      ...(nuevoEstado === "entregado" ? { entregadoAt: new Date() } : {}),
      eventos: {
        create: {
          tipo: `pedido_${nuevoEstado}`,
          descripcion,
          visibleCliente: true,
          metadata: { trackingNumber: evento.trackingNumber },
        },
      },
    },
  });

  if (pedido.clienteId && eventoKey) {
    try {
      await notificarCliente(client, pedido.clienteId, {
        tipo: "pedido_estado",
        titulo: `Pedido ${pedido.folioPublico}: ${descripcion}`,
        cuerpo: descripcion,
        link: `/cuenta/pedidos/${pedido.folioPublico}`,
        metadata: { folioPublico: pedido.folioPublico, estado: nuevoEstado },
      });
      if (await pushHabilitadoPara(client, eventoKey)) {
        await enviarPushCliente(client, pedido.clienteId, {
          titulo: `Pedido ${pedido.folioPublico}`,
          cuerpo: descripcion,
          url: `/cuenta/pedidos/${pedido.folioPublico}`,
          tag: `pedido-${pedido.folioPublico}`,
        });
      }
    } catch {
      // best-effort
    }
  }

  return { pedidoId: pedido.id, statusPedido: nuevoEstado };
}
