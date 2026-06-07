import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { agregar } from "../lib/carrito.js";
import type { CatalogoResp, ProductoCatalogo } from "../lib/types.js";

export function CatalogoPage({ onAgregado }: { onAgregado: () => void }) {
  const [items, setItems] = useState<ProductoCatalogo[]>([]);
  const [q, setQ] = useState("");
  const [conLista, setConLista] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<CatalogoResp>(`/b2b-portal/catalogo?q=${encodeURIComponent(q)}`)
      .then((r) => {
        setItems(r.items);
        setConLista(r.listaPrecioCodigo !== null);
      })
      .catch(() => setItems([]));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(cargar, 300);
    return () => clearTimeout(t);
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
    setTimeout(() => setAviso(null), 1500);
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
        className="mb-4 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2"
      />

      {aviso && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{aviso}</p>
      )}

      <div className="space-y-3">
        {items.map((p) => (
          <div key={p.productoId} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{p.nombre}</p>
                <p className="text-xs text-slate-400">
                  {p.skuPadre}
                  {p.categoria ? ` · ${p.categoria}` : ""}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              {p.variantes.map((v) => (
                <div
                  key={v.varianteId}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <span>{v.nombreVariante ?? v.sku}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold text-brand">${Number(v.precio).toFixed(2)}</span>
                    {v.precioLista && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-brand">
                        tu precio
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => agregarVariante(p, v.varianteId)}
                      className="rounded-lg border border-brand px-3 py-1 text-xs font-semibold text-brand hover:bg-blue-50"
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
          <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
            Sin productos.
          </p>
        )}
      </div>
    </div>
  );
}
