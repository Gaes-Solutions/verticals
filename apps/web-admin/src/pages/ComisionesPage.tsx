import { useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";
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
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const puedeGestionar = puede("comisiones.gestionar");

  const cargar = useCallback(() => {
    setCargando(true);
    setError(null);
    api<ReglaComision[]>("/t/comisiones/reglas")
      .then((r) => {
        setReglas(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar las reglas"))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
    api<Categoria[] | Paged<Categoria>>("/t/categorias")
      .then((r) => setCategorias(Array.isArray(r) ? r : r.items))
      .catch(() => setCategorias([]));
  }, [cargar]);

  async function borrar(id: string) {
    try {
      await api(`/t/comisiones/reglas/${id}`, { method: "DELETE" });
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar la regla");
    }
  }

  function alcance(r: ReglaComision): string {
    if (r.producto) return `Producto: ${r.producto.nombre}`;
    if (r.categoria) return `Categoría: ${r.categoria.nombre}`;
    return "Todas las ventas";
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Comisiones</h1>
        {puedeGestionar && (
          <button
            type="button"
            data-tour="com-nuevo"
            onClick={() => setModal(true)}
            className="gx-btn-primary"
          >
            + Nueva regla
          </button>
        )}
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Define cuánto gana el vendedor por cada venta o cobro. Si hay varias, gana la de mayor
        prioridad (número menor).
      </p>

      {error && !cargando && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-light p-3 text-danger text-sm">
          <span>{error}</span>
          <button type="button" onClick={cargar} className="gx-btn-danger">
            Reintentar
          </button>
        </div>
      )}

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Regla</th>
              <th className="gx-th text-right">%</th>
              <th className="gx-th">Sobre</th>
              <th className="gx-th">Aplica a</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td className="gx-td text-slate-400" colSpan={5}>
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && !error && reglas.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={5}>
                  Sin reglas. Crea la primera (ej. "5% sobre ventas").
                </td>
              </tr>
            )}
            {!cargando &&
              reglas.map((r) => (
                <tr key={r.id}>
                  <td className="gx-td font-medium">
                    {r.nombre}
                    {!r.isActive && <span className="ml-2 text-xs text-slate-400">(inactiva)</span>}
                  </td>
                  <td className="gx-td text-right font-semibold">{r.pct}%</td>
                  <td className="gx-td text-slate-600">
                    {r.base === "cobro" ? "El cobro" : "La venta"}
                  </td>
                  <td className="gx-td text-slate-600">{alcance(r)}</td>
                  <td className="gx-td text-right">
                    {puedeGestionar && (
                      <button type="button" onClick={() => borrar(r.id)} className="gx-btn-danger">
                        Eliminar
                      </button>
                    )}
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
            cargar();
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
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-w-md">
        <h2 className="mb-4 text-lg font-bold text-slate-800">Nueva regla de comisión</h2>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Nombre
            <input
              data-tour="com-f-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Comisión general"
              className="gx-input mt-1"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Porcentaje (%)
              <input
                type="number"
                step="0.1"
                data-tour="com-f-pct"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder="5"
                className="gx-input mt-1"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Se paga sobre
              <select
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="gx-input mt-1"
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
              className="gx-input mt-1"
            >
              <option value="">Todas las ventas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  Solo categoría: {c.nombre}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary flex-1">
            Cancelar
          </button>
          <button
            type="button"
            data-tour="com-f-crear"
            onClick={crear}
            disabled={guardando || !nombre || !(pctNum > 0 && pctNum <= 100)}
            className="gx-btn-primary flex-1 disabled:opacity-50"
          >
            {guardando ? "Creando…" : "Crear regla"}
          </button>
        </div>
      </div>
    </div>
  );
}
