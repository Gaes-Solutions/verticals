export interface LoginResponse {
  accessToken: string;
  user: { id: string; nombre: string; permissions: string[]; isOwner: boolean };
  tenant: { slug: string };
}

export interface Categoria {
  id: string;
  nombre: string;
  slug: string;
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
  aplicaIeps?: boolean;
  tasaIeps?: string | null;
  requiresBalanza?: boolean;
  isActive?: boolean;
  categoriaId?: string | null;
  variantes: Variante[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InventarioItem {
  id: string;
  varianteId: string;
  sucursalId: string;
  stockActual: string;
  stockMinimo: string;
  variante: { id: string; sku: string; producto: { id: string; nombre: string; skuPadre: string } };
  sucursal: { id: string; codigo: string; nombre: string };
}

export interface VentaListItem {
  id: string;
  folio: string;
  total: string;
  estado: string;
  canal: string;
  createdAt: string;
  usuario?: { nombre: string } | null;
}

export interface VentaDetalle {
  id: string;
  folio: string;
  estado: string;
  total: string;
  subtotal: string;
  impuestos: string;
  createdAt: string;
  lineas: Array<{
    id: string;
    numero: number;
    descripcion: string;
    cantidad: string;
    total: string;
  }>;
  pagos: Array<{ metodo: string; monto: string }>;
}

export interface Sucursal {
  id: string;
  codigo: string;
  nombre: string;
  isDefault?: boolean;
}

export interface ConfigTienda {
  activa?: boolean;
  subdominio?: string | null;
  nombre?: string | null;
  msiHabilitado?: boolean;
  msiMeses?: number[];
  msiMontoMinimo?: string | number | null;
  galeriaZoom?: boolean;
  mostrarRatingProducto?: boolean;
  cuponEnCheckout?: boolean;
  comprarAhora?: boolean;
  cancelacionCliente?: boolean;
  facturacionSelfService?: boolean;
  preguntasPublicas?: boolean;
  pasarelaPagoProvider?: "conekta" | "stripe" | null;
  paqueteriaProvider?: "skydropx" | "envia" | null;
  paqueteriaAutoGuia?: boolean;
  tarifasEnVivo?: boolean;
  paqueteriaPesoDefaultKg?: string | number | null;
  pushHabilitado?: boolean;
  pushEventos?: Array<"pago_confirmado" | "enviado" | "entregado">;
  politicasHtml?: Record<string, string>;
}

export interface ResumenVentas {
  desde: string;
  hasta: string;
  dias: number;
  totalPeriodo: number;
  numTickets: number;
  ticketPromedio: number;
  ivaPeriodo: number;
  porDia: Array<{ fecha: string; total: number; tickets: number }>;
  porCanal: Array<{ canal: string; total: number; tickets: number }>;
  topProductos: Array<{ productoId: string; nombre: string; cantidad: number; monto: number }>;
}
