import { api } from "../lib/api";

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
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

export interface VentaListItem {
  id: string;
  folio: string;
  total: string;
  estado: string;
  canal: string;
  createdAt: string;
  usuario?: { nombre: string } | null;
}

export interface ProductoItem {
  id: string;
  nombre: string;
  skuPadre: string;
  variantes: Array<{ precioBase: string }>;
}

export const getResumen = (dias: number) =>
  api.get<ResumenVentas>(`/t/reportes/resumen?dias=${dias}`);

export const listVentas = (canal?: string) => {
  const qs = new URLSearchParams({ pageSize: "30" });
  if (canal) qs.set("canal", canal);
  return api.get<Paged<VentaListItem>>(`/t/ventas?${qs.toString()}`);
};

export const listProductos = (q: string) =>
  api.get<Paged<ProductoItem>>(`/t/productos?pageSize=30&q=${encodeURIComponent(q)}`);

// ---- POS / Cobro ----

export interface VarianteItem {
  id: string;
  sku: string;
  precioBase: string;
  isDefault: boolean;
}

export interface ProductoPOS {
  id: string;
  nombre: string;
  skuPadre: string;
  variantes: VarianteItem[];
}

export interface Sucursal {
  id: string;
  nombre: string;
  codigo: string;
  isDefault: boolean;
}

export interface VentaPreview {
  subtotal: string;
  descuentoTotal: string;
  ivaTotal: string;
  total: string;
}

export interface VentaCreada {
  id: string;
  folio: string;
  total: string;
  estado: string;
}

export interface LineaVenta {
  varianteId: string;
  cantidad: string;
}

export const listSucursales = () => api.get<Sucursal[]>("/t/sucursales");

/** Busca productos para el POS (variantes con id + precio). */
export const buscarProductosPOS = (q: string) =>
  api.get<Paged<ProductoPOS>>(`/t/productos?pageSize=25&isActive=true&q=${encodeURIComponent(q)}`);

/** Previsualiza los totales (pricing + promos) sin cobrar. */
export const previewVenta = (sucursalId: string, lineas: LineaVenta[]) =>
  api.post<VentaPreview>("/t/ventas/preview", { sucursalId, canal: "pos", lineas });

/** Crea y cobra una venta en efectivo (POS). */
export const cobrarEfectivo = (sucursalId: string, lineas: LineaVenta[], montoTotal: string) =>
  api.post<VentaCreada>("/t/ventas", {
    sucursalId,
    canal: "pos",
    lineas,
    pagos: [{ metodo: "efectivo", monto: montoTotal }],
  });

// ---- Inventario ----

export interface InventarioItem {
  id: string;
  stockActual: string;
  stockMinimo: string;
  variante: {
    id: string;
    sku: string;
    nombreVariante: string | null;
    producto: { id: string; nombre: string; skuPadre: string };
  };
  sucursal: { id: string; codigo: string; nombre: string };
}

export type TipoAjuste = "ajuste_positivo" | "ajuste_negativo" | "merma" | "consumo_interno";

export const listInventario = (sucursalId?: string, soloBajos = false) => {
  const qs = new URLSearchParams({ pageSize: "80" });
  if (sucursalId) qs.set("sucursalId", sucursalId);
  if (soloBajos) qs.set("stockBajoMinimo", "true");
  return api.get<Paged<InventarioItem>>(`/t/inventario?${qs.toString()}`);
};

export const ajustarInventario = (input: {
  varianteId: string;
  sucursalId: string;
  tipo: TipoAjuste;
  cantidad: string;
  motivo: string;
}) => api.post<{ ok: boolean }>("/t/inventario/ajustes", input);

// ---- Pedidos (ecommerce) ----

export interface PedidoRow {
  id: string;
  folioPublico: string;
  cliente: { nombre: string } | null;
  metodoEnvio: string;
  statusPedido: string;
  statusPago: string;
  total: string;
  createdAt: string;
  statusLabel?: string;
}

export interface PedidoEvento {
  id: string;
  tipo: string;
  descripcion: string;
  createdAt: string;
}

export interface PedidoDetalle extends PedidoRow {
  subtotal: string;
  items: Array<{ nombre: string; cantidad: string; precioUnitario: string; subtotal: string }>;
  eventos: PedidoEvento[];
}

export interface ConfigEstados {
  estados: string[];
  etiquetas: Record<string, string>;
}

export const listPedidosEcom = (statusPedido?: string) => {
  const qs = statusPedido ? `?statusPedido=${encodeURIComponent(statusPedido)}` : "";
  return api.get<{ items: PedidoRow[] }>(`/t/pedidos-ecommerce${qs}`);
};

export const getConfigEstados = () => api.get<ConfigEstados>("/t/pedidos-ecommerce/config");

export const getPedidoDetalle = (id: string) =>
  api.get<PedidoDetalle>(`/t/pedidos-ecommerce/${id}`);

export const transicionarPedido = (id: string, nuevoEstado: string, motivo?: string) =>
  api.post<{ ok: boolean }>(`/t/pedidos-ecommerce/${id}/transicionar`, {
    nuevoEstado,
    ...(nuevoEstado === "cancelado" && motivo ? { motivo } : {}),
  });

// ---- Clientes (B2C) ----

export interface ClienteRow {
  id: string;
  tipo: string;
  isDefault: boolean;
  nombre: string;
  apellidos: string | null;
  emailPrincipal: string | null;
  telefonoPrincipal: string | null;
  rfc: string | null;
  _count?: { ventas: number };
}

export interface FiadoMovimiento {
  id: string;
  tipo: string;
  monto: string;
  createdAt: string;
}

export interface ClienteDetalle extends ClienteRow {
  fiado: { montoTotal: string; estado: string; movimientos: FiadoMovimiento[] } | null;
}

export const listClientes = (q: string) =>
  api.get<Paged<ClienteRow>>(`/t/clientes?pageSize=50&q=${encodeURIComponent(q)}`);

export const getClienteDetalle = (id: string) => api.get<ClienteDetalle>(`/t/clientes/${id}`);

// ---- Devoluciones (online) ----

export type MetodoReembolso =
  | "efectivo"
  | "tarjeta_misma"
  | "saldo_a_favor"
  | "vale"
  | "transferencia";

export interface Solicitud {
  id: string;
  folio: string;
  motivo: string;
  estado: string;
  createdAt: string;
  monto?: string | null;
  items: Array<{ nombre: string; cantidad: number }>;
  pedido: { folioPublico: string; emailComprador: string } | null;
  cliente: { nombre: string } | null;
}

export const listDevoluciones = (estado?: string) => {
  const qs = estado ? `?estado=${encodeURIComponent(estado)}` : "";
  return api.get<Solicitud[]>(`/t/devoluciones-online${qs}`);
};

export const aprobarDevolucion = (id: string, metodoReembolso: MetodoReembolso) =>
  api.post<{ ok: boolean }>(`/t/devoluciones-online/${id}/aprobar`, { metodoReembolso });

export const rechazarDevolucion = (id: string, motivo: string) =>
  api.post<{ ok: boolean }>(`/t/devoluciones-online/${id}/rechazar`, { motivo });

// ---- Compras (órdenes de compra) ----

export interface OcLinea {
  id: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  cantidadRecibida: string;
}

export interface OcRow {
  id: string;
  folio: string;
  proveedorRazonSocial: string;
  proveedorRfc: string;
  estado: string;
  total: string;
  createdAt: string;
  lineas: OcLinea[];
}

export const listOrdenesCompra = (estado?: string) => {
  const qs = estado ? `?estado=${encodeURIComponent(estado)}` : "";
  return api.get<{ items: OcRow[] }>(`/t/ordenes-compra${qs}`);
};

export const getOcDetalle = (id: string) => api.get<OcRow>(`/t/ordenes-compra/${id}`);

export const autorizarOc = (id: string) =>
  api.post<{ ok: boolean }>(`/t/ordenes-compra/${id}/autorizar`, {});

export const cancelarOc = (id: string, motivo: string) =>
  api.post<void>(`/t/ordenes-compra/${id}/cancelar`, { motivo });

/** Recibe todas las líneas pendientes (cantidad - ya recibida). */
export const recibirOcTodo = (id: string, lineas: OcLinea[]) => {
  const pend = lineas
    .map((l) => ({
      lineaId: l.id,
      cantidadRecibida: String(Number(l.cantidad) - Number(l.cantidadRecibida)),
    }))
    .filter((l) => Number(l.cantidadRecibida) > 0);
  return api.post<{ ok: boolean }>(`/t/ordenes-compra/${id}/recibir`, { lineas: pend });
};

// ---- Precios (listas) ----

export type TipoLista = "publico" | "mayoreo_nivel" | "cliente_individual";

export interface ListaResumen {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  _count?: { items: number };
}

export interface ListaItem {
  varianteId: string;
  precio: string;
  variante: { id: string; sku: string };
}

export interface ListaDetalle extends ListaResumen {
  items: ListaItem[];
}

export const listListasPrecios = () => api.get<ListaResumen[]>("/t/precios/listas");
export const getListaPrecios = (id: string) => api.get<ListaDetalle>(`/t/precios/listas/${id}`);
export const crearListaPrecios = (input: { codigo: string; nombre: string; tipo: TipoLista }) =>
  api.post<ListaResumen>("/t/precios/listas", input);

// ---- Promociones ----

export interface PromoItem {
  id: string;
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  status: string;
  vigenciaInicio: string;
  vigenciaFin?: string | null;
  acciones?: { valor?: number } | null;
}

export type AccionPromo = "activar" | "pausar" | "archivar";

export const listPromociones = () => api.get<PromoItem[]>("/t/promociones");
export const cambiarEstadoPromo = (id: string, accion: AccionPromo) =>
  api.post<{ ok: boolean }>(`/t/promociones/${id}/${accion}`, {});
