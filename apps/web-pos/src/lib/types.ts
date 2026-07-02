export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    nombre: string;
    apellidos?: string | null;
    permissions: string[];
    isOwner: boolean;
  };
  tenant: { slug: string };
}

export interface Sucursal {
  id: string;
  codigo: string;
  nombre: string;
  isDefault?: boolean;
}

export interface Caja {
  id: string;
  codigo: string;
  nombre?: string | null;
}

export interface Variante {
  id: string;
  sku: string;
  nombreVariante?: string | null;
  precioBase: string;
}

export interface Producto {
  id: string;
  skuPadre: string;
  nombre: string;
  aplicaIva?: boolean;
  variantes: Variante[];
}

export interface ProductoList {
  items: Producto[];
  total: number;
  page: number;
  pageSize: number;
}

export type MetodoPago =
  | "efectivo"
  | "tarjeta_debito"
  | "tarjeta_credito"
  | "transferencia"
  | "monedero"
  | "credito_fiado";

export interface TicketLinea {
  varianteId: string;
  sku: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
}

export interface VentaResponse {
  ventaId: string;
  folio: string;
  total: string;
}

export interface VentaLineaDetalle {
  id: string;
  numero: number;
  descripcion: string;
  cantidad: string;
  total: string;
}

export interface VentaDetalle {
  id: string;
  folio: string;
  estado?: string;
  total: string;
  subtotal: string;
  ivaTotal: string;
  iepsTotal: string;
  cambio?: string | null;
  lineas: VentaLineaDetalle[];
  pagos: Array<{ metodo: string; monto: string }>;
}

export interface VentaListItem {
  id: string;
  folio: string;
  total: string;
  estado: string;
  createdAt: string;
}

export type MotivoDevolucion =
  | "defectuoso"
  | "cambio_opinion"
  | "talla_color"
  | "error_cobro"
  | "garantia"
  | "otro";

export type MetodoReembolso = "efectivo" | "tarjeta_misma" | "transferencia" | "vale";

export interface DevolucionResultado {
  devolucionId: string;
  folio?: string | null;
}

export interface Cliente {
  id: string;
  nombre: string;
  apellidos?: string | null;
  rfc?: string | null;
  telefonoPrincipal?: string | null;
  saldoMonedero?: string | null;
}

export interface ClienteList {
  items: Cliente[];
  total: number;
}

export interface AperturaActual {
  id: string;
  cajaId: string;
  montoInicial: string;
}

export interface Denominaciones {
  billetes: Record<string, number>;
  monedas: Record<string, number>;
}

export interface RecargaCompania {
  codigo: string;
  nombre: string;
  tipo: "tiempo_aire" | "pago_servicio";
  montosDisponibles: number[];
  permiteMontoCustom: boolean;
  montoMinimo?: number;
  montoMaximo?: number;
  requiereReferencia?: boolean;
  formatoReferencia?: string;
}

export interface RecargaCatalogo {
  companias: RecargaCompania[];
}

export interface RecargaResultado {
  id: string;
  folio: string;
  estado: "exitosa" | "fallida";
  folioProveedor: string | null;
  montoCobradoCliente: string;
}

export interface ApartadoLista {
  id: string;
  folio: string;
  estado: string;
  total: string;
  montoPagado: string;
  cliente?: { id: string; nombre: string; apellidos?: string | null } | null;
  _count?: { lineas: number; abonos: number };
}

export interface ApartadosPaged {
  items: ApartadoLista[];
  total: number;
}

export interface CorteResultado {
  corteId: string;
  tipo: "X" | "Z";
  diferencia: string;
}

export interface CfdiResultado {
  id: string;
  uuid?: string | null;
  estado?: string;
}
