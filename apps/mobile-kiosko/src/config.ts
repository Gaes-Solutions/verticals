import Constants from "expo-constants";

/**
 * Base URL de la API GaesSoft. Orden de resolución: variable de entorno
 * EXPO_PUBLIC_API_URL (seteada en build vía .env / EAS), `expo.extra.apiUrl`
 * (app.config.ts) y como último recurso la URL de producción por defecto.
 */
const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? fromExtra ?? "https://app.angaes.com/api";

/** Token del dispositivo kiosko (formato tenant.secreto), en almacenamiento seguro. */
export const KIOSKO_TOKEN_KEY = "gaessoft_kiosko_token";
