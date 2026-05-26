import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";
import type { OcCreateInput, OcRecibirInput } from "./schemas.js";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

export class OrdenCompraError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OrdenCompraError";
  }
}

async function nextFolio(tx: Tx, sucursalId: string, sucursalCodigo: string): Promise<string> {
  const counter = await tx.ordenCompraFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `OC-${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

export interface CrearOcInput extends OcCreateInput {
  creadoPorUsuarioId: string;
}

export async function crearOc(
  client: TenantClient,
  input: CrearOcInput,
): Promise<{ id: string; folio: string }> {
  return client.$transaction(async (tx) => {
    const sucursal = await tx.sucursal.findUnique({
      where: { id: input.sucursalId },
      select: { codigo: true },
    });
    if (!sucursal) throw new OrdenCompraError(404, "Sucursal no encontrada");
    const folio = await nextFolio(tx, input.sucursalId, sucursal.codigo);
    let subtotal = new Decimal(0);
    let ivaTotal = new Decimal(0);
    const lineasData = input.lineas.map((l, idx) => {
      const importe = new Decimal(l.cantidad).times(l.precioUnitario);
      const iva = importe.times(l.ivaPct).dividedBy(100);
      subtotal = subtotal.plus(importe);
      ivaTotal = ivaTotal.plus(iva);
      return {
        numero: idx + 1,
        descripcion: l.descripcion,
        ...(l.productoId ? { productoId: l.productoId } : {}),
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        monto: importe.toFixed(4),
        ivaPct: l.ivaPct,
      };
    });
    const total = subtotal.plus(ivaTotal);
    const oc = await tx.ordenCompra.create({
      data: {
        folio,
        sucursalId: input.sucursalId,
        proveedorRfc: input.proveedorRfc,
        proveedorRazonSocial: input.proveedorRazonSocial,
        ...(input.proveedorEmail ? { proveedorEmail: input.proveedorEmail } : {}),
        ...(input.fechaEsperada ? { fechaEsperada: new Date(input.fechaEsperada) } : {}),
        ...(input.observaciones ? { observaciones: input.observaciones } : {}),
        estado: "borrador",
        subtotal: subtotal.toFixed(4),
        ivaTotal: ivaTotal.toFixed(4),
        total: total.toFixed(4),
        creadoPorUsuarioId: input.creadoPorUsuarioId,
        lineas: { create: lineasData },
      },
    });
    return { id: oc.id, folio: oc.folio };
  });
}

export async function autorizarOc(
  client: TenantClient,
  id: string,
  autorizadoPorId: string,
): Promise<void> {
  const oc = await client.ordenCompra.findUnique({ where: { id }, select: { estado: true } });
  if (!oc) throw new OrdenCompraError(404, "OC no encontrada");
  if (oc.estado !== "borrador") {
    throw new OrdenCompraError(409, `OC en estado ${oc.estado}; solo se autorizan borradores`);
  }
  await client.ordenCompra.update({
    where: { id },
    data: { estado: "enviada", autorizadoPorId, autorizadoAt: new Date() },
  });
}

export async function recibirOc(
  client: TenantClient,
  id: string,
  input: OcRecibirInput,
): Promise<{ estado: "recibida_parcial" | "recibida_total" }> {
  return client.$transaction(async (tx) => {
    const oc = await tx.ordenCompra.findUnique({
      where: { id },
      include: { lineas: true },
    });
    if (!oc) throw new OrdenCompraError(404, "OC no encontrada");
    if (oc.estado === "cancelada" || oc.estado === "recibida_total") {
      throw new OrdenCompraError(409, `OC en estado ${oc.estado}; no permite recibir`);
    }
    for (const recv of input.lineas) {
      const linea = oc.lineas.find((l) => l.id === recv.lineaId);
      if (!linea) throw new OrdenCompraError(404, `Línea ${recv.lineaId} no pertenece a OC`);
      const yaRecibida = new Decimal(linea.cantidadRecibida.toString());
      const ahora = new Decimal(recv.cantidadRecibida);
      const totalRecibida = yaRecibida.plus(ahora);
      if (totalRecibida.greaterThan(linea.cantidad.toString())) {
        throw new OrdenCompraError(
          409,
          `Recepción excede cantidad pedida en línea ${linea.numero}`,
          {
            lineaId: linea.id,
            cantidadPedida: linea.cantidad.toString(),
            yaRecibida: yaRecibida.toString(),
            intentada: ahora.toString(),
          },
        );
      }
      await tx.ordenCompraLinea.update({
        where: { id: linea.id },
        data: { cantidadRecibida: totalRecibida.toString() },
      });
    }
    const lineasActualizadas = await tx.ordenCompraLinea.findMany({
      where: { ordenCompraId: id },
    });
    const completa = lineasActualizadas.every((l) =>
      new Decimal(l.cantidadRecibida.toString()).equals(l.cantidad.toString()),
    );
    const nuevoEstado: "recibida_parcial" | "recibida_total" = completa
      ? "recibida_total"
      : "recibida_parcial";
    await tx.ordenCompra.update({
      where: { id },
      data: {
        estado: nuevoEstado,
        ...(completa ? { fechaRecepcion: new Date() } : {}),
      },
    });
    if (input.cfdiRecibidoId) {
      const cfdi = await tx.cfdiRecibido.findUnique({ where: { id: input.cfdiRecibidoId } });
      if (!cfdi) throw new OrdenCompraError(404, "CFDI recibido no encontrado para vincular");
      await tx.cfdiRecibido.update({
        where: { id: input.cfdiRecibidoId },
        data: { ordenCompraId: id },
      });
    }
    return { estado: nuevoEstado };
  });
}

export async function cancelarOc(client: TenantClient, id: string, motivo: string): Promise<void> {
  const oc = await client.ordenCompra.findUnique({ where: { id }, select: { estado: true } });
  if (!oc) throw new OrdenCompraError(404, "OC no encontrada");
  if (oc.estado === "recibida_total") {
    throw new OrdenCompraError(409, "OC ya recibida totalmente, no se puede cancelar");
  }
  if (oc.estado === "cancelada") {
    throw new OrdenCompraError(409, "OC ya cancelada");
  }
  await client.ordenCompra.update({
    where: { id },
    data: { estado: "cancelada", canceladaMotivo: motivo, canceladaAt: new Date() },
  });
}
