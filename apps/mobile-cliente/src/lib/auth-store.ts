import type { ClienteUser } from "@gaespos/api-client";
import { ApiError, NetworkError, loginCliente, registrarCliente } from "@gaespos/api-client";
import * as LocalAuth from "expo-local-authentication";
import { create } from "zustand";
import { BIOMETRIA_KEY, TENANT_KEY, TOKEN_KEY } from "../config";
import { authApi, invalidateSessionRequests, setUnauthorizedHandler } from "./api";
import { clearAccountCache } from "./query-client";
import { secureStorage } from "./storage";
import { marcarSesion } from "./tienda";

type Status = "loading" | "signedOut" | "signedIn" | "unverified";

interface AuthState {
  status: Status;
  user: ClienteUser | null;
  tenantSlug: string | null;
  error: string | null;
  biometriaActiva: boolean;
  biometriaDisponible: boolean;
  restore: () => Promise<void>;
  setBiometria: (on: boolean) => Promise<boolean>;
  login: (tenantSlug: string, email: string, password: string) => Promise<void>;
  registro: (input: {
    tenantSlug: string;
    nombre: string;
    email: string;
    password: string;
    telefono?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

async function persistSession(token: string, tenantSlug: string): Promise<void> {
  try {
    await secureStorage.delete(TOKEN_KEY);
    await secureStorage.delete(BIOMETRIA_KEY);
    await secureStorage.set(TENANT_KEY, tenantSlug);
    await secureStorage.set(TOKEN_KEY, token);
  } catch (error) {
    await Promise.allSettled(
      [TOKEN_KEY, TENANT_KEY, BIOMETRIA_KEY].map((key) => secureStorage.delete(key)),
    );
    throw error;
  }
}

async function loadIdentity(token: string, expectedTenant: string): Promise<ClienteUser> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const user = await authApi.get<ClienteUser & { tenantSlug: string }>("/cliente-portal/me", {
      token,
      signal: controller.signal,
    });
    if (!user || typeof user.id !== "string" || typeof user.nombre !== "string")
      throw new Error("Identidad inválida");
    if (user.tenantSlug !== expectedTenant)
      throw new Error("La identidad no corresponde a la tienda guardada");
    return {
      id: user.id,
      nombre: user.nombre,
      email: typeof user.email === "string" ? user.email : "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function unlockAccount() {
  const disponible = (await LocalAuth.hasHardwareAsync()) && (await LocalAuth.isEnrolledAsync());
  const pref = (await secureStorage.get(BIOMETRIA_KEY)) === "1";
  if (pref && !disponible)
    return { success: false, biometriaDisponible: false, biometriaActiva: false };
  const active = pref && disponible;
  const result = active
    ? await LocalAuth.authenticateAsync({
        promptMessage: "Desbloquea tu cuenta",
        cancelLabel: "Usar contraseña",
      })
    : { success: true };
  return { success: result.success, biometriaDisponible: disponible, biometriaActiva: active };
}

function limpiarSesion(): void {
  marcarSesion(null);
}

const signedOut = {
  status: "signedOut" as const,
  user: null,
  tenantSlug: null,
  biometriaActiva: false,
};

export const useAuth = create<AuthState>((set, get) => {
  let operation = 0;
  let writes: Promise<void> = Promise.resolve();
  const serialize = (action: () => Promise<void>) => {
    writes = writes.catch(() => undefined).then(action);
    return writes;
  };
  setUnauthorizedHandler(() => get().logout());

  const acceptSession = async (
    session: { accessToken: string; cliente: ClienteUser },
    slug: string,
    attempt: number,
  ) => {
    if (attempt !== operation) return;
    invalidateSessionRequests();
    set(signedOut);
    await clearAccountCache();
    await serialize(async () => {
      if (attempt !== operation) return;
      await persistSession(session.accessToken, slug);
    });
    if (attempt === operation) marcarSesion(slug);
    set({ status: "signedIn", user: session.cliente, tenantSlug: slug, biometriaActiva: false });
  };

  const restoreFailed = async (error: unknown, attempt: number) => {
    if (attempt !== operation) return;
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      await get().logout();
      set({ error: "Tu sesión ya no es válida. Inicia sesión nuevamente." });
    } else {
      set({
        ...signedOut,
        status: "unverified",
        error:
          error instanceof NetworkError
            ? "Sin conexión. Tu sesión sigue guardada; conecta el dispositivo y reintenta."
            : "No pudimos verificar tu sesión. Tu sesión sigue guardada; vuelve a intentar.",
      });
    }
  };

  return {
    status: "loading",
    user: null,
    tenantSlug: null,
    error: null,
    biometriaActiva: false,
    biometriaDisponible: false,

    restore: async () => {
      const attempt = ++operation;
      invalidateSessionRequests();
      limpiarSesion();
      set({ ...signedOut, status: "loading", error: null });
      try {
        await clearAccountCache();
        const token = await secureStorage.get(TOKEN_KEY);
        const slug = await secureStorage.get(TENANT_KEY);
        if (attempt !== operation) return;
        if (!token || !slug) {
          set(signedOut);
          return;
        }
        const { success, ...biometry } = await unlockAccount();
        if (attempt !== operation) return;
        set(biometry);
        if (!success) {
          set(signedOut);
          return;
        }
        const user = await loadIdentity(token, slug);
        if (attempt === operation) {
          marcarSesion(slug);
          set({ status: "signedIn", user, tenantSlug: slug });
        }
      } catch (error) {
        await restoreFailed(error, attempt);
      }
    },

    setBiometria: async (on) => {
      const attempt = operation;
      if (get().status !== "signedIn") return false;
      const disponible =
        (await LocalAuth.hasHardwareAsync()) && (await LocalAuth.isEnrolledAsync());
      if (on && !disponible) return false;
      if (on) {
        const r = await LocalAuth.authenticateAsync({
          promptMessage: "Confirma tu huella / Face ID",
          cancelLabel: "Cancelar",
        });
        if (!r.success) return false;
      }
      if (attempt !== operation) return false;
      await serialize(async () => {
        if (attempt === operation) await secureStorage.set(BIOMETRIA_KEY, on ? "1" : "0");
      });
      if (attempt !== operation) return false;
      set({ biometriaActiva: on, biometriaDisponible: disponible });
      return true;
    },

    login: async (tenantSlug, email, password) => {
      const attempt = ++operation;
      set({ error: null });
      try {
        const session = await loginCliente(authApi, { tenantSlug, email, password });
        await acceptSession(session, tenantSlug, attempt);
      } catch (e) {
        if (attempt !== operation) return;
        set({ error: e instanceof Error ? e.message : "No se pudo iniciar sesión" });
      }
    },

    registro: async (input) => {
      const attempt = ++operation;
      set({ error: null });
      try {
        const session = await registrarCliente(authApi, input);
        await acceptSession(session, input.tenantSlug, attempt);
      } catch (e) {
        if (attempt !== operation) return;
        set({ error: e instanceof Error ? e.message : "No se pudo crear la cuenta" });
      }
    },

    logout: async () => {
      ++operation;
      invalidateSessionRequests();
      limpiarSesion();
      set({ ...signedOut, error: null });
      await clearAccountCache();
      try {
        await serialize(async () => {
          const results = await Promise.allSettled(
            [TOKEN_KEY, TENANT_KEY, BIOMETRIA_KEY].map((key) => secureStorage.delete(key)),
          );
          if (results.some((result) => result.status === "rejected")) throw new Error("storage");
        });
      } catch {
        set({
          error:
            "La cuenta está bloqueada, pero no pudimos borrar toda la sesión guardada. Desbloquea el dispositivo y vuelve a cerrar sesión.",
        });
      }
    },
  };
});
