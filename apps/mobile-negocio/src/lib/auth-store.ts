import { ApiError, type StaffUser, loginTenant, verifyTenantMfa } from "@gaespos/api-client";
import * as LocalAuth from "expo-local-authentication";
import { create } from "zustand";
import { BIOMETRIA_KEY, TENANT_KEY, TOKEN_KEY } from "../config";
import { authApi, invalidateSessionRequests, setUnauthorizedHandler } from "./api";
import { secureStorage } from "./storage";

type Status = "loading" | "signedOut" | "mfa" | "signedIn" | "unverified";
interface AuthState {
  status: Status;
  user: StaffUser | null;
  tenantSlug: string | null;
  mfaToken: string | null;
  error: string | null;
  biometriaActiva: boolean;
  biometriaDisponible: boolean;
  restore: () => Promise<void>;
  setBiometria: (on: boolean) => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  submitMfa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}
class InvalidSession extends Error {}
async function loadIdentity(token: string, tenant: string): Promise<StaffUser> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const value = await authApi.get<StaffUser & { tenantSlug: string }>("/auth/tenant/me", {
      token,
      signal: controller.signal,
    });
    if (
      !value ||
      !value.id ||
      typeof value.id !== "string" ||
      typeof value.nombre !== "string" ||
      typeof value.email !== "string" ||
      typeof value.isOwner !== "boolean" ||
      !Array.isArray(value.permissions) ||
      !value.permissions.every((p) => typeof p === "string") ||
      !Array.isArray(value.roleCodes) ||
      !value.roleCodes.every((r) => typeof r === "string") ||
      value.tenantSlug !== tenant
    )
      throw new InvalidSession("La identidad no corresponde al negocio guardado");
    return {
      id: value.id,
      email: value.email,
      nombre: value.nombre,
      apellidos: value.apellidos ?? null,
      tipoUsuario: value.tipoUsuario,
      isOwner: value.isOwner,
      permissions: value.permissions,
      roleCodes: value.roleCodes,
    };
  } finally {
    clearTimeout(timer);
  }
}
const signedOut = {
  status: "signedOut" as const,
  user: null,
  tenantSlug: null,
  mfaToken: null,
  biometriaActiva: false,
};
export const useAuth = create<AuthState>((set, get) => {
  let operation = 0;
  let writes = Promise.resolve();
  const serialize = (action: () => Promise<void>) => {
    writes = writes.catch(() => undefined).then(action);
    return writes;
  };
  const clearStorage = async () => {
    await Promise.all(
      [TOKEN_KEY, TENANT_KEY, BIOMETRIA_KEY].map((key) => secureStorage.delete(key)),
    );
  };
  const accept = async (token: string, tenant: string, attempt: number) => {
    const user = await loadIdentity(token, tenant);
    if (attempt !== operation) return;
    await serialize(async () => {
      if (attempt !== operation) return;
      try {
        await clearStorage();
        await secureStorage.set(TENANT_KEY, tenant);
        await secureStorage.set(TOKEN_KEY, token);
      } catch (error) {
        await clearStorage();
        throw error;
      }
    });
    if (attempt === operation)
      set({ status: "signedIn", user, tenantSlug: tenant, mfaToken: null });
  };
  setUnauthorizedHandler(() => get().logout());
  return {
    ...signedOut,
    status: "loading",
    error: null,
    biometriaDisponible: false,
    restore: async () => {
      const attempt = ++operation;
      invalidateSessionRequests();
      set({ ...signedOut, status: "loading", error: null });
      try {
        await writes;
        const token = await secureStorage.get(TOKEN_KEY);
        const tenant = await secureStorage.get(TENANT_KEY);
        if (attempt !== operation) return;
        if (!token || !tenant) {
          await get().logout();
          return;
        }
        const available =
          (await LocalAuth.hasHardwareAsync()) && (await LocalAuth.isEnrolledAsync());
        const preference = (await secureStorage.get(BIOMETRIA_KEY)) === "1";
        if (attempt !== operation) return;
        set({ biometriaDisponible: available, biometriaActiva: preference && available });
        if (preference) {
          if (!available) {
            set(signedOut);
            return;
          }
          const result = await LocalAuth.authenticateAsync({
            promptMessage: "Desbloquea GaesSoft",
            cancelLabel: "Usar contraseña",
          });
          if (attempt !== operation) return;
          if (!result.success) {
            set(signedOut);
            return;
          }
        }
        const user = await loadIdentity(token, tenant);
        if (attempt === operation) set({ status: "signedIn", user, tenantSlug: tenant });
      } catch (error) {
        if (attempt !== operation) return;
        if (
          error instanceof InvalidSession ||
          (error instanceof ApiError && [401, 403].includes(error.status))
        ) {
          const logoutGeneration = operation + 1;
          await get().logout();
          if (operation === logoutGeneration)
            set({ error: "Tu sesión ya no es válida. Inicia sesión nuevamente." });
        } else
          set({
            ...signedOut,
            status: "unverified",
            error:
              "No pudimos verificar tu sesión. Tu sesión sigue guardada; revisa la conexión y reintenta.",
          });
      }
    },
    setBiometria: async (on) => {
      const attempt = operation;
      if (get().status !== "signedIn") return false;
      const available = (await LocalAuth.hasHardwareAsync()) && (await LocalAuth.isEnrolledAsync());
      if (on && !available) return false;
      if (on) {
        const result = await LocalAuth.authenticateAsync({
          promptMessage: "Confirma tu huella / Face ID",
          cancelLabel: "Cancelar",
        });
        if (!result.success) return false;
      }
      if (attempt !== operation) return false;
      await serialize(async () => {
        if (attempt === operation) await secureStorage.set(BIOMETRIA_KEY, on ? "1" : "0");
      });
      if (attempt !== operation) return false;
      set({ biometriaActiva: on, biometriaDisponible: available });
      return true;
    },
    // El negocio ya no se pide: el servidor lo resuelve por el correo y lo
    // devuelve en la sesión.
    login: async (email, password) => {
      const attempt = ++operation;
      invalidateSessionRequests();
      set({ ...signedOut, error: null });
      try {
        await serialize(clearStorage);
        if (attempt !== operation) return;
        const result = await loginTenant(authApi, { email, password });
        if (attempt !== operation) return;
        if (result.kind === "mfa") {
          set({ status: "mfa", mfaToken: result.mfaToken });
          return;
        }
        await accept(result.session.accessToken, result.session.tenant.slug, attempt);
      } catch (error) {
        if (attempt === operation)
          set({ error: error instanceof Error ? error.message : "No se pudo iniciar sesión" });
      }
    },
    submitMfa: async (code) => {
      const { mfaToken } = get();
      if (!mfaToken) return;
      const attempt = ++operation;
      invalidateSessionRequests();
      set({ error: null });
      try {
        const session = await verifyTenantMfa(authApi, mfaToken, code);
        await accept(session.accessToken, session.tenant.slug, attempt);
      } catch (error) {
        if (attempt === operation)
          set({ error: error instanceof Error ? error.message : "Código incorrecto" });
      }
    },
    logout: async () => {
      ++operation;
      invalidateSessionRequests();
      set({ ...signedOut, error: null });
      await serialize(clearStorage);
    },
  };
});
