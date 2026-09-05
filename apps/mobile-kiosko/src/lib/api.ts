import { createApiClient } from "@gaespos/api-client";
import { API_URL, KIOSKO_TOKEN_KEY } from "../config";
import { secureStorage } from "./storage";

/** Cliente HTTP del kiosko: manda el token del dispositivo como Bearer. */
export const api = createApiClient({
  baseUrl: API_URL,
  getToken: () => secureStorage.get(KIOSKO_TOKEN_KEY),
  onUnauthorized: () => {
    // El dispositivo maneja el 401 mostrando la pantalla de configuración.
  },
});
