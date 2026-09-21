import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { Session } from "../App.js";
import { type DesktopCatalogState, startDesktopSession } from "../lib/desktop-session.js";

export function CatalogStatusView({
  state,
  refresh,
}: { state: DesktopCatalogState; refresh(): void }) {
  const busy = state.status === "preparing" || state.status === "downloading";
  return (
    <section
      aria-label="Catálogo del equipo"
      className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center border-b border-slate-200 bg-white px-4 py-2 text-sm"
    >
      <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
        <p className="font-semibold text-slate-800">
          {state.status === "ready"
            ? "Catálogo guardado en este equipo"
            : state.status === "error"
              ? "Catálogo pendiente de actualizar"
              : "Preparando catálogo del equipo"}
        </p>
        <p className="text-slate-600">
          {state.status === "downloading"
            ? `Descargando catálogo: ${Math.round(((state.received ?? 0) / Math.max(1, state.total ?? 1)) * 100)}%. `
            : ""}
          {state.lastUpdated
            ? `Última actualización: ${new Date(state.lastUpdated).toLocaleString("es-MX")}. `
            : ""}
          El cobro aún requiere conexión.
        </p>
        {state.status === "error" && <p className="break-words text-danger">{state.message}</p>}
      </div>
      <button
        type="button"
        className="gx-btn-secondary min-h-10 self-start sm:shrink-0"
        disabled={busy}
        onClick={refresh}
      >
        {busy ? "Preparando…" : "Actualizar catálogo"}
      </button>
    </section>
  );
}
export function DesktopCatalogStatus({ session }: { session: Session }) {
  const [state, setState] = useState<DesktopCatalogState>({ status: "preparing" });
  const controller = useRef<ReturnType<typeof startDesktopSession> | null>(null);
  const permissions = session.identity?.permissions ?? [];
  const enabled =
    isTauri() &&
    !!session.caja &&
    !!session.identity &&
    ["sync.usar", "productos.leer", "precios.leer"].every(
      (permission) => permissions.includes("*") || permissions.includes(permission),
    );
  useEffect(() => {
    if (!enabled) return;
    const runtime = startDesktopSession(session, setState);
    controller.current = runtime;
    return () => {
      runtime.stop();
      controller.current = null;
    };
  }, [session, enabled]);
  if (!enabled) return null;
  return (
    <CatalogStatusView
      state={state}
      refresh={() => {
        void controller.current?.refresh();
      }}
    />
  );
}
