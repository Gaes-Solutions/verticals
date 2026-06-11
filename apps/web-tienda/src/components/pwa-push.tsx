"use client";

import { useEffect, useState } from "react";

interface TiendaConfigPublic {
  pushHabilitado: boolean;
  vapidPublicKey: string | null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Estado = "cargando" | "no-disponible" | "lista" | "activa" | "bloqueada";

/**
 * Registra el service worker (PWA instalable) y, si el cliente lo activa,
 * suscribe Web Push. Solo aparece si el tenant tiene push habilitado y hay
 * llave VAPID. Pensado para la página de cuenta (cliente con sesión).
 */
export function PwaPush() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [vapid, setVapid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setEstado("no-disponible");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js").catch(() => null);
      const cfg = (await fetch("/api/tienda-config")
        .then((r) => r.json())
        .catch(() => null)) as TiendaConfigPublic | null;
      if (cancelado) return;
      if (!reg || !cfg?.pushHabilitado || !cfg.vapidPublicKey) {
        setEstado("no-disponible");
        return;
      }
      setVapid(cfg.vapidPublicKey);
      if (Notification.permission === "denied") {
        setEstado("bloqueada");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "activa" : "lista");
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  async function activar() {
    if (!vapid) return;
    setBusy(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado("bloqueada");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await fetch("/api/cuenta/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      });
      setEstado(res.ok ? "activa" : "lista");
    } catch {
      setEstado("lista");
    } finally {
      setBusy(false);
    }
  }

  async function desactivar() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/cuenta/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado("lista");
    } finally {
      setBusy(false);
    }
  }

  if (estado === "cargando" || estado === "no-disponible") return null;

  return (
    <div className="rounded-lg border bg-white p-4 text-sm">
      <p className="font-medium">Notificaciones de tus pedidos</p>
      {estado === "bloqueada" ? (
        <p className="mt-1 text-gray-500">
          Las notificaciones están bloqueadas en tu navegador. Actívalas desde la configuración del
          sitio.
        </p>
      ) : estado === "activa" ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-gray-500">Activadas ✓ Te avisaremos cuando tu pedido avance.</span>
          <button
            type="button"
            onClick={desactivar}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Desactivar
          </button>
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-gray-500">Recibe avisos de pago, envío y entrega.</span>
          <button
            type="button"
            onClick={activar}
            disabled={busy}
            className="rounded-lg bg-marca px-4 py-1.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Activando…" : "Activar"}
          </button>
        </div>
      )}
    </div>
  );
}
