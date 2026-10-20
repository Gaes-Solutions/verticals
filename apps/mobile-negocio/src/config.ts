import Constants from "expo-constants";
import { mobileBusinessBuildConfig } from "./build-variant";

const extra = Constants.expoConfig?.extra as { apiUrl?: string; appVariant?: string } | undefined;

export const API_URL = mobileBusinessBuildConfig(extra?.appVariant, extra?.apiUrl).apiUrl;

/** Clave del token en el almacenamiento seguro del sistema. */
export const TOKEN_KEY = "gaessoft_negocio_token";
/** Clave del slug del tenant (para reintentar login/biometría). */
export const TENANT_KEY = "gaessoft_negocio_tenant";
/** Preferencia del usuario: entrar con huella/Face ID ("1" activado). */
export const BIOMETRIA_KEY = "gaessoft_negocio_biometria";
