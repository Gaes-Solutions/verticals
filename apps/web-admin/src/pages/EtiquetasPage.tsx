import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { Barcode } from "../components/Barcode.js";
import { api } from "../lib/api.js";
import type { Paged, Producto, Variante } from "../lib/types.js";

interface ItemEtiqueta {
  productoId: string;
  nombre: string;
  sku: string;
  precio: string;
  cantidad: number;
}

const TAMANOS = {
  chica: { w: "40mm", label: "Chica (40mm · impresora de etiquetas)" },
  mediana: { w: "55mm", label: "Mediana (55mm · hoja Avery)" },
} as const;
type Tamano = keyof typeof TAMANOS;

function varOf(p: Producto): Variante | undefined {
  return p.variantes[0];
}

export function EtiquetasPage() {
  const [buscar, setBuscar] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [items, setItems] = useState<ItemEtiqueta[]>([]);
  const [tamano, setTamano] = useState<Tamano>("chica");
  const [incluirPrecio, setIncluirPrecio] = useState(true);
  const [incluirQr, setIncluirQr] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = buscar.trim() ? `&q=${encodeURIComponent(buscar.trim())}` : "";
      api<Paged<Producto>>(`/t/productos?pageSize=30${qs}`)
        .then((r) => setResultados(r.items))
        .catch(() => setResultados([]));
    }, 250);
    return () => clearTimeout(t);
  }, [buscar]);

  function agregar(p: Producto) {
    const v = varOf(p);
    if (!v) return;
    setItems((prev) => {
      const ya = prev.find((i) => i.productoId === p.id);
      if (ya)
        return prev.map((i) => (i.productoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      return [
        ...prev,
        { productoId: p.id, nombre: p.nombre, sku: v.sku, precio: v.precioBase, cantidad: 1 },
      ];
    });
  }

  function setCantidad(id: string, n: number) {
    setItems((prev) =>
      prev.map((i) => (i.productoId === id ? { ...i, cantidad: Math.max(1, n) } : i)),
    );
  }
  function quitar(id: string) {
    setItems((prev) => prev.filter((i) => i.productoId !== id));
  }

  const totalEtiquetas = items.reduce((s, i) => s + i.cantidad, 0);
  const etiquetas = items.flatMap((i) => Array.from({ length: i.cantidad }, () => i));
  const w = TAMANOS[tamano].w;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-bold text-2xl text-slate-800">Etiquetas y códigos</h1>
        <button
          type="button"
          data-tour="etq-imprimir"
          onClick={() => window.print()}
          disabled={totalEtiquetas === 0}
          className="gx-btn-primary disabled:opacity-50"
        >
          Imprimir ({totalEtiquetas})
        </button>
      </div>
      <p className="mb-5 text-slate-500 text-sm">
        Genera el código de barras (escaneable en el POS) y QR de tus productos, e imprime las
        etiquetas.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Buscar y agregar */}
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <input
            data-tour="etq-buscar"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar producto por nombre o SKU…"
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {resultados.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800 text-sm">{p.nombre}</p>
                  <p className="text-slate-400 text-xs">{varOf(p)?.sku ?? "sin SKU"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => agregar(p)}
                  className="rounded-lg border border-brand px-3 py-1 font-semibold text-brand text-sm hover:bg-teal-50"
                >
                  Agregar
                </button>
              </div>
            ))}
            {resultados.length === 0 && <p className="text-slate-400 text-sm">Sin resultados.</p>}
          </div>
        </section>

        {/* Selección + opciones */}
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-2 font-bold text-slate-800">A imprimir</h2>
          <div className="mb-4 max-h-44 space-y-2 overflow-y-auto">
            {items.length === 0 && (
              <p className="text-slate-400 text-sm">Agrega productos de la izquierda.</p>
            )}
            {items.map((i) => (
              <div key={i.productoId} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-700">{i.nombre}</span>
                <input
                  type="number"
                  min={1}
                  value={i.cantidad}
                  onChange={(e) => setCantidad(i.productoId, Number(e.target.value))}
                  className="w-16 rounded border border-slate-300 px-2 py-1"
                />
                <button
                  type="button"
                  onClick={() => quitar(i.productoId)}
                  className="text-red-500 text-xs hover:underline"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-slate-100 border-t pt-3">
            <label className="block">
              <span className="gx-label">Tamaño</span>
              <select
                data-tour="etq-tamano"
                value={tamano}
                onChange={(e) => setTamano(e.target.value as Tamano)}
                className="gx-input"
              >
                {Object.entries(TAMANOS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-slate-700 text-sm">
              <input
                type="checkbox"
                checked={incluirPrecio}
                onChange={(e) => setIncluirPrecio(e.target.checked)}
              />
              Incluir precio
            </label>
            <label className="flex items-center gap-2 text-slate-700 text-sm">
              <input
                type="checkbox"
                checked={incluirQr}
                onChange={(e) => setIncluirQr(e.target.checked)}
              />
              Incluir QR
            </label>
          </div>
        </section>
      </div>

      {/* Vista previa / hoja imprimible */}
      <h2 className="mt-6 mb-2 font-bold text-slate-800">Vista previa</h2>
      <div className="etiquetas-print flex flex-wrap gap-2 rounded-xl bg-white p-4 shadow-sm">
        {etiquetas.length === 0 && (
          <p className="text-slate-400 text-sm">Las etiquetas aparecerán aquí.</p>
        )}
        {etiquetas.map((e, idx) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: lista de copias idénticas
            key={`${e.productoId}-${idx}`}
            style={{ width: w }}
            className="flex flex-col items-center rounded border border-slate-300 p-2 text-center"
          >
            <span className="mb-1 line-clamp-2 font-medium text-[10px] text-slate-800 leading-tight">
              {e.nombre}
            </span>
            <Barcode value={e.sku} height={32} />
            {incluirQr && (
              <div className="mt-1">
                <QRCodeSVG value={e.sku} size={48} />
              </div>
            )}
            {incluirPrecio && (
              <span className="mt-1 font-bold text-slate-900 text-sm">
                ${Number(e.precio).toFixed(2)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
