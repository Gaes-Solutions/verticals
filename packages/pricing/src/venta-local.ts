import { calcularTicket } from "./calculate.js";
import { aplicarPromocionesATicket, promoAplicaContexto } from "./promociones.js";
import type { PromoEvaluable } from "./promociones.js";
import type { LineaPrecioInput, ReglaPrecioInput } from "./types.js";
import {
  type LineaComprobante,
  type VarianteSnapshot,
  calcularLineasDeVenta,
  comprobanteDeLineas,
  totalesDeVenta,
} from "./venta-lineas.js";

/** Filas del catálogo que la caja guardó en el equipo, tal como bajan del servidor. */
export interface ProductoCatalogo {
  id: string;
  skuPadre: string;
  nombre: string;
  categoriaId: string | null;
  tipoVenta?: string;
  aplicaIva: boolean;
  tasaIva: string;
  aplicaIeps: boolean;
  tasaIeps: unknown;
  permiteDescuento: boolean;
}

export interface VarianteCatalogo {
  id: string;
  productoId: string;
  sku: string;
  nombreVariante: string | null;
  precioBase: string;
}

export interface ListaPrecioCatalogo {
  id: string;
  codigo: string;
}

export interface ItemListaCatalogo {
  listaPrecioId: string;
  varianteId: string;
  precio: string;
  precioMinimoNegociacion: string | null;
  incluyeIva: boolean;
}

export interface EscalonadoCatalogo {
  varianteId: string;
  nivel: number;
  cantidadMinima: string;
  cantidadMaxima: string | null;
  precioUnitario: string;
}

export interface ReglaCatalogo {
  id: string;
  tipo: string;
  prioridad: number;
  stackable: boolean;
  excluyeProductosConEscalonado: boolean;
  condicion: Record<string, unknown>;
  accion: Record<string, unknown>;
  productos: Array<{ productoId: string }>;
  categorias: Array<{ categoriaId: string }>;
}

export interface PromocionCatalogo {
  id: string;
  tipo: string;
  acciones: Record<string, unknown>;
  condiciones: Record<string, unknown>;
  prioridad: number;
  stackConOtras: boolean;
  horarios: unknown;
  canales: string[];
  sucursalesAplicables: string[];
  limiteUsosTotal: number | null;
  limiteUsosCliente: number | null;
  usosActuales: number;
  productos: Array<{ productoId: string; rol: string }>;
}

export interface CatalogoLocal {
  productos: ProductoCatalogo[];
  variantes: VarianteCatalogo[];
  listas: ListaPrecioCatalogo[];
  itemsLista: ItemListaCatalogo[];
  escalonados: EscalonadoCatalogo[];
  reglas: ReglaCatalogo[];
  promociones: PromocionCatalogo[];
}

export interface VentaLocalInput {
  lineas: Array<{ varianteId: string; cantidad: string }>;
  sucursalId: string;
  listaPrecioCodigo?: string | undefined;
  clienteId?: string | undefined;
  descuentoGlobalPct?: string | undefined;
  descuentoGlobalMotivo?: string | undefined;
  usuarioId: string;
  fecha?: Date;
}

export interface VentaLocalCalculada {
  lineas: LineaComprobante[];
  subtotal: string;
  descuentoTotal: string;
  ivaTotal: string;
  iepsTotal: string;
  total: string;
}

export class TicketLocalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketLocalError";
  }
}

function snapshotDe(producto: ProductoCatalogo, variante: VarianteCatalogo): VarianteSnapshot {
  return {
    id: variante.id,
    sku: variante.sku,
    nombreVariante: variante.nombreVariante,
    productoId: producto.id,
    nombreProducto: producto.nombre,
    skuPadre: producto.skuPadre,
    marca: null,
    categoria: null,
    aplicaIva: producto.aplicaIva,
    tasaIva: producto.tasaIva,
    aplicaIeps: producto.aplicaIeps,
    tasaIeps: producto.tasaIeps,
    ...(producto.tipoVenta ? { tipoVenta: producto.tipoVenta } : {}),
  };
}

function promosEvaluables(
  catalogo: CatalogoLocal,
  contexto: { sucursalId: string; fecha: Date; clienteId?: string | undefined },
  varianteAProducto: Map<string, string>,
): PromoEvaluable[] {
  return catalogo.promociones
    .filter((p) => {
      if (p.limiteUsosTotal !== null && p.usosActuales >= p.limiteUsosTotal) return false;
      // Un tope por cliente no se puede acotar sin cliente identificado; igual que el servidor.
      if (p.limiteUsosCliente !== null && !contexto.clienteId) return false;
      return true;
    })
    .sort((a, b) => a.prioridad - b.prioridad)
    .map((p) => ({
      id: p.id,
      tipo: p.tipo,
      acciones: p.acciones,
      condiciones: p.condiciones,
      prioridad: p.prioridad,
      stackConOtras: p.stackConOtras,
      horarios: p.horarios as PromoEvaluable["horarios"],
      canales: p.canales,
      sucursalesAplicables: p.sucursalesAplicables,
      productosIncluidos: new Set(
        p.productos.filter((x) => x.rol === "incluido").map((x) => x.productoId),
      ),
      productosExcluidos: new Set(
        p.productos.filter((x) => x.rol === "excluido").map((x) => x.productoId),
      ),
      productosComprados: new Set(
        p.productos
          .filter((x) => x.rol === "comprado" || x.rol === "requerido")
          .map((x) => x.productoId),
      ),
      productosRegalo: new Set(
        p.productos.filter((x) => x.rol === "regalo").map((x) => x.productoId),
      ),
    }))
    .filter((p) =>
      promoAplicaContexto(p, {
        canal: "pos",
        sucursalId: contexto.sucursalId,
        fecha: contexto.fecha,
        ...(contexto.clienteId ? { clienteId: contexto.clienteId } : {}),
        varianteAProducto,
      }),
    );
}

/**
 * Calcula el ticket con el catálogo guardado en el equipo, con el mismo motor que
 * usa el servidor: precios de lista y escalonados, reglas, promociones e impuestos.
 * La caja necesita el importe exacto para cobrar sin internet, y ese importe se
 * vuelve a verificar línea por línea cuando la venta se sincroniza.
 *
 * No evalúa cupones: un cupón tiene topes de uso que solo el servidor conoce.
 */
export function calcularVentaLocal(
  catalogo: CatalogoLocal,
  input: VentaLocalInput,
): VentaLocalCalculada {
  const fecha = input.fecha ?? new Date();
  const productos = new Map(catalogo.productos.map((p) => [p.id, p]));
  const variantes = new Map(catalogo.variantes.map((v) => [v.id, v]));
  const escalonados = new Map<string, EscalonadoCatalogo[]>();
  for (const e of [...catalogo.escalonados].sort((a, b) => a.nivel - b.nivel)) {
    escalonados.set(e.varianteId, [...(escalonados.get(e.varianteId) ?? []), e]);
  }
  const lista = input.listaPrecioCodigo
    ? catalogo.listas.find((l) => l.codigo === input.listaPrecioCodigo)
    : undefined;
  if (input.listaPrecioCodigo && !lista)
    throw new TicketLocalError(
      `La lista de precios "${input.listaPrecioCodigo}" no está en el catálogo del equipo`,
    );
  const itemsDeLista = new Map(
    catalogo.itemsLista
      .filter((i) => lista && i.listaPrecioId === lista.id)
      .map((i) => [i.varianteId, i]),
  );

  const snapshots = new Map<string, VarianteSnapshot>();
  const varianteAProducto = new Map<string, string>();
  const lineasPrecio: LineaPrecioInput[] = input.lineas.map((linea) => {
    const variante = variantes.get(linea.varianteId);
    const producto = variante ? productos.get(variante.productoId) : undefined;
    if (!variante || !producto)
      throw new TicketLocalError("Ese artículo no está en el catálogo guardado en este equipo");
    snapshots.set(variante.id, snapshotDe(producto, variante));
    varianteAProducto.set(variante.id, producto.id);
    const item = itemsDeLista.get(variante.id);
    return {
      productoVarianteId: variante.id,
      productoId: producto.id,
      categoriaId: producto.categoriaId,
      cantidad: linea.cantidad,
      precioBase: variante.precioBase,
      preciosEscalonados: (escalonados.get(variante.id) ?? []).map((e) => ({
        cantidadMinima: e.cantidadMinima,
        cantidadMaxima: e.cantidadMaxima,
        precioUnitario: e.precioUnitario,
      })),
      listaPrecioItem: item
        ? {
            precio: item.precio,
            precioMinimoNegociacion: item.precioMinimoNegociacion,
            incluyeIva: item.incluyeIva,
          }
        : null,
      permiteDescuento: producto.permiteDescuento,
    };
  });

  const reglas: ReglaPrecioInput[] = catalogo.reglas.map((r) => ({
    id: r.id,
    tipo: r.tipo as ReglaPrecioInput["tipo"],
    prioridad: r.prioridad,
    stackable: r.stackable,
    excluyeProductosConEscalonado: r.excluyeProductosConEscalonado,
    condicion: {
      ...r.condicion,
      ...(r.productos.length ? { productosAplicables: r.productos.map((p) => p.productoId) } : {}),
      ...(r.categorias.length
        ? { categoriasAplicables: r.categorias.map((c) => c.categoriaId) }
        : {}),
    },
    accion: r.accion as unknown as ReglaPrecioInput["accion"],
  }));

  const ticket = calcularTicket({
    lineas: lineasPrecio,
    contexto: { ...(input.clienteId ? { clienteId: input.clienteId } : {}), reglas },
    cupon: null,
    descuentoGlobal: input.descuentoGlobalPct
      ? {
          porcentaje: input.descuentoGlobalPct,
          motivo: input.descuentoGlobalMotivo ?? "Descuento manual",
          usuarioId: input.usuarioId,
        }
      : null,
  });

  const conPromos = aplicarPromocionesATicket(
    ticket,
    promosEvaluables(
      catalogo,
      {
        sucursalId: input.sucursalId,
        fecha,
        ...(input.clienteId ? { clienteId: input.clienteId } : {}),
      },
      varianteAProducto,
    ),
    varianteAProducto,
  );
  const lineasCalc = calcularLineasDeVenta(
    conPromos.ticket,
    input.lineas.map(() => ({})),
    snapshots,
  );
  const totales = totalesDeVenta(conPromos.ticket, lineasCalc);

  return {
    lineas: comprobanteDeLineas(lineasCalc),
    subtotal: totales.subtotalVenta.toString(),
    descuentoTotal: totales.descuentoVenta.toString(),
    ivaTotal: totales.ivaVenta.toString(),
    iepsTotal: totales.iepsVenta.toString(),
    total: totales.totalVenta.toString(),
  };
}
