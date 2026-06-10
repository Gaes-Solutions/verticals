import { cookies } from "next/headers";

/**
 * Auth del cliente de la tienda. A diferencia del BFF (token de servicio del
 * tenant), aquí cada comprador tiene SU sesión: el token de cliente vive en una
 * cookie httpOnly y se usa para llamar /cliente-portal/* con su identidad.
 */
const API_URL = process.env.API_URL ?? "http://localhost:3000";
export const TENANT_SLUG = process.env.TIENDA_TENANT_SLUG ?? "";
export const COOKIE = "gaespos_cliente_token";

export async function getClienteToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

/** Llama un endpoint del cliente-portal con el token del comprador. */
export async function clienteApi<T = unknown>(path: string): Promise<T> {
  const token = await getClienteToken();
  if (!token) throw new Error("Sin sesión de cliente");
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export interface ClienteMe {
  id: string;
  nombre: string;
  email: string | null;
}

export interface PedidoCliente {
  id: string;
  folioPublico: string;
  total: string;
  statusPedido: string;
  statusLabel: string;
  statusPago: string;
  metodoEnvio: string;
  createdAt: string;
}

export interface HitoPedido {
  estado: string;
  label: string;
  completado: boolean;
  actual: boolean;
  fecha: string | null;
}

export interface PedidoDetalleCliente {
  folioPublico: string;
  statusPedido: string;
  statusLabel: string;
  metodoEnvio: string;
  cancelado: boolean;
  canceladoMotivo: string | null;
  total: string;
  subtotal: string;
  costoEnvio: string;
  items: Array<{
    varianteId: string;
    nombre: string;
    cantidad: number;
    precioUnitario: string;
    subtotal: string;
  }>;
  direccionEnvio: Record<string, string> | null;
  guiaTracking: string | null;
  paqueteria: string | null;
  createdAt: string;
  hitos: HitoPedido[];
  eventos: Array<{ tipo: string; descripcion: string; fecha: string }>;
}

export interface NotificacionCliente {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  link: string | null;
  leida: boolean;
  createdAt: string;
}

export interface WishlistItem {
  itemId: string;
  productoPublicadoId: string;
  tituloPublico: string;
  slugSeo: string;
  precio: string;
  foto: string | null;
}

export interface CompraResenable {
  pedidoId: string;
  folioPublico: string;
  productoPublicadoId: string;
  tituloPublico: string;
  slugSeo: string;
  yaResenado: boolean;
}

/** Proxy al backend para registro/login; el route handler setea la cookie. */
export async function authClienteBackend(
  accion: "registro" | "login",
  body: Record<string, unknown>,
): Promise<
  { ok: true; token: string; cliente: ClienteMe } | { ok: false; status: number; message: string }
> {
  const res = await fetch(`${API_URL}/auth/cliente/${accion}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, tenantSlug: TENANT_SLUG }),
    cache: "no-store",
  });
  const data = (await res.json()) as
    | { accessToken: string; cliente: ClienteMe }
    | { message?: string };
  if (!res.ok || !("accessToken" in data)) {
    return {
      ok: false,
      status: res.status,
      message: ("message" in data && data.message) || "Error de autenticación",
    };
  }
  return { ok: true, token: data.accessToken, cliente: data.cliente };
}
