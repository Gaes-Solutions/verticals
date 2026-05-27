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
  const [recienComprado] = useState(sp.get("ok") === "1");

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setData(null);
    const res = await fetch(`/api/seguimiento?folio=${folio}&email=${encodeURIComponent(email)}`);
    if (!res.ok) {
      setError("No encontramos ese pedido. Verifica folio y email.");
      return;
    }
    setData(await res.json());
  }

  return (
    <div className="mx-auto max-w-lg">
      {recienComprado && !data && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          🎉 ¡Gracias por tu compra! Tu pedido <strong>{folio}</strong> fue confirmado. Búscalo
          abajo.
        </div>
      )}
      <h1 className="mb-6 text-2xl font-bold">Rastrear pedido</h1>
      <form onSubmit={buscar} className="space-y-3 rounded-lg border bg-white p-6">
        <input
          value={folio}
          onChange={(e) => setFolio(e.target.value)}
          placeholder="Folio (GP-00000001)"
          className="w-full rounded border px-3 py-2"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email de compra"
          className="w-full rounded border px-3 py-2"
        />
        <button
          type="submit"
          className="w-full rounded bg-marca py-2 font-medium text-white hover:bg-marca-dark"
        >
          Buscar
        </button>
      </form>

      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {data && (
        <div className="mt-6 rounded-lg border bg-white p-6">
          <div className="flex items-center justify-between">
            <span className="font-bold">{data.folioPublico}</span>
            <span className="rounded-full bg-marca/10 px-3 py-1 text-sm font-medium text-marca">
              {ESTADO_LABEL[data.statusPedido] ?? data.statusPedido}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-500">Total: ${Number(data.total).toFixed(2)}</p>
          {data.guiaTracking && (
            <p className="mt-1 text-sm text-gray-500">Guía: {data.guiaTracking}</p>
          )}
          <ol className="mt-6 space-y-3 border-l-2 border-marca/30 pl-4">
            {data.eventos.map((ev, idx) => (
              <li key={`${ev.tipo}-${idx}`} className="relative">
                <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-marca" />
                <p className="text-sm font-medium">{ev.descripcion}</p>
                <p className="text-xs text-gray-400">
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
