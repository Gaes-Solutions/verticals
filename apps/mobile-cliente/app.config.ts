import type { ExpoConfig } from "expo/config";

const staging = process.env.EXPO_PUBLIC_APP_VARIANT === "staging";

const config: ExpoConfig = {
  name: staging ? "Gaesland · Pruebas" : "GaesSoft Tienda",
  slug: "gaessoft-cliente",
  scheme: staging ? "gaessoft-cliente-staging" : "gaessoft-cliente",
  owner: "gaes-soft",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: staging ? "com.gaessoft.cliente.staging" : "com.gaessoft.cliente",
    supportsTablet: true,
  },
  android: {
    package: staging ? "com.gaessoft.cliente.staging" : "com.gaessoft.cliente",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0f766e",
    },
  },
  plugins: [
    ["@stripe/stripe-react-native", { enableGooglePay: false }],
    "expo-router",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Permite usar tu ubicación para completar tu dirección de entrega.",
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
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
      { faceIDPermission: "Usa Face ID para entrar a tu cuenta sin escribir tu contraseña." },
    ],
  ],
  extra: {
    // Sobrescribible por build (EAS) con EXPO_PUBLIC_API_URL.
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://app.angaes.com/api",
    eas: {
      projectId: "d7e5e7bd-bf7c-41a9-9cbc-d804bb40393a",
    },
  },
};

export default config;
