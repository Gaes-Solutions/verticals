import type { ExpoConfig } from "expo/config";
import { mobileBusinessBuildConfig } from "./build-variant.cjs";

const build = mobileBusinessBuildConfig(process.env.APP_VARIANT, process.env.EXPO_PUBLIC_API_URL);

const config: ExpoConfig = {
  name: build.name,
  slug: "gaessoft-negocio",
  scheme: build.scheme,
  owner: "gaes-soft",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: build.package,
    supportsTablet: true,
  },
  android: {
    package: build.package,
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
    appVariant: build.variant,
    apiUrl: build.apiUrl,
    eas: {
      projectId: "a2855c15-cbf0-4cec-96bb-80c57cd4d63a",
    },
  },
};

export default config;
