import { type ApiClient, ApiError, createApiClient } from "@gaespos/api-client";
import { API_URL, TOKEN_KEY } from "../config";
import { secureStorage } from "./storage";

let onUnauthorized: (() => Promise<void>) | null = null;
let sessionVersion = 0;

export function setUnauthorizedHandler(fn: () => Promise<void>): void {
  onUnauthorized = fn;
}

export function invalidateSessionRequests(): void {
  sessionVersion++;
}

const transport = createApiClient({ baseUrl: API_URL, getToken: async () => null });

const boundedRequest: ApiClient["request"] = async (path, opts = {}) => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (opts.signal?.aborted) cancel();
  else opts.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 12_000);
  try {
    return await transport.request(path, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", cancel);
  }
};

/** Account screens and login need the same network deadline as cart and checkout. */
export const authApi: ApiClient = {
  request: boundedRequest,
  get: (path, opts) => boundedRequest(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => boundedRequest(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => boundedRequest(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) => boundedRequest(path, { ...opts, method: "PATCH", body }),
  del: (path, opts) => boundedRequest(path, { ...opts, method: "DELETE" }),
};

const request: ApiClient["request"] = async (path, opts = {}) => {
  const version = sessionVersion;
  const token = opts.token ?? (opts.auth === false ? null : await secureStorage.get(TOKEN_KEY));
  if (version !== sessionVersion) throw new Error("La sesión cambió antes de enviar la operación");
  try {
    return await authApi.request(path, { ...opts, ...(token ? { token } : {}) });
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      token &&
      opts.auth !== false &&
      version === sessionVersion
    ) {
      await onUnauthorized?.();
    }
    throw error;
  }
};

export const api: ApiClient = {
  request,
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  del: (path, opts) => request(path, { ...opts, method: "DELETE" }),
};
