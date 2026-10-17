"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { etiquetaPedido } from "@/lib/seguimiento-contract";
import { useConsultaPedido } from "@/lib/use-consulta-pedido";

function SeguimientoInner() {
  const sp = useSearchParams();
  const [folio, setFolio] = useState(sp.get("folio") ?? "");
  const [email, setEmail] = useState(sp.get("email") ?? "");
  const { resultado, consultar, cancelar } = useConsultaPedido();
  const data =
    resultado.folio === folio.trim() && resultado.email === email.trim() ? resultado.pedido : null;
  const { error, buscando } = resultado;

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    void consultar(folio, email);
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Rastrear pedido</h1>
      <form onSubmit={buscar} className="gx-card space-y-3">
        <label className="block">
          <span className="gx-label">Folio</span>
          <input
            value={folio}
            onChange={(e) => {
              cancelar();
              setFolio(e.target.value);
            }}
            placeholder="GP-00000001"
            required
            className="gx-input min-h-11"
          />
        </label>
        <label className="block">
          <span className="gx-label">Email de compra</span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              cancelar();
              setEmail(e.target.value);
            }}
            placeholder="correo@ejemplo.com"
            required
            className="gx-input min-h-11"
          />
        </label>
        <button type="submit" disabled={buscando} className="gx-btn-primary min-h-12 w-full">
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="min-w-0 break-all font-bold">{data.folioPublico}</span>
            <span
              className={`${data.statusPedido === "cancelado" ? "gx-badge-danger" : "gx-badge-info"} min-w-0 max-w-full break-words whitespace-normal`}
            >
              {etiquetaPedido(data)}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Total: ${Number(data.total).toFixed(2)}</p>
          {data.guiaTracking && (
            <p className="mt-1 break-all text-sm text-slate-500">Guía: {data.guiaTracking}</p>
          )}
          <ol className="mt-6 space-y-3 border-l-2 border-marca/30 pl-4">
            {data.eventos.map((ev, idx) => (
              <li key={`${ev.tipo}-${idx}`} className="relative">
                <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-marca" />
                <p className="break-words text-sm font-medium">{ev.descripcion}</p>
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
