import { useCallback, useEffect, useRef, useState } from "react";
import { EstadoError } from "../components/Estados.js";
import { Skeleton } from "../components/Skeleton.js";
import { api } from "../lib/api.js";
import { agregar } from "../lib/carrito.js";
import type { CatalogoResp, ProductoCatalogo } from "../lib/types.js";

export function CatalogoPage({ onAgregado }: { onAgregado: () => void }) {
  const [items, setItems] = useState<ProductoCatalogo[]>([]);
  const [page, setPage] = useState(1);
  const [hayMas, setHayMas] = useState(false);
  const [q, setQ] = useState("");
  const [conLista, setConLista] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (avisoTimeout.current !== null) window.clearTimeout(avisoTimeout.current);
    };
  }, []);

  const cargar = useCallback(
    (nuevaPage: number, acumular: boolean) => {
      if (acumular) setCargandoMas(true);
      else setLoading(true);
      setError(null);
      api<CatalogoResp>(
        `/b2b-portal/catalogo?q=${encodeURIComponent(q)}&page=${nuevaPage}`,
      )
        .then((r) => {
          setItems((prev) => (acumular ? [...prev, ...r.items] : r.items));
          setPage(r.page);
          setHayMas(r.page * r.pageSize < r.total);
          setConLista(r.listaPrecioCodigo !== null);
        })
        .catch(() => setError("No se pudo cargar el catálogo."))
        .finally(() => {
          setLoading(false);
          setCargandoMas(false);
        });
    },
    [q],
  );

  useEffect(() => {
    const t = window.setTimeout(() => cargar(1, false), 300);
    return () => window.clearTimeout(t);
  }, [cargar]);

  function agregarVariante(p: ProductoCatalogo, varianteId: string) {
    const v = p.variantes.find((x) => x.varianteId === varianteId);
    if (!v) return;
    agregar({
      varianteId: v.varianteId,
      sku: v.sku,
      nombre: p.nombre + (v.nombreVariante ? ` — ${v.nombreVariante}` : ""),
      precio: v.precio,
      cantidad: 1,
    });
    setAviso(`Agregado: ${p.nombre}`);
    onAgregado();
    if (avisoTimeout.current !== null) window.clearTimeout(avisoTimeout.current);
    avisoTimeout.current = window.setTimeout(() => setAviso(null), 1500);
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Catálogo</h1>
      <p className="mb-4 text-sm text-slate-500">
        {conLista ? "Precios de tu lista mayorista" : "Precios de lista general"}
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar producto o SKU…"
        aria-label="Buscar producto o SKU"
        className="gx-input mb-4 max-w-md"
      />

      {aviso && <p className="mb-3 rounded-lg bg-ok-light px-3 py-2 text-sm text-ok">{aviso}</p>}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error && items.length === 0 ? (
        <EstadoError mensaje={error} onRetry={() => cargar(1, false)} />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((p) => (
              <div key={p.productoId} className="gx-card">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">{p.nombre}</p>
                    <p className="text-xs text-slate-500">
                      {p.skuPadre}
                      {p.categoria ? ` · ${p.categoria}` : ""}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  {p.variantes.map((v) => (
                    <div
                      key={v.varianteId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                    >
                      <span>{v.nombreVariante ?? v.sku}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-semibold text-brand">
                          ${Number(v.precio).toFixed(2)}
                        </span>
                        {v.precioLista && <span className="gx-badge-info">tu precio</span>}
                        <button
                          type="button"
                          onClick={() => agregarVariante(p, v.varianteId)}
                          className="gx-btn-secondary"
                        >
                          Agregar
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <p className="gx-card text-center text-sm text-slate-500">Sin productos.</p>
            )}
          </div>

          {hayMas && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => cargar(page + 1, true)}
                disabled={cargandoMas}
                className="gx-btn-secondary"
              >
                {cargandoMas ? "Cargando…" : "Cargar más"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
