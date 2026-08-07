/**
 * Almacenamiento seguro del token, inyectado por cada app.
 * En móvil lo implementa expo-secure-store (Keychain iOS / Keystore Android);
 * nunca se guarda el token en texto plano ni en AsyncStorage.
 */
export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Storage en memoria — solo para pruebas/SSR, no persiste. */
export function createMemoryStorage(): SecureStorage {
  const mem = new Map<string, string>();
  return {
    get: (k) => Promise.resolve(mem.get(k) ?? null),
    set: (k, v) => {
      mem.set(k, v);
      return Promise.resolve();
    },
    delete: (k) => {
      mem.delete(k);
      return Promise.resolve();
    },
  };
}
