import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as { apiUrl?: string; appVariant?: string } | undefined;

if (!extra?.apiUrl || (extra.appVariant !== "staging" && extra.appVariant !== "production")) {
  throw new Error("La app Negocio necesita un perfil y una API válidos al compilarse.");
}

export const API_URL = extra.apiUrl;

/** Clave del token en el almacenamiento seguro del sistema. */
export const TOKEN_KEY = "gaessoft_negocio_token";
/** Clave del slug del tenant (para reintentar login/biometría). */
export const TENANT_KEY = "gaessoft_negocio_tenant";
/** Preferencia del usuario: entrar con huella/Face ID ("1" activado). */
export const BIOMETRIA_KEY = "gaessoft_negocio_biometria";
