import { type CatalogManifest, type CatalogPage, downloadCatalog } from "@gaespos/sync-client";
import type { Session } from "../App.js";
import { API_BASE, ApiError, api, loadToken } from "./api.js";
import { openDesktopStorage } from "./desktop-storage.js";
import { clearCatalogResume, saveCatalogReadGrant } from "./local-catalog.js";
import type { CashierIdentity } from "./session.js";

export interface DesktopCatalogState {
  status: "preparing" | "downloading" | "ready" | "error";
  received?: number;
  total?: number;
  lastUpdated?: string;
  message?: string;
}
export function startDesktopSession(
  session: Session,
  onState: (state: DesktopCatalogState) => void,
) {
  const token = loadToken();
  const identity = session.identity;
  const box = session.caja;
  const abort = new AbortController();
  let active = true;
  let running: Promise<void> | null = null;
  let previousTime: string | undefined;
  const isCurrent = () => active && loadToken() === token;
  const report = (state: DesktopCatalogState) => {
    if (isCurrent()) onState(state);
  };
  const refresh = (): Promise<void> => {
    if (running) return running;
    if (!token || !identity || !box || !isCurrent()) return Promise.resolve();
    const scope = {
      apiOrigin: new URL(API_BASE, window.location.href).href,
      tenantSlug: identity.tenantSlug,
      userId: identity.id,
      sucursalId: session.sucursal.id,
      cajaId: box.id,
    };
    running = (async () => {
      report({ status: "preparing" });
      const storage = await openDesktopStorage(scope);
      if (!storage || !isCurrent()) return;
      previousTime = (await storage.getCatalogManifest())?.serverTime;
      if (!isCurrent()) return;
      const request = { token, signal: abort.signal };
      const currentIdentity = await api<CashierIdentity>("/auth/tenant/me", request);
      if (!isCurrent()) return;
      if (currentIdentity.id !== identity.id || currentIdentity.tenantSlug !== identity.tenantSlug)
        throw new Error("La identidad de la sesión cambió; vuelve a iniciar sesión");
      const manifest = await downloadCatalog(
        storage,
        {
          create: () => api<CatalogManifest>("/t/sync/catalog", { ...request, method: "POST" }),
          read: (id, page) =>
            api<CatalogPage>(`/t/sync/catalog/${encodeURIComponent(id)}/${page}`, request),
        },
        {
          userId: identity.id,
          isCurrent,
          onProgress: (received, total) =>
            report({
              status: "downloading",
              received,
              total,
              ...(previousTime ? { lastUpdated: previousTime } : {}),
            }),
        },
      );
      if (!isCurrent()) return;
      await saveCatalogReadGrant(
        storage,
        { ...session, identity: currentIdentity, cajeroNombre: currentIdentity.nombre },
        token,
        manifest.id,
      );
      previousTime = manifest.serverTime;
      report({ status: "ready", lastUpdated: previousTime });
    })()
      .catch((error: unknown) => {
        if (isCurrent() && error instanceof ApiError && [401, 403].includes(error.status))
          clearCatalogResume();
        report({
          status: "error",
          message:
            error instanceof ApiError
              ? error.message
              : error instanceof TypeError
                ? "No se pudo conectar. El catálogo guardado se conserva; vuelve a intentar cuando regrese la conexión."
                : "No se pudo actualizar el catálogo. La versión guardada se conserva; vuelve a intentar.",
          ...(previousTime ? { lastUpdated: previousTime } : {}),
        });
      })
      .finally(() => {
        running = null;
      });
    return running;
  };
  void refresh();
  return {
    refresh,
    stop() {
      active = false;
      abort.abort();
    },
  };
}
