import { cookies } from "next/headers";
import { slugActual } from "./api";

/**
 * Auth del cliente de la tienda. A diferencia del BFF (token de servicio del
 * tenant), aquí cada comprador tiene SU sesión: el token de cliente vive en una
 * cookie httpOnly y se usa para llamar /cliente-portal/* con su identidad.
 */
const API_URL = process.env.API_URL ?? "http://localhost:3000";
export const COOKIE = "gaespos_cliente_token";

export class ClienteSessionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ClienteSessionError";
  }
}

export interface ClienteSession {
  token: string;
  cliente: ClienteMe & { tenantSlug: string };
}

export async function getClienteSession(): Promise<ClienteSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/cliente-portal/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    throw new ClienteSessionError(503, "No se pudo verificar tu sesión. Reintenta.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new ClienteSessionError(401, "Tu sesión venció. Inicia sesión de nuevo.");
  }
  if (!res.ok) {
    throw new ClienteSessionError(503, "No se pudo verificar tu sesión. Reintenta.");
  }
  let cliente: ClienteSession["cliente"];
  try {
    cliente = (await res.json()) as ClienteSession["cliente"];
  } catch {
    throw new ClienteSessionError(503, "No se pudo verificar tu sesión. Reintenta.");
  }
  if (
    !cliente ||
    typeof cliente.id !== "string" ||
    !cliente.id ||
    typeof cliente.tenantSlug !== "string"
  ) {
    throw new ClienteSessionError(503, "No se pudo verificar tu sesión. Reintenta.");
  }
  if (cliente.tenantSlug !== (await slugActual())) {
    throw new ClienteSessionError(403, "Inicia sesión en esta tienda para continuar.");
  }
  return { token, cliente };
}

export async function getClienteToken(): Promise<string | null> {
  try {
    return (await getClienteSession())?.token ?? null;
  } catch (err) {
    if (err instanceof ClienteSessionError && (err.statusCode === 401 || err.statusCode === 403))
      return null;
    throw err;
  }
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
  apellidos?: string | null;
  telefono?: string | null;
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
  varianteId: string | null;
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
    body: JSON.stringify({ ...body, tenantSlug: await slugActual() }),
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
