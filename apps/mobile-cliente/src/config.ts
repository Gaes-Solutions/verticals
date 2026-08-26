import Constants from "expo-constants";

const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? fromExtra ?? "https://app.angaes.com/api";

/** Clave del token en el almacenamiento seguro del sistema. */
export const TOKEN_KEY = "gaessoft_cliente_token";
/** Clave del slug del tenant (para reintentar login/biometría). */
export const TENANT_KEY = "gaessoft_cliente_tenant";
