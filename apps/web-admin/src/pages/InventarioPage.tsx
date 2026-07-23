import { useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";
import type { InventarioItem, Paged, Producto, Sucursal } from "../lib/types.js";

export function InventarioPage() {
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [soloBajo, setSoloBajo] = useState(false);
  const [ajuste, setAjuste] = useState<InventarioItem | null>(null);
  const [entrada, setEntrada] = useState(false);
  const puedeAjustar = puede("inventario.ajustar");

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Inventario</h1>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={soloBajo}
              onChange={(e) => setSoloBajo(e.target.checked)}
            />
            Solo bajo mínimo
          </label>
          {puedeAjustar && (
            <button
              type="button"
              data-tour="inv-nuevo"
              onClick={() => setEntrada(true)}
              className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
            >
              + Entrada de inventario
            </button>
          )}
        </div>
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
                    {puedeAjustar && (
                      <button
                        type="button"
                        onClick={() => setAjuste(i)}
                        className="text-brand hover:underline"
                      >
                        Ajustar
                      </button>
                    )}
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

      {entrada && (
        <EntradaModal
          onClose={() => setEntrada(false)}
          onSaved={() => {
            setEntrada(false);
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

function EntradaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [producto, setProducto] = useState<Producto | null>(null);
  const [varianteId, setVarianteId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("Stock inicial");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<Sucursal[]>("/t/sucursales")
      .then((r) => {
        setSucursales(r);
        const inicial = r.find((s) => s.isDefault) ?? r[0];
        if (inicial) setSucursalId(inicial.id);
      })
      .catch(() => setSucursales([]));
  }, []);

  useEffect(() => {
    if (producto) return;
    const t = setTimeout(() => {
      api<Paged<Producto>>(
        `/t/productos?pageSize=10${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ""}`,
      )
        .then((r) => setResultados(r.items))
        .catch(() => setResultados([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, producto]);

  function elegir(p: Producto) {
    setProducto(p);
    setVarianteId(p.variantes[0]?.id ?? "");
  }

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      await api("/t/inventario/ajustes", {
        body: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad, motivo },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al dar entrada");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-slate-800">Entrada de inventario</h2>
        <p className="mb-4 text-sm text-slate-500">
          Registra mercancía que entra (compra, reabasto o stock inicial): busca el producto y suma
          la cantidad. Para descontar existencias usa “Ajustar” en su renglón.
        </p>
        <div className="space-y-3">
          {!producto ? (
            <>
              <input
                data-tour="inv-f-buscar"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto por nombre o SKU…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
              <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {resultados.length === 0 && (
                  <p className="px-3 py-4 text-center text-sm text-slate-400">Sin resultados.</p>
                )}
                {resultados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => elegir(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-800">{p.nombre}</span>
                    <span className="text-slate-400">{p.skuPadre}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="font-medium text-slate-800">{producto.nombre}</span>
              <button
                type="button"
                onClick={() => {
                  setProducto(null);
                  setVarianteId("");
                }}
                className="text-brand hover:underline"
              >
                Cambiar
              </button>
            </div>
          )}

          {producto && producto.variantes.length > 1 && (
            <select
              value={varianteId}
              onChange={(e) => setVarianteId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            >
              {producto.variantes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombreVariante ?? v.sku}
                </option>
              ))}
            </select>
          )}

          {sucursales.length > 1 && (
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}

          <input
            type="number"
            min={0}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="Cantidad que entra"
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
            disabled={
              guardando || !varianteId || !sucursalId || !cantidad || motivo.trim().length < 3
            }
            className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Dar entrada"}
          </button>
        </div>
      </div>
    </div>
  );
}
