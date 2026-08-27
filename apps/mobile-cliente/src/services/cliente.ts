import { api } from "@/lib/api";

export interface PerfilCliente {
  id: string;
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
}

export interface PedidoItem {
  id: string;
  folioPublico: string;
  total: string;
  statusPedido: string;
  statusPago: string;
  metodoEnvio: string | null;
  createdAt: string;
  statusLabel: string;
}

export interface NotificacionItem {
  id: string;
  titulo: string;
  cuerpo: string;
  tipo: string;
  link: string | null;
  leida: boolean;
  createdAt: string;
}

export interface NotificacionesResp {
  items: NotificacionItem[];
  noLeidas: number;
}

export function getPerfil(): Promise<PerfilCliente> {
  return api.get<PerfilCliente>("/cliente-portal/me");
}

export function listPedidos(): Promise<PedidoItem[]> {
  return api.get<PedidoItem[]>("/cliente-portal/pedidos");
}

export function listNotificaciones(): Promise<NotificacionesResp> {
  return api.get<NotificacionesResp>("/cliente-portal/notificaciones");
}

export function marcarLeida(id: string): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`/cliente-portal/notificaciones/${id}/leer`);
}

export function marcarTodasLeidas(): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>("/cliente-portal/notificaciones/leer-todas");
}

// ---- Detalle de pedido (timeline) ----

export interface PedidoHito {
  estado: string;
  label: string;
  completado: boolean;
  fecha: string | null;
}
export interface PedidoEvento {
  tipo: string;
  descripcion: string;
  fecha: string;
}
export interface PedidoDetalle {
  folioPublico: string;
  statusPedido: string;
  statusLabel: string;
  metodoEnvio: string | null;
  cancelado: boolean;
  total: string;
  subtotal: string;
  costoEnvio: string;
  items: Array<{ nombre: string; cantidad: string; precioUnitario: string; subtotal: string }>;
  guiaTracking: string | null;
  paqueteria: string | null;
  createdAt: string;
  hitos: PedidoHito[];
  eventos: PedidoEvento[];
}
export const getPedidoDetalle = (folio: string) =>
  api.get<PedidoDetalle>(`/cliente-portal/pedidos/${folio}`);

// ---- Direcciones ----

export interface Direccion {
  id: string;
  etiqueta: string;
  calle: string;
  numeroExterior: string | null;
  colonia: string | null;
  municipio: string | null;
  estado: string;
  codigoPostal: string;
  referencias: string | null;
  isDefaultEnvio: boolean;
}
export interface DireccionInput {
  etiqueta: string;
  calle: string;
  numeroExterior?: string;
  colonia?: string;
  municipio?: string;
  estado: string;
  codigoPostal: string;
  referencias?: string;
  isDefaultEnvio?: boolean;
}
export const listDirecciones = () => api.get<Direccion[]>("/cliente-portal/direcciones");
export const crearDireccion = (input: DireccionInput) =>
  api.post<Direccion>("/cliente-portal/direcciones", input);
export const eliminarDireccion = (id: string) => api.del<void>(`/cliente-portal/direcciones/${id}`);

// ---- Wishlist ----

export interface WishlistItem {
  itemId: string;
  productoPublicadoId: string;
  tituloPublico: string;
  precio: string;
  imagenUrl?: string | null;
}
export const listWishlist = () => api.get<WishlistItem[]>("/cliente-portal/wishlist");
export const quitarWishlist = (itemId: string) =>
  api.del<void>(`/cliente-portal/wishlist/items/${itemId}`);

// ---- Perfil ----

export const actualizarPerfil = (input: {
  nombre: string;
  apellidos?: string;
  telefono?: string;
}) => api.put<PerfilCliente>("/cliente-portal/me", input);
