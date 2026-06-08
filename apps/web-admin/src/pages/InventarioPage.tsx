import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";
import type { InventarioItem, Paged } from "../lib/types.js";

export function InventarioPage() {
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [soloBajo, setSoloBajo] = useState(false);
  const [ajuste, setAjuste] = useState<InventarioItem | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await api<Paged<InventarioItem>>(
        `/t/inventario?pageSize=100${soloBajo ? "&stockBajoMinimo=true" : ""}`,
      );
      setItems(res.items);
    } finally {
      setCargando(false);
    }
  }, [soloBajo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Inventario</h1>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={soloBajo}
            onChange={(e) => setSoloBajo(e.target.checked)}
          />
          Solo bajo mínimo
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Producto</th>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Sucursal</th>
              <th className="px-4 py-2 text-right">Stock</th>
              <th className="px-4 py-2 text-right">Mínimo</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Sin registros de inventario.
                </td>
              </tr>
            )}
            {items.map((i) => {
              const bajo = Number(i.stockActual) <= Number(i.stockMinimo);
              return (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {i.variante.producto.nombre}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{i.variante.sku}</td>
                  <td className="px-4 py-2 text-slate-500">{i.sucursal.codigo}</td>
                  <td
                    className={`px-4 py-2 text-right font-semibold ${bajo ? "text-red-600" : "text-slate-800"}`}
                  >
                    {i.stockActual}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500">{i.stockMinimo}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setAjuste(i)}
                      className="text-brand hover:underline"
                    >
                      Ajustar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ajuste && (
        <AjusteModal
          item={ajuste}
          onClose={() => setAjuste(null)}
          onSaved={() => {
            setAjuste(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function AjusteModal({
  item,
  onClose,
  onSaved,
}: {
  item: InventarioItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<"ajuste_positivo" | "ajuste_negativo">("ajuste_positivo");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      await api("/t/inventario/ajustes", {
        body: {
          varianteId: item.varianteId,
          sucursalId: item.sucursalId,
          tipo,
          cantidad,
          motivo,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al ajustar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-slate-800">Ajustar inventario</h2>
        <p className="mb-4 text-sm text-slate-500">
          {item.variante.producto.nombre} · stock actual {item.stockActual}
        </p>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTipo("ajuste_positivo")}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium ${tipo === "ajuste_positivo" ? "border-brand bg-brand text-white" : "border-slate-300 text-slate-700"}`}
            >
              + Entrada
            </button>
            <button
              type="button"
              onClick={() => setTipo("ajuste_negativo")}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium ${tipo === "ajuste_negativo" ? "border-brand bg-brand text-white" : "border-slate-300 text-slate-700"}`}
            >
              − Salida
            </button>
          </div>
          <input
            type="number"
            min={0}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="Cantidad"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (mín. 3 letras)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !cantidad || motivo.trim().length < 3}
            className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
