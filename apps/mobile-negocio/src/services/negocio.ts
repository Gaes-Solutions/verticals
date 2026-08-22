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
