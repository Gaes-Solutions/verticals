export const MOBILE_BUSINESS_API = {
  staging: "https://verticals-staging.up.railway.app/api",
  production: "https://app.angaes.com/api",
} as const;

export type MobileBusinessVariant = keyof typeof MOBILE_BUSINESS_API;

/** Testing builds default to staging; production requires an explicit profile. */
export function mobileBusinessBuildConfig(requested: string | undefined, apiOverride?: string) {
  const variant = requested ?? "staging";
  if (variant !== "staging" && variant !== "production") {
    throw new Error("APP_VARIANT debe ser staging o production");
  }

  const apiUrl = MOBILE_BUSINESS_API[variant];
  if (apiOverride && apiOverride !== apiUrl) {
    throw new Error(`EXPO_PUBLIC_API_URL no coincide con el perfil ${variant}`);
  }

  const staging = variant === "staging";
  return {
    variant,
    apiUrl,
    name: staging ? "GaesSoft Negocio (Pruebas)" : "GaesSoft Negocio",
    scheme: staging ? "gaessoft-negocio-staging" : "gaessoft-negocio",
    package: staging ? "com.gaessoft.negocio.staging" : "com.gaessoft.negocio",
  } as const;
}
