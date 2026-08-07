import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "GaesSoft Negocio",
  slug: "gaessoft-negocio",
  scheme: "gaessoft-negocio",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "com.gaessoft.negocio",
    supportsTablet: true,
  },
  android: {
    package: "com.gaessoft.negocio",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-local-authentication",
      { faceIDPermission: "Usa Face ID para entrar a GaesSoft sin escribir tu contraseña." },
    ],
  ],
  extra: {
    // Sobrescribible por build (EAS) con EXPO_PUBLIC_API_URL.
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://app.angaes.com/api",
  },
};

export default config;
