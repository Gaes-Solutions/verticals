import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";
import type { Categoria, Paged } from "../lib/types.js";

interface ReglaComision {
  id: string;
  nombre: string;
  base: string;
  pct: number;
  prioridad: number;
  isActive: boolean;
  categoria?: { id: string; nombre: string } | null;
  producto?: { id: string; nombre: string } | null;
}

export function ComisionesPage() {
  const [reglas, setReglas] = useState<ReglaComision[]>([]);
  const [modal, setModal] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const cargar = useCallback(async () => {
    setReglas(await api<ReglaComision[]>("/t/comisiones/reglas"));
  }, []);

  useEffect(() => {
    void cargar();
    api<Categoria[] | Paged<Categoria>>("/t/categorias")
      .then((r) => setCategorias(Array.isArray(r) ? r : r.items))
      .catch(() => setCategorias([]));
  }, [cargar]);

  async function borrar(id: string) {
    await api(`/t/comisiones/reglas/${id}`, { method: "DELETE" }).catch(() => undefined);
    void cargar();
  }

  function alcance(r: ReglaComision): string {
    if (r.producto) return `Producto: ${r.producto.nombre}`;
    if (r.categoria) return `Categoría: ${r.categoria.nombre}`;
    return "Todas las ventas";
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Comisiones</h1>
        <button
          type="button"
          data-tour="com-nuevo"
          onClick={() => setModal(true)}
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
        >
          + Nueva regla
        </button>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Define cuánto gana el vendedor por cada venta o cobro. Si hay varias, gana la de mayor
        prioridad (número menor).
      </p>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Regla</th>
              <th className="px-4 py-2 text-right">%</th>
              <th className="px-4 py-2">Sobre</th>
              <th className="px-4 py-2">Aplica a</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {reglas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Sin reglas. Crea la primera (ej. "5% sobre ventas").
                </td>
              </tr>
            )}
            {reglas.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">
                  {r.nombre}
                  {!r.isActive && <span className="ml-2 text-xs text-slate-400">(inactiva)</span>}
                </td>
                <td className="px-4 py-2 text-right font-semibold text-slate-800">{r.pct}%</td>
                <td className="px-4 py-2 text-slate-600">
                  {r.base === "cobro" ? "El cobro" : "La venta"}
                </td>
                <td className="px-4 py-2 text-slate-600">{alcance(r)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => borrar(r.id)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <NuevaReglaModal
          categorias={categorias}
          onClose={() => setModal(false)}
          onCreada={() => {
            setModal(false);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function NuevaReglaModal({
  categorias,
  onClose,
  onCreada,
}: {
  categorias: Categoria[];
  onClose: () => void;
  onCreada: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [pct, setPct] = useState("");
  const [base, setBase] = useState("venta");
  const [categoriaId, setCategoriaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    setError(null);
    setGuardando(true);
    try {
      await api("/t/comisiones/reglas", {
        body: {
          nombre,
          pct: Number.parseFloat(pct),
          base,
          ...(categoriaId ? { categoriaId } : {}),
        },
      });
      onCreada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la regla");
    } finally {
      setGuardando(false);
    }
  }

  const pctNum = Number.parseFloat(pct);

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-slate-800">Nueva regla de comisión</h2>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Nombre
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Comisión general"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-700">
              Porcentaje (%)
              <input
                type="number"
                step="0.1"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder="5"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Se paga sobre
              <select
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              >
                <option value="venta">La venta</option>
                <option value="cobro">El cobro (cuando pagan)</option>
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Aplica a
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            >
              <option value="">Todas las ventas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  Solo categoría: {c.nombre}
                </option>
              ))}
            </select>
          </label>
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
            onClick={crear}
            disabled={guardando || !nombre || !(pctNum > 0 && pctNum <= 100)}
            className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Creando…" : "Crear regla"}
          </button>
        </div>
      </div>
    </div>
  );
}
