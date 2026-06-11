import type { FiscalProvider } from "@gaespos/fiscal";
import type { FastifyRequest } from "fastify";
import { emitirCfdi } from "../cfdis/service.js";

type TenantClient = FastifyRequest["tenantPrisma"];

export class FacturaClienteError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "FacturaClienteError";
  }
}

export interface DatosFiscalesCliente {
  rfcReceptor: string;
  razonSocialReceptor: string;
  codigoPostalReceptor: string;
  regimenFiscalReceptor: string;
  usoCfdi: string;
  formaPago: string;
  correoReceptor?: string | undefined;
}

async function pedidoFacturable(client: TenantClient, clienteId: string, folio: string) {
  const pedido = await client.pedidoEcommerce.findUnique({
    where: { folioPublico: folio },
    select: {
      id: true,
      clienteId: true,
      folioPublico: true,
      statusPago: true,
      ventaIdGenerada: true,
      facturaCfdiId: true,
    },
  });
  if (!pedido || pedido.clienteId !== clienteId) {
    throw new FacturaClienteError(404, "Pedido no encontrado");
  }
  return pedido;
}

/** El cliente solicita su factura (CFDI) con sus datos fiscales. Reusa emitirCfdi. */
export async function emitirFacturaCliente(
  client: TenantClient,
  provider: FiscalProvider,
  clienteId: string,
  folio: string,
  datos: DatosFiscalesCliente,
): Promise<{ cfdiId: string; folioFiscal: string }> {
  const pedido = await pedidoFacturable(client, clienteId, folio);
  if (pedido.statusPago !== "pago_confirmado" || !pedido.ventaIdGenerada) {
    throw new FacturaClienteError(409, "El pedido aún no está pagado, no se puede facturar.");
  }
  if (pedido.facturaCfdiId) {
    throw new FacturaClienteError(409, "Este pedido ya tiene factura.");
  }

  const usuario = await client.usuario.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!usuario) throw new FacturaClienteError(500, "No hay un emisor configurado");

  // formaPago/usoCfdi se validan en la ruta; Facturama rechaza valores fuera de catálogo.
  const result = await emitirCfdi(client, provider, {
    ...datos,
    ventaId: pedido.ventaIdGenerada,
    emitidoPorId: usuario.id,
    esAutofactura: true,
  } as Parameters<typeof emitirCfdi>[2]);

  await client.pedidoEcommerce.update({
    where: { id: pedido.id },
    data: { facturaCfdiId: result.cfdiId, requiereFactura: true },
  });
  return result;
}

/** Devuelve la factura (CFDI) de un pedido del cliente: folio fiscal + PDF. */
export async function getFacturaCliente(
  client: TenantClient,
  clienteId: string,
  folio: string,
): Promise<{ folioFiscal: string | null; estado: string; pdfBase64: string | null } | null> {
  const pedido = await pedidoFacturable(client, clienteId, folio);
  if (!pedido.facturaCfdiId) return null;
  const cfdi = await client.cfdi.findUnique({
    where: { id: pedido.facturaCfdiId },
    select: { folioFiscal: true, estado: true, pdfBase64: true },
  });
  if (!cfdi) return null;
  return { folioFiscal: cfdi.folioFiscal, estado: cfdi.estado, pdfBase64: cfdi.pdfBase64 };
}
