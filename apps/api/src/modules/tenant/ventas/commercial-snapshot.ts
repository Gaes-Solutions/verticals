import type { TenantPrismaClient } from "@gaespos/db";
import Decimal from "decimal.js";
import { z } from "zod";
import {
  type VarianteSnapshot,
  VentaError,
  type VentaPreparada,
  calcularImpuestosLinea,
  loadSnapshots,
} from "./service.js";

const amount = z.string().regex(/^\d+(\.\d+)?$/);
const productSchema = z.object({
  id: z.string().min(1),
  sku: z.string(),
  productoId: z.string().min(1),
  nombreProducto: z.string(),
  skuPadre: z.string(),
  nombreVariante: z.string().nullable(),
  marca: z.string().nullable(),
  categoria: z.string().nullable(),
  tipoVenta: z.enum(["unidad", "peso", "volumen", "tiempo", "servicio"]),
  claveSat: z.string().nullable(),
  claveUnidadSat: z.string().nullable(),
  aplicaIva: z.boolean(),
  tasaIva: amount,
  aplicaIeps: z.boolean(),
  tasaIeps: z
    .object({
      tipo: z.enum(["porcentaje", "cuota_por_unidad"]),
      valor: z.union([z.string(), z.number()]),
    })
    .nullable(),
});
const lineSchema = z.object({
  numero: z.number().int().positive(),
  cantidad: amount,
  precioOriginal: amount,
  precioUnitario: amount,
  descuentoUnitario: amount,
  subtotal: amount,
  ivaUnitario: amount,
  ivaTotal: amount,
  iepsUnitario: amount,
  iepsTotal: amount,
  descuento: amount,
  origen: z.enum(["articulo", "envio"]),
  snapshot: productSchema,
});
const snapshotSchema = z.object({
  version: z.literal(1),
  moneda: z.string().regex(/^[A-Z]{3}$/),
  sucursal: z.object({ id: z.string().min(1), codigo: z.string().min(1) }),
  subtotalArticulos: amount,
  descuentoTotal: amount,
  costoEnvio: amount,
  total: amount,
  ivaTotal: amount,
  iepsTotal: amount,
  lineas: z.array(lineSchema).min(1),
});
export type CommercialSnapshot = z.infer<typeof snapshotSchema>;
type SnapshotClient = Pick<
  TenantPrismaClient,
  "productoVariante" | "configTiendaEcommerce" | "sucursal"
>;
interface SnapshotInput {
  items: Array<{ varianteId: string; cantidad: string; subtotal: string }>;
  subtotal: Decimal;
  descuentoTotal: Decimal;
  costoEnvio: Decimal;
  moneda: string;
  sucursalPickupId?: string | undefined;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new VentaError(422, "El snapshot del pedido está incompleto");
  return value;
}

function allocateCents(total: Decimal, weights: Decimal[]): Decimal[] {
  const cents = total.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const sum = weights.reduce((acc, value) => acc.plus(value), new Decimal(0));
  if (sum.isZero()) {
    if (!cents.isZero()) throw new VentaError(422, "No se puede distribuir el importe del pedido");
    return weights.map(() => new Decimal(0));
  }
  const exact = weights.map((weight) => cents.mul(weight).div(sum));
  const allocated = exact.map((value) => value.floor());
  let remaining = cents
    .minus(allocated.reduce((acc, value) => acc.plus(value), new Decimal(0)))
    .toNumber();
  const order = exact
    .map((value, index) => ({ index, fraction: value.minus(required(allocated[index])) }))
    .sort((a, b) => b.fraction.cmp(a.fraction) || a.index - b.index);
  for (const entry of order) {
    if (remaining-- <= 0) break;
    allocated[entry.index] = required(allocated[entry.index]).plus(1);
  }
  return allocated.map((value) => value.div(100));
}

function makeLine(
  numero: number,
  cantidad: Decimal,
  gross: Decimal,
  discount: Decimal,
  snapshot: VarianteSnapshot,
  origen: "articulo" | "envio",
) {
  if (!cantidad.isFinite() || cantidad.lte(0) || gross.lt(discount))
    throw new VentaError(422, "Importes inválidos en el pedido");
  const net = gross.minus(discount);
  const taxes = calcularImpuestosLinea({ cantidad, subtotal: net }, snapshot);
  return {
    numero,
    cantidad: cantidad.toString(),
    precioOriginal: gross.div(cantidad).toFixed(4),
    precioUnitario: net.div(cantidad).toFixed(4),
    descuentoUnitario: discount.div(cantidad).toFixed(4),
    subtotal: net.toFixed(2),
    descuento: discount.toFixed(2),
    ivaUnitario: taxes.ivaUnit.toFixed(4),
    ivaTotal: taxes.ivaTotal.toFixed(4),
    iepsUnitario: taxes.iepsUnit.toFixed(4),
    iepsTotal: taxes.iepsTotal.toFixed(4),
    origen,
    snapshot,
  };
}

export async function crearSnapshotComercial(
  client: SnapshotClient,
  input: SnapshotInput,
): Promise<CommercialSnapshot> {
  const sucursal = await client.sucursal.findFirst({
    where: {
      ...(input.sucursalPickupId ? { id: input.sucursalPickupId } : {}),
      isActive: true,
      archivedAt: null,
    },
    select: { id: true, codigo: true },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
  });
  if (!sucursal) throw new VentaError(422, "No hay sucursal activa para preparar el pedido");
  const ids = [...new Set(input.items.map((item) => item.varianteId))];
  const active = await client.productoVariante.count({
    where: {
      id: { in: ids },
      isActive: true,
      archivedAt: null,
      producto: { isActive: true, archivedAt: null },
    },
  });
  if (active !== ids.length)
    throw new VentaError(422, "Uno o más artículos ya no están disponibles");
  const snapshots = await loadSnapshots(client, ids);
  const subtotal = input.subtotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const discount = input.descuentoTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const shipping = input.costoEnvio.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const gross = allocateCents(
    subtotal,
    input.items.map((item) => new Decimal(item.subtotal)),
  );
  const discounts = allocateCents(discount, gross);
  const lines = input.items.map((item, index) =>
    makeLine(
      index + 1,
      new Decimal(item.cantidad),
      required(gross[index]),
      required(discounts[index]),
      required(snapshots.get(item.varianteId)),
      "articulo",
    ),
  );
  if (shipping.gt(0)) {
    const config = await client.configTiendaEcommerce.findFirst({
      select: { envioVarianteId: true },
    });
    const service = config?.envioVarianteId
      ? await client.productoVariante.findFirst({
          where: {
            id: config.envioVarianteId,
            isActive: true,
            archivedAt: null,
            producto: { tipoVenta: "servicio", isActive: true, archivedAt: null },
          },
          select: { id: true },
        })
      : null;
    if (!service)
      throw new VentaError(422, "Configura un servicio de envío activo antes de cobrar envíos", {
        code: "SHIPPING_SERVICE_REQUIRED",
      });
    const shippingSnapshot = required((await loadSnapshots(client, [service.id])).get(service.id));
    lines.push(
      makeLine(
        lines.length + 1,
        new Decimal(1),
        shipping,
        new Decimal(0),
        shippingSnapshot,
        "envio",
      ),
    );
  }
  const total = subtotal.minus(discount).plus(shipping);
  if (total.lte(0))
    throw new VentaError(422, "El pedido debe tener un importe cobrable mayor a cero");
  return snapshotSchema.parse({
    version: 1,
    moneda: input.moneda,
    sucursal,
    subtotalArticulos: subtotal.toFixed(2),
    descuentoTotal: discount.toFixed(2),
    costoEnvio: shipping.toFixed(2),
    total: total.toFixed(2),
    ivaTotal: lines.reduce((acc, line) => acc.plus(line.ivaTotal), new Decimal(0)).toFixed(4),
    iepsTotal: lines.reduce((acc, line) => acc.plus(line.iepsTotal), new Decimal(0)).toFixed(4),
    lineas: lines,
  });
}

export function prepararVentaDesdeSnapshot(
  raw: unknown,
  usuarioId: string,
  pedido: {
    total: { toString(): string };
    moneda: string;
    metodoPago: string | null;
    clienteId: string | null;
  },
): VentaPreparada {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success)
    throw new VentaError(
      409,
      "El pedido no tiene snapshot comercial válido. Requiere conciliación.",
      { code: "COMMERCIAL_RECONCILIATION_REQUIRED" },
    );
  const snapshot = parsed.data;
  const total = new Decimal(snapshot.total);
  const lineTotal = snapshot.lineas.reduce((acc, line) => acc.plus(line.subtotal), new Decimal(0));
  if (
    !lineTotal.eq(total) ||
    !new Decimal(pedido.total.toString()).eq(total) ||
    pedido.moneda !== snapshot.moneda ||
    !new Decimal(snapshot.subtotalArticulos)
      .minus(snapshot.descuentoTotal)
      .plus(snapshot.costoEnvio)
      .eq(total)
  ) {
    throw new VentaError(409, "El snapshot no concilia con el importe del pedido", {
      code: "COMMERCIAL_RECONCILIATION_REQUIRED",
    });
  }
  const input = {
    sucursalId: snapshot.sucursal.id,
    canal: "ecommerce" as const,
    lineas: snapshot.lineas.map((line) => ({
      varianteId: line.snapshot.id,
      cantidad: line.cantidad,
    })),
    pagos: [
      {
        metodo:
          pedido.metodoPago === "tarjeta"
            ? ("tarjeta_credito" as const)
            : ("transferencia" as const),
        monto: total.toString(),
      },
    ],
    ...(pedido.clienteId ? { clienteId: pedido.clienteId } : {}),
  };
  return {
    moneda: snapshot.moneda,
    sucursal: snapshot.sucursal,
    input,
    usuarioId,
    lineasCalc: snapshot.lineas.map((line) => ({
      numero: line.numero,
      varianteId: line.snapshot.id,
      productoId: line.snapshot.productoId,
      cantidad: new Decimal(line.cantidad),
      precioUnitario: new Decimal(line.precioUnitario),
      precioOriginal: new Decimal(line.precioOriginal),
      descuentoUnitario: new Decimal(line.descuentoUnitario),
      subtotal: new Decimal(line.subtotal),
      ivaUnitario: new Decimal(line.ivaUnitario),
      ivaTotal: new Decimal(line.ivaTotal),
      iepsUnitario: new Decimal(line.iepsUnitario),
      iepsTotal: new Decimal(line.iepsTotal),
      totalLinea: new Decimal(line.subtotal),
      descuentosAplicados: new Decimal(line.descuento).gt(0)
        ? [{ fuente: "checkout", monto: line.descuento }]
        : [],
      snapshot: { ...line.snapshot, tasaIeps: line.snapshot.tasaIeps ?? null },
    })),
    totales: {
      subtotalVenta: new Decimal(snapshot.subtotalArticulos).plus(snapshot.costoEnvio),
      totalVenta: total,
      descuentoVenta: new Decimal(snapshot.descuentoTotal),
      ivaVenta: new Decimal(snapshot.ivaTotal),
      iepsVenta: new Decimal(snapshot.iepsTotal),
    },
    totalCobrado: total,
    cambio: new Decimal(0),
    pagoFiado: new Decimal(0),
    pagoCreditoB2b: new Decimal(0),
    pagoMonedero: new Decimal(0),
    cuponAplicado: false,
    promoResult: {
      aplicaciones: [],
      descuentoPromoTotal: "0",
      ticket: { lineas: [], subtotal: total, total, descuentosTicket: [] },
    },
  };
}
