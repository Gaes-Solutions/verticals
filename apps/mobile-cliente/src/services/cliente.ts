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
