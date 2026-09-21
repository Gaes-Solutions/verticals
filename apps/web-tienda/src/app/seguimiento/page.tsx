"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

interface Seguimiento {
  folioPublico: string;
  statusPedido: string;
  total: string;
  guiaTracking: string | null;
  eventos: Array<{ tipo: string; descripcion: string; fecha: string }>;
}

const ESTADO_LABEL: Record<string, string> = {
  recibido: "Recibido",
  pago_confirmado: "Pago confirmado",
  preparando: "Preparando",
  listo_pickup: "Listo para recoger",
  enviado: "Enviado",
  en_camino: "En camino",
  entregado: "Entregado",
  recogido: "Recogido",
  cancelado: "Cancelado",
};

function SeguimientoInner() {
  const sp = useSearchParams();
  const [folio, setFolio] = useState(sp.get("folio") ?? "");
  const [email, setEmail] = useState(sp.get("email") ?? "");
  const [data, setData] = useState<Seguimiento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [recienComprado] = useState(sp.get("ok") === "1");

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    if (buscando) return;
    if (!folio.trim() || !email.trim()) {
      setError("Ingresa el folio de tu pedido y el correo de compra.");
      return;
    }
    setError(null);
    setData(null);
    setBuscando(true);
    try {
      const res = await fetch(
        `/api/seguimiento?folio=${encodeURIComponent(folio.trim())}&email=${encodeURIComponent(email.trim())}`,
      );
      if (res.status === 404) {
        setError("No encontramos ese pedido. Verifica folio y email.");
        return;
      }
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError("No se pudo consultar tu pedido. Inténtalo de nuevo en un momento.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      {recienComprado && !data && (
        <div className="mb-6 rounded-lg border border-ok/40 bg-ok-light p-4 text-ok">
          🎉 ¡Gracias por tu compra! Tu pedido <strong>{folio}</strong> fue confirmado. Búscalo
          abajo.
        </div>
      )}
      <h1 className="mb-6 text-2xl font-bold">Rastrear pedido</h1>
      <form onSubmit={buscar} className="gx-card space-y-3">
        <label className="block">
          <span className="gx-label">Folio</span>
          <input
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
            placeholder="GP-00000001"
            required
            className="gx-input"
          />
        </label>
        <label className="block">
          <span className="gx-label">Email de compra</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            required
            className="gx-input"
          />
        </label>
        <button type="submit" disabled={buscando} className="gx-btn-primary w-full">
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded bg-danger-light p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {data && (
        <div className="gx-card mt-6">
          <div className="flex items-center justify-between">
            <span className="font-bold">{data.folioPublico}</span>
            <span
              className={data.statusPedido === "cancelado" ? "gx-badge-danger" : "gx-badge-info"}
            >
              {ESTADO_LABEL[data.statusPedido] ?? data.statusPedido}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Total: ${Number(data.total).toFixed(2)}</p>
          {data.guiaTracking && (
            <p className="mt-1 text-sm text-slate-500">Guía: {data.guiaTracking}</p>
          )}
          <ol className="mt-6 space-y-3 border-l-2 border-marca/30 pl-4">
            {data.eventos.map((ev, idx) => (
              <li key={`${ev.tipo}-${idx}`} className="relative">
                <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-marca" />
                <p className="text-sm font-medium">{ev.descripcion}</p>
                <p className="text-xs text-slate-400">
                  {new Date(ev.fecha).toLocaleString("es-MX")}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function SeguimientoPage() {
  return (
    <Suspense fallback={<p>Cargando…</p>}>
      <SeguimientoInner />
    </Suspense>
  );
}
