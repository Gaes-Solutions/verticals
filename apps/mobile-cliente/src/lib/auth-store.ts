import type { ClienteUser } from "@gaespos/api-client";
import { loginCliente, registrarCliente } from "@gaespos/api-client";
import * as LocalAuth from "expo-local-authentication";
import { create } from "zustand";
import { TENANT_KEY, TOKEN_KEY } from "../config";
import { api, setUnauthorizedHandler } from "./api";
import { secureStorage } from "./storage";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: Status;
  user: ClienteUser | null;
  tenantSlug: string | null;
  error: string | null;
  restore: () => Promise<void>;
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
    error: null,

    restore: async () => {
      const token = await secureStorage.get(TOKEN_KEY);
      if (!token) {
        set({ status: "signedOut" });
        return;
      }
      const hasBiometrics =
        (await LocalAuth.hasHardwareAsync()) && (await LocalAuth.isEnrolledAsync());
      if (hasBiometrics) {
        const r = await LocalAuth.authenticateAsync({
          promptMessage: "Desbloquea tu cuenta",
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

    login: async (tenantSlug, email, password) => {
      set({ error: null });
      try {
        const session = await loginCliente(api, { tenantSlug, email, password });
        await persistSession(session.accessToken, tenantSlug);
        set({ status: "signedIn", user: session.cliente, tenantSlug });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : "No se pudo iniciar sesión" });
      }
    },

    registro: async (input) => {
      set({ error: null });
      try {
        const session = await registrarCliente(api, input);
        await persistSession(session.accessToken, input.tenantSlug);
        set({ status: "signedIn", user: session.cliente, tenantSlug: input.tenantSlug });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : "No se pudo crear la cuenta" });
      }
    },

    logout: async () => {
      await secureStorage.delete(TOKEN_KEY);
      set({ status: "signedOut", user: null });
    },
  };
});
