import { ApiError, NetworkError } from "./errors.js";

export interface ApiClientConfig {
  /** Base del API, ej. "https://app.angaes.com/api". */
  baseUrl: string;
  /** Devuelve el token de sesión actual (del almacenamiento seguro). */
  getToken: () => Promise<string | null>;
  /** Se invoca en un 401 para que la app cierre sesión y pida re-login. */
  onUnauthorized?: () => void | Promise<void>;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Token explícito (ej. el mfaToken intermedio); si falta se usa getToken(). */
  token?: string;
  /** false = no adjuntar Authorization (login, registro). Default true. */
  auth?: boolean;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(path: string, opts?: RequestOptions): Promise<T>;
  get<T>(path: string, opts?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  post<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  patch<T>(
    path: string,
    body?: unknown,
    opts?: Omit<RequestOptions, "method" | "body">,
  ): Promise<T>;
  del<T>(path: string, opts?: Omit<RequestOptions, "method" | "body">): Promise<T>;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const base = config.baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const useAuth = opts.auth !== false;
    const token = opts.token ?? (useAuth ? await config.getToken() : null);
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
    } catch {
      throw new NetworkError();
    }

    if (res.status === 401) {
      await config.onUnauthorized?.();
    }

    if (res.status === 204) return undefined as T;

    const data = (await res.json().catch(() => null)) as
      | (T & { message?: string; error?: string; code?: string })
      | null;

    if (!res.ok) {
      const message = (data && (data.message ?? data.error)) ?? `Error ${res.status}`;
      throw new ApiError(res.status, message, data?.code);
    }
    return data as T;
  }

  return {
    request,
    get: (path, opts) => request(path, { ...opts, method: "GET" }),
    post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
    patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
    del: (path, opts) => request(path, { ...opts, method: "DELETE" }),
  };
}
