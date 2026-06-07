export interface LoginResponse {
  accessToken: string;
  usuario: { id: string; nombre: string; email: string; rol: "admin" | "comprador" };
  empresa: { razonSocial: string };
}

export interface CreditoResumen {
  lineaAutorizada: string;
  saldoCxcAbiertas: string;
  disponible: string;
  diasCredito: number;
}

export interface Me {
  empresa: {
    razonSocial: string;
    nombreComercial: string | null;
    rfc: string;
    condicionesPago: string;
    requiereOrdenCompra: boolean;
  };
  usuario: { nombre: string; email: string; rol: "admin" | "comprador" } | null;
  credito: CreditoResumen | null;
}

export interface VarianteCatalogo {
  varianteId: string;
  sku: string;
  nombreVariante: string | null;
  precioBase: string;
  precio: string;
  precioLista: boolean;
}

export interface ProductoCatalogo {
  productoId: string;
  nombre: string;
  skuPadre: string;
  categoria: string | null;
  variantes: VarianteCatalogo[];
}

export interface CatalogoResp {
  items: ProductoCatalogo[];
  total: number;
  page: number;
  pageSize: number;
  listaPrecioCodigo: string | null;
}

export interface CotizacionRow {
  id: string;
  folio: string;
  estado: string;
  total: string;
  fechaEmision: string;
  fechaVencimiento: string;
  vendedor: { nombre: string } | null;
}

export interface PedidoRow {
  id: string;
  folio: string;
  estado: string;
  estadoAprobacion: string;
  total: string;
  ordenCompraCliente: string | null;
  paqueteria: string | null;
  trackingExterno: string | null;
  trackingUrl: string | null;
  fechaEntregaEstimada: string | null;
  createdAt: string;
}

export interface CuentaCobrar {
  id: string;
  folio: string;
  estado: string;
  montoOriginal: string;
  montoPagado: string;
  fechaEmision: string;
  fechaVencimiento: string;
}

export interface EstadoCuenta {
  credito: CreditoResumen | null;
  cuentas: CuentaCobrar[];
}

export interface Direccion {
  id: string;
  etiqueta: string;
  calle: string;
  ciudad: string | null;
  estado: string | null;
  codigoPostal: string | null;
  isDefaultEnvio: boolean;
}
