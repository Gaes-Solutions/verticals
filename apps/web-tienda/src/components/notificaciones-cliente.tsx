"use client";

import type { NotificacionCliente } from "@/lib/cliente";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 45_000;

/** Campana del cliente: avisa cambios de estado de sus pedidos. */
export function NotificacionesCliente() {
  const [items, setItems] = useState<NotificacionCliente[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/cuenta/notificaciones", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: NotificacionCliente[]; noLeidas: number };
      setItems(data.items ?? []);
      setNoLeidas(data.noLeidas ?? 0);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    cargar();
    // Tiempo real (SSE) + polling de respaldo por si la conexión se cae.
    const es = new EventSource("/api/cuenta/realtime");
    es.onmessage = () => cargar();
    const t = setInterval(cargar, POLL_MS);
    return () => {
      es.close();
      clearInterval(t);
    };
  }, [cargar]);

  useEffect(() => {
    if (!abierto) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [abierto]);

  async function marcar(n: NotificacionCliente) {
    if (!n.leida) {
      await fetch(`/api/cuenta/notificaciones/${n.id}/leer`, { method: "POST" }).catch(() => {});
      setNoLeidas((c) => Math.max(0, c - 1));
      setItems((arr) => arr.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    }
  }

  async function marcarTodas() {
    await fetch("/api/cuenta/notificaciones/leer-todas", { method: "POST" }).catch(() => {});
    setItems((arr) => arr.map((x) => ({ ...x, leida: true })));
    setNoLeidas(0);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Notificaciones"
        className="relative rounded-lg p-2 hover:bg-gray-100"
      >
        <span className="text-xl">🔔</span>
        {noLeidas > 0 && (
          <span className="-right-0.5 -top-0.5 absolute flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 font-bold text-[11px] text-white">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="font-semibold text-gray-700 text-sm">Notificaciones</span>
            {noLeidas > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                className="text-marca text-xs hover:underline"
              >
                Marcar todas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-gray-400 text-sm">Sin notificaciones</p>
            ) : (
              items.map((n) => <FilaNotificacion key={n.id} n={n} onMarcar={marcar} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilaNotificacion({
  n,
  onMarcar,
}: {
  n: NotificacionCliente;
  onMarcar: (n: NotificacionCliente) => void;
}) {
  const contenido = (
    <div className="flex items-start gap-2">
      {!n.leida && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-marca" />}
      <div className={n.leida ? "pl-4" : ""}>
        <p className="font-medium text-gray-800 text-sm">{n.titulo}</p>
        <p className="text-gray-500 text-xs">{n.cuerpo}</p>
        <p className="mt-0.5 text-[11px] text-gray-400">
          {new Date(n.createdAt).toLocaleString("es-MX")}
        </p>
      </div>
    </div>
  );
  const cls = `block w-full border-b px-4 py-3 text-left hover:bg-gray-50 ${
    n.leida ? "" : "bg-marca/5"
  }`;
  return n.link ? (
    <Link href={n.link} onClick={() => onMarcar(n)} className={cls}>
      {contenido}
    </Link>
  ) : (
    <button type="button" onClick={() => onMarcar(n)} className={cls}>
      {contenido}
    </button>
  );
}
