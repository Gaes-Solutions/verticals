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

export type MetodoPago = "efectivo" | "tarjeta_debito" | "tarjeta_credito" | "transferencia";

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

export interface VentaDetalle {
  id: string;
  folio: string;
  total: string;
  subtotal: string;
  impuestos: string;
  cambio?: string | null;
  lineas: Array<{ numero: number; descripcion: string; cantidad: string; total: string }>;
  pagos: Array<{ metodo: string; monto: string }>;
}

export interface Cliente {
  id: string;
  nombre: string;
  apellidos?: string | null;
  rfc?: string | null;
  telefonoPrincipal?: string | null;
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
