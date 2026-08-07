import { createApiClient } from "@gaespos/api-client";
import { API_URL, TOKEN_KEY } from "../config";
import { secureStorage } from "./storage";

let onUnauthorized: (() => void) | null = null;

/** El store de auth registra aquí su handler para cerrar sesión ante un 401. */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export const api = createApiClient({
  baseUrl: API_URL,
  getToken: () => secureStorage.get(TOKEN_KEY),
  onUnauthorized: () => {
    onUnauthorized?.();
  },
});
