import {
  type CuponInput,
  type LineaPrecioInput,
  type ReglaPrecioInput,
  type ReglaTipo,
  type TicketCalculado,
  calcularTicket,
} from "@gaespos/pricing";
import type { FastifyRequest } from "fastify";
import type { PreviewInput } from "./schemas.js";

type TenantClient = FastifyRequest["tenantPrisma"];

export class PreviewError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "PreviewError";
  }
}

async function loadLineasContext(
  client: TenantClient,
  input: PreviewInput,
): Promise<LineaPrecioInput[]> {
  const varianteIds = input.lineas.map((l) => l.varianteId);
  const variantes = await client.productoVariante.findMany({
    where: { id: { in: varianteIds } },
    include: {
      producto: { select: { id: true, categoriaId: true, permiteDescuento: true } },
      preciosEscalonados: { where: { isActive: true }, orderBy: { nivel: "asc" } },
    },
  });
  const variantesById = new Map(variantes.map((v) => [v.id, v]));
  const missing = varianteIds.filter((id) => !variantesById.has(id));
  if (missing.length) {
    throw new PreviewError(404, `Variantes inexistentes: ${missing.join(", ")}`);
  }

  const listaItems = input.listaPrecioCodigo
    ? await loadListaItems(client, input.listaPrecioCodigo, varianteIds)
    : new Map<
        string,
        { precio: string; precioMinimoNegociacion: string | null; incluyeIva: boolean }
      >();

  return input.lineas.map((linea) => {
    const variante = variantesById.get(linea.varianteId);
    if (!variante) throw new PreviewError(500, "variante perdida tras validación");
    const item = listaItems.get(linea.varianteId);
    return {
      productoVarianteId: variante.id,
      productoId: variante.producto.id,
      categoriaId: variante.producto.categoriaId,
      cantidad: linea.cantidad,
      precioBase: variante.precioBase.toString(),
      preciosEscalonados: variante.preciosEscalonados.map((e) => ({
        cantidadMinima: e.cantidadMinima.toString(),
        cantidadMaxima: e.cantidadMaxima === null ? null : e.cantidadMaxima.toString(),
        precioUnitario: e.precioUnitario.toString(),
      })),
      listaPrecioItem: item ?? null,
      permiteDescuento: variante.producto.permiteDescuento,
    };
  });
}

async function loadListaItems(
  client: TenantClient,
  codigo: string,
  varianteIds: string[],
): Promise<
  Map<string, { precio: string; precioMinimoNegociacion: string | null; incluyeIva: boolean }>
> {
  const lista = await client.listaPrecio.findUnique({
    where: { codigo },
    include: {
      items: { where: { varianteId: { in: varianteIds } } },
    },
  });
  if (!lista) throw new PreviewError(404, `Lista de precios "${codigo}" no encontrada`);
  if (!lista.isActive) throw new PreviewError(409, `Lista "${codigo}" inactiva`);
  const map = new Map<
    string,
    { precio: string; precioMinimoNegociacion: string | null; incluyeIva: boolean }
  >();
  for (const item of lista.items) {
    map.set(item.varianteId, {
      precio: item.precio.toString(),
      precioMinimoNegociacion:
        item.precioMinimoNegociacion === null ? null : item.precioMinimoNegociacion.toString(),
      incluyeIva: item.incluyeIva,
    });
  }
  return map;
}

async function loadReglasVigentes(client: TenantClient): Promise<ReglaPrecioInput[]> {
  const ahora = new Date();
  const reglas = await client.reglaPrecio.findMany({
    where: {
      isActive: true,
      OR: [{ vigenteDesde: null }, { vigenteDesde: { lte: ahora } }],
      AND: [{ OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }] }],
    },
    include: {
      productos: { select: { productoId: true } },
      categorias: { select: { categoriaId: true } },
    },
  });
  return reglas.map((r) => {
    const accion = r.accion as {
      tipo: "porcentaje" | "monto_fijo" | "precio_override";
      valor: string;
    };
    const condicionRaw = (r.condicion ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      tipo: r.tipo as ReglaTipo,
      prioridad: r.prioridad,
      stackable: r.stackable,
      excluyeProductosConEscalonado: r.excluyeProductosConEscalonado,
      condicion: {
        ...condicionRaw,
        ...(r.productos.length
          ? { productosAplicables: r.productos.map((p) => p.productoId) }
          : {}),
        ...(r.categorias.length
          ? { categoriasAplicables: r.categorias.map((c) => c.categoriaId) }
          : {}),
      },
      accion,
    };
  });
}

async function loadCupon(
  client: TenantClient,
  codigo: string | undefined,
): Promise<CuponInput | null> {
  if (!codigo) return null;
  const c = await client.cuponTenant.findUnique({ where: { codigo } });
  if (!c) throw new PreviewError(404, `Cupón "${codigo}" no encontrado`);
  if (!c.isActive) throw new PreviewError(409, `Cupón "${codigo}" inactivo`);
  const ahora = new Date();
  if (c.vigenteDesde && c.vigenteDesde > ahora) {
    throw new PreviewError(409, `Cupón "${codigo}" aún no vigente`);
  }
  if (c.vigenteHasta && c.vigenteHasta < ahora) {
    throw new PreviewError(409, `Cupón "${codigo}" expirado`);
  }
  if (c.usosTotal !== null && c.usosActuales >= c.usosTotal) {
    throw new PreviewError(409, `Cupón "${codigo}" agotado`);
  }
  return {
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo as CuponInput["tipo"],
    valor: c.valor.toString(),
    montoMinimoCompra: c.montoMinimoCompra === null ? null : c.montoMinimoCompra.toString(),
    productosAplicables: (c.productosAplicables as string[]) ?? [],
    categoriasAplicables: (c.categoriasAplicables as string[]) ?? [],
    clientesAplicables: (c.clientesAplicables as string[]) ?? [],
  };
}

export async function calcularPreview(
  client: TenantClient,
  usuarioId: string,
  input: PreviewInput,
): Promise<TicketCalculado> {
  const lineas = await loadLineasContext(client, input);
  const reglas = await loadReglasVigentes(client);
  const cupon = await loadCupon(client, input.cuponCodigo);

  return calcularTicket({
    lineas,
    contexto: { ...(input.clienteId ? { clienteId: input.clienteId } : {}), reglas },
    cupon,
    descuentoGlobal:
      input.descuentoGlobalPct !== undefined && input.descuentoGlobalPct !== null
        ? {
            porcentaje: input.descuentoGlobalPct,
            motivo: input.descuentoGlobalMotivo ?? "Descuento manual",
            usuarioId,
          }
        : null,
  });
}
