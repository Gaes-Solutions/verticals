import { loginTenant, verifyTenantMfa } from "@gaespos/api-client";
import type { StaffUser } from "@gaespos/api-client";
import * as LocalAuth from "expo-local-authentication";
import { create } from "zustand";
import { BIOMETRIA_KEY, TENANT_KEY, TOKEN_KEY } from "../config";
import { api, setUnauthorizedHandler } from "./api";
import { secureStorage } from "./storage";

type Status = "loading" | "signedOut" | "mfa" | "signedIn";

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
  login: (tenantSlug: string, email: string, password: string) => Promise<void>;
  submitMfa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

async function persistSession(token: string, tenantSlug: string): Promise<void> {
  await secureStorage.set(TOKEN_KEY, token);
  await secureStorage.set(TENANT_KEY, tenantSlug);
}

export const useAuth = create<AuthState>((set, get) => {
  setUnauthorizedHandler(() => {
    void get().logout();
  });

  return {
    status: "loading",
    user: null,
    tenantSlug: null,
    mfaToken: null,
    error: null,
    biometriaActiva: false,
    biometriaDisponible: false,

    restore: async () => {
      const token = await secureStorage.get(TOKEN_KEY);
      if (!token) {
        set({ status: "signedOut" });
        return;
      }
      const disponible =
        (await LocalAuth.hasHardwareAsync()) && (await LocalAuth.isEnrolledAsync());
      const pref = (await secureStorage.get(BIOMETRIA_KEY)) === "1";
      set({ biometriaDisponible: disponible, biometriaActiva: pref && disponible });
      // Solo pedir huella si el usuario la activó y el equipo la tiene.
      if (pref && disponible) {
        const r = await LocalAuth.authenticateAsync({
          promptMessage: "Desbloquea GaesSoft",
          cancelLabel: "Usar contraseña",
        });
        if (!r.success) {
          set({ status: "signedOut" });
          return;
        }
      }
      const slug = await secureStorage.get(TENANT_KEY);
      set({ status: "signedIn", tenantSlug: slug });
    },

    setBiometria: async (on) => {
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
      await secureStorage.set(BIOMETRIA_KEY, on ? "1" : "0");
      set({ biometriaActiva: on, biometriaDisponible: disponible });
      return true;
    },

    login: async (tenantSlug, email, password) => {
      set({ error: null });
      try {
        const result = await loginTenant(api, { tenantSlug, email, password });
        if (result.kind === "mfa") {
          set({ status: "mfa", mfaToken: result.mfaToken, tenantSlug });
          return;
        }
        await persistSession(result.session.accessToken, tenantSlug);
        set({ status: "signedIn", user: result.session.user, tenantSlug, mfaToken: null });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : "No se pudo iniciar sesión" });
      }
    },

    submitMfa: async (code) => {
      const { mfaToken, tenantSlug } = get();
      if (!mfaToken || !tenantSlug) return;
      set({ error: null });
      try {
        const session = await verifyTenantMfa(api, mfaToken, code);
        await persistSession(session.accessToken, tenantSlug);
        set({ status: "signedIn", user: session.user, mfaToken: null });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : "Código incorrecto" });
      }
    },

    logout: async () => {
      await secureStorage.delete(TOKEN_KEY);
      set({ status: "signedOut", user: null, mfaToken: null });
    },
  };
});
