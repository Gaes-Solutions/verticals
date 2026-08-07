import type { SecureStorage } from "@gaespos/api-client";
import * as SecureStore from "expo-secure-store";

/** Implementación de SecureStorage con Keychain (iOS) / Keystore (Android). */
export const secureStorage: SecureStorage = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  delete: (key) => SecureStore.deleteItemAsync(key),
};
