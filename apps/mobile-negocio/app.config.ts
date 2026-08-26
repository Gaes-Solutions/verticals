import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "GaesSoft Negocio",
  slug: "gaessoft-negocio",
  scheme: "gaessoft-negocio",
  owner: "gaes-soft",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "com.gaessoft.negocio",
    supportsTablet: true,
  },
  android: {
    package: "com.gaessoft.negocio",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0f766e",
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0f766e",
      },
    ],
    [
      "expo-local-authentication",
      { faceIDPermission: "Usa Face ID para entrar a GaesSoft sin escribir tu contraseña." },
    ],
  ],
  extra: {
    // Sobrescribible por build (EAS) con EXPO_PUBLIC_API_URL.
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://app.angaes.com/api",
    eas: {
      projectId: "a2855c15-cbf0-4cec-96bb-80c57cd4d63a",
    },
  },
};

export default config;
