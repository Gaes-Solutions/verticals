import type { ExpoConfig } from "expo/config";

const staging = process.env.EXPO_PUBLIC_APP_VARIANT === "staging";

const config: ExpoConfig = {
  name: staging ? "GaesSoft Verificador · Pruebas" : "GaesSoft Verificador",
  slug: "gaessoft-kiosko",
  scheme: staging ? "gaessoft-kiosko-staging" : "gaessoft-kiosko",
  owner: "gaes-soft",
  version: "0.1.0",
  orientation: "default",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: staging ? "com.gaessoft.kiosko.staging" : "com.gaessoft.kiosko",
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription: "El verificador usa la cámara para leer códigos de barras.",
    },
  },
  android: {
    package: staging ? "com.gaessoft.kiosko.staging" : "com.gaessoft.kiosko",
    permissions: ["CAMERA"],
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#c2410c" },
  },
  plugins: [
    "expo-router",
    "expo-audio",
    ["expo-video", { supportsBackgroundPlayback: false, supportsPictureInPicture: false }],
    "expo-secure-store",
    [
      "expo-camera",
      { cameraPermission: "El verificador usa la cámara para leer códigos de barras." },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0f766e",
      },
    ],
  ],
  extra: {
    apiUrl:
      process.env.EXPO_PUBLIC_API_URL ??
      (staging ? "https://verticals-staging.up.railway.app" : "https://app.angaes.com/api"),
    eas: { projectId: "3bebc91b-9933-4838-9fa8-3af4eeb36a26" },
  },
};

export default config;
