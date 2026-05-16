import type Decimal from "decimal.js";

export type DecimalLike = Decimal | string | number;

export interface PrecioEscalonadoInput {
  cantidadMinima: DecimalLike;
  cantidadMaxima: DecimalLike | null;
  precioUnitario: DecimalLike;
}

export interface ListaPrecioItemInput {
  precio: DecimalLike;
  precioMinimoNegociacion: DecimalLike | null;
  incluyeIva: boolean;
}

export type ReglaTipo =
  | "descuento_global_por_monto"
  | "descuento_producto"
  | "descuento_categoria"
  | "descuento_cliente"
  | "bogo_compra_x_lleva_y"
  | "precio_temporada"
  | "mayoreo_por_total_ticket";

export type AccionTipo = "porcentaje" | "monto_fijo" | "precio_override";

export interface ReglaPrecioInput {
  id: string;
  tipo: ReglaTipo;
  prioridad: number;
  stackable: boolean;
  excluyeProductosConEscalonado: boolean;
  condicion: ReglaCondicion;
  accion: ReglaAccion;
}

export interface ReglaCondicion {
  productosAplicables?: string[];
  categoriasAplicables?: string[];
  clientesAplicables?: string[];
  cantidadMinima?: DecimalLike;
  montoMinimo?: DecimalLike;
  bogoCompraCantidad?: number;
  bogoLlevaCantidad?: number;
}

export interface ReglaAccion {
  tipo: AccionTipo;
  valor: DecimalLike;
}

export interface CuponInput {
  id: string;
  codigo: string;
  tipo: "monto_fijo" | "porcentaje" | "envio_gratis" | "producto_gratis";
  valor: DecimalLike;
  montoMinimoCompra: DecimalLike | null;
  productosAplicables?: string[];
  categoriasAplicables?: string[];
  clientesAplicables?: string[];
}

export interface DescuentoGlobalInput {
  porcentaje: DecimalLike;
  motivo: string;
  usuarioId: string;
}

export interface LineaPrecioInput {
  productoVarianteId: string;
  productoId: string;
  categoriaId: string | null;
  cantidad: DecimalLike;
  precioBase: DecimalLike;
  preciosEscalonados: PrecioEscalonadoInput[];
  listaPrecioItem: ListaPrecioItemInput | null;
  permiteDescuento: boolean;
}

export interface CalcularLineaContexto {
  clienteId?: string;
  reglas: ReglaPrecioInput[];
}

export interface DescuentoAplicado {
  paso: 1 | 2 | 3 | 4 | 5 | 6;
  fuente: "escalonado" | "lista_precio" | "regla_precio" | "ticket_mayoreo" | "cupon" | "manual";
  reglaId?: string;
  cuponId?: string;
  descripcion: string;
  montoTotal: DecimalLike;
}

export interface LineaCalculada {
  productoVarianteId: string;
  cantidad: DecimalLike;
  precioBase: DecimalLike;
  precioUnitario: DecimalLike;
  precioMinimoViolado: boolean;
  subtotal: DecimalLike;
  descuentos: DescuentoAplicado[];
}

export interface CalcularTicketInput {
  lineas: LineaPrecioInput[];
  contexto: CalcularLineaContexto;
  cupon: CuponInput | null;
  descuentoGlobal: DescuentoGlobalInput | null;
}

export interface TicketCalculado {
  lineas: LineaCalculada[];
  subtotal: DecimalLike;
  descuentosTicket: DescuentoAplicado[];
  total: DecimalLike;
}
