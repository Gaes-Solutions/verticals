import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

export class TicketError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "TicketError";
  }
}

export interface TicketVenta {
  tipo: "venta";
  generadoAt: string;
  emisor: {
    rfc: string | null;
    razonSocial: string | null;
    sucursal: { codigo: string; nombre: string; telefono: string | null };
    caja: { codigo: string } | null;
    direccion: unknown;
  };
  venta: {
    folio: string;
    fecha: string;
    cajero: string;
    cliente: string | null;
    canal: string;
    moneda: string;
  };
  lineas: Array<{
    numero: number;
    sku: string;
    descripcion: string;
    cantidad: string;
    precioUnitario: string;
    subtotal: string;
    descuento: string;
  }>;
  pagos: Array<{ metodo: string; monto: string; ultimosCuatro: string | null }>;
  totales: {
    subtotal: string;
    descuentoTotal: string;
    ivaTotal: string;
    iepsTotal: string;
    total: string;
    totalCobrado: string;
    cambioDado: string;
  };
  cfdi: {
    folioFiscal: string;
    serie: string;
    folio: string;
    fechaTimbrado: string;
    selloDigitalCfdi: string;
    selloSat: string;
    noCertificadoSat: string;
    cadenaOriginalSat: string;
    rfcReceptor: string;
    razonSocialReceptor: string;
  } | null;
  autofactura: {
    urlPortal: string;
    expiraAt: string;
  } | null;
}

export async function generarTicketVenta(
  client: TenantClient,
  tenantSlug: string,
  ventaId: string,
): Promise<TicketVenta> {
  const venta = await client.venta.findUnique({
    where: { id: ventaId },
    include: {
      sucursal: true,
      caja: { select: { codigo: true } },
      usuario: { select: { nombre: true, apellidos: true } },
      lineas: { orderBy: { numero: "asc" } },
      pagos: { orderBy: { createdAt: "asc" } },
      cfdis: { where: { estado: "vigente" }, take: 1 },
    },
  });
  if (!venta) throw new TicketError(404, "Venta no encontrada");

  const cfdiVigente = venta.cfdis[0];
  const cfg = await client.cfdiConfig.findFirst();

  return {
    tipo: "venta",
    generadoAt: new Date().toISOString(),
    emisor: {
      rfc: cfg?.rfcEmisor ?? null,
      razonSocial: cfg?.razonSocialEmisor ?? null,
      sucursal: {
        codigo: venta.sucursal.codigo,
        nombre: venta.sucursal.nombre,
        telefono: venta.sucursal.telefono,
      },
      caja: venta.caja ? { codigo: venta.caja.codigo } : null,
      direccion: venta.sucursal.direccion,
    },
    venta: {
      folio: venta.folio,
      fecha: (venta.cobradaAt ?? venta.createdAt).toISOString(),
      cajero: [venta.usuario.nombre, venta.usuario.apellidos].filter(Boolean).join(" "),
      cliente: venta.clienteId,
      canal: venta.canal,
      moneda: venta.moneda,
    },
    lineas: venta.lineas.map((l) => {
      const snap = l.snapshotProducto as { sku?: string; nombreProducto?: string };
      return {
        numero: l.numero,
        sku: snap.sku ?? "",
        descripcion: snap.nombreProducto ?? snap.sku ?? "Producto",
        cantidad: l.cantidad.toString(),
        precioUnitario: l.precioUnitario.toString(),
        subtotal: l.subtotal.toString(),
        descuento: l.descuentoUnitario.mul(l.cantidad).toString(),
      };
    }),
    pagos: venta.pagos.map((p) => ({
      metodo: p.metodo,
      monto: p.monto.toString(),
      ultimosCuatro: p.ultimosCuatro,
    })),
    totales: {
      subtotal: venta.subtotal.toString(),
      descuentoTotal: venta.descuentoTotal.toString(),
      ivaTotal: venta.ivaTotal.toString(),
      iepsTotal: venta.iepsTotal.toString(),
      total: venta.total.toString(),
      totalCobrado: venta.totalCobrado.toString(),
      cambioDado: venta.cambioDado.toString(),
    },
    cfdi: cfdiVigente?.folioFiscal
      ? {
          folioFiscal: cfdiVigente.folioFiscal,
          serie: cfdiVigente.serie,
          folio: cfdiVigente.folio,
          fechaTimbrado: (cfdiVigente.fechaTimbrado ?? cfdiVigente.fechaEmision).toISOString(),
          selloDigitalCfdi: cfdiVigente.selloDigitalCfdi ?? "",
          selloSat: cfdiVigente.selloSat ?? "",
          noCertificadoSat: cfdiVigente.noCertificadoSat ?? "",
          cadenaOriginalSat: cfdiVigente.cadenaOriginalSat ?? "",
          rfcReceptor: cfdiVigente.rfcReceptor,
          razonSocialReceptor: cfdiVigente.razonSocialReceptor,
        }
      : null,
    autofactura: buildAutofacturaInfo(tenantSlug, venta, cfg),
  };
}

function buildAutofacturaInfo(
  tenantSlug: string,
  venta: { id: string; cobradaAt: Date | null; createdAt: Date },
  cfg: { autofacturaActiva: boolean; diasAutofactura: number } | null,
): TicketVenta["autofactura"] {
  if (!cfg?.autofacturaActiva) return null;
  const baseAt = venta.cobradaAt ?? venta.createdAt;
  const expiraAt = new Date(baseAt.getTime() + cfg.diasAutofactura * 86400000);
  return {
    urlPortal: `/autofactura/${tenantSlug}/venta/${venta.id}`,
    expiraAt: expiraAt.toISOString(),
  };
}

export interface TicketCorte {
  tipo: "corte";
  generadoAt: string;
  emisor: {
    sucursal: { codigo: string; nombre: string };
    caja: { codigo: string };
  };
  corte: {
    tipo: "X" | "Z";
    numero: number;
    desdeAt: string;
    hastaAt: string;
    cajero: string;
  };
  ventas: { count: number; canceladas: number; total: string };
  desglosePorMetodo: Record<string, string>;
  desgloseMovimientos: { entradas: string; salidas: string; neto: string };
  efectivo: { esperado: string; contado: string; diferencia: string };
  denominaciones: unknown;
  observaciones: string | null;
}

export async function generarTicketCorte(
  client: TenantClient,
  corteId: string,
): Promise<TicketCorte> {
  const corte = await client.corte.findUnique({
    where: { id: corteId },
    include: {
      apertura: {
        include: {
          caja: { select: { codigo: true } },
          usuario: { select: { nombre: true, apellidos: true } },
        },
      },
      usuario: { select: { nombre: true, apellidos: true } },
    },
  });
  if (!corte) throw new TicketError(404, "Corte no encontrado");
  const sucursal = await client.sucursal.findUnique({
    where: { id: corte.apertura.sucursalId },
  });
  if (!sucursal) throw new TicketError(404, "Sucursal no encontrada");

  return {
    tipo: "corte",
    generadoAt: new Date().toISOString(),
    emisor: {
      sucursal: { codigo: sucursal.codigo, nombre: sucursal.nombre },
      caja: { codigo: corte.apertura.caja.codigo },
    },
    corte: {
      tipo: corte.tipo,
      numero: corte.numero,
      desdeAt: corte.desdeAt.toISOString(),
      hastaAt: corte.hastaAt.toISOString(),
      cajero: [corte.usuario.nombre, corte.usuario.apellidos].filter(Boolean).join(" "),
    },
    ventas: {
      count: corte.ventasCount,
      canceladas: corte.ventasCanceladas,
      total: corte.ventasTotal.toString(),
    },
    desglosePorMetodo: corte.desglosePorMetodo as Record<string, string>,
    desgloseMovimientos: corte.desgloseMovimientos as {
      entradas: string;
      salidas: string;
      neto: string;
    },
    efectivo: {
      esperado: corte.efectivoEsperado.toString(),
      contado: corte.efectivoContado.toString(),
      diferencia: corte.diferencia.toString(),
    },
    denominaciones: corte.denominaciones,
    observaciones: corte.observaciones,
  };
}
