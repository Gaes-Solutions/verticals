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
