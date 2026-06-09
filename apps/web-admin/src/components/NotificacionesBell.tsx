import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  link: string | null;
  leida: boolean;
  createdAt: string;
}

const POLL_MS = 30_000;

/** Campana de notificaciones del empleado: nuevos pedidos, pedidos asignados, etc. */
export function NotificacionesBell({ onOpenLink }: { onOpenLink?: (link: string) => void }) {
  const [items, setItems] = useState<Notificacion[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const cargar = useCallback(() => {
    api<{ items: Notificacion[]; noLeidas: number }>("/t/notificaciones")
      .then((r) => {
        setItems(r.items);
        setNoLeidas(r.noLeidas);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    if (!abierto) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [abierto]);

  async function marcarLeida(n: Notificacion) {
    if (!n.leida) {
      await api(`/t/notificaciones/${n.id}/leer`, { method: "POST" }).catch(() => {});
      setNoLeidas((c) => Math.max(0, c - 1));
      setItems((arr) => arr.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    }
    if (n.link && onOpenLink) {
      setAbierto(false);
      onOpenLink(n.link);
    }
  }

  async function marcarTodas() {
    await api("/t/notificaciones/leer-todas", { method: "POST" }).catch(() => {});
    setItems((arr) => arr.map((x) => ({ ...x, leida: true })));
    setNoLeidas(0);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Notificaciones"
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-200"
      >
        <span className="text-xl">🔔</span>
        {noLeidas > 0 && (
          <span className="-right-0.5 -top-0.5 absolute flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 font-bold text-[11px] text-white">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-slate-100 border-b px-4 py-2">
            <span className="font-semibold text-slate-700 text-sm">Notificaciones</span>
            {noLeidas > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                className="text-brand text-xs hover:underline"
              >
                Marcar todas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-slate-400 text-sm">Sin notificaciones</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => marcarLeida(n)}
                  className={`block w-full border-slate-50 border-b px-4 py-3 text-left hover:bg-slate-50 ${
                    n.leida ? "" : "bg-brand/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.leida && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                    <div className={n.leida ? "pl-4" : ""}>
                      <p className="font-medium text-slate-800 text-sm">{n.titulo}</p>
                      <p className="text-slate-500 text-xs">{n.cuerpo}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {new Date(n.createdAt).toLocaleString("es-MX")}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
