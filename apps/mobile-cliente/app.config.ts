import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "GaesSoft Tienda",
  slug: "gaessoft-cliente",
  scheme: "gaessoft-cliente",
  owner: "gaes-soft",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "com.gaessoft.cliente",
    supportsTablet: true,
  },
  android: {
    package: "com.gaessoft.cliente",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#4f46e5",
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
        backgroundColor: "#4f46e5",
      },
    ],
    [
      "expo-local-authentication",
      { faceIDPermission: "Usa Face ID para entrar a tu cuenta sin escribir tu contraseña." },
    ],
  ],
  extra: {
    // Sobrescribible por build (EAS) con EXPO_PUBLIC_API_URL.
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://app.angaes.com/api",
  },
};

export default config;
