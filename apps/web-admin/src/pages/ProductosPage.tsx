import { useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";
import type { Categoria, Paged, Producto } from "../lib/types.js";

export function ProductosPage() {
  const [items, setItems] = useState<Producto[]>([]);
  const [query, setQuery] = useState("");
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState<Producto | "nuevo" | null>(null);
  const puedeCrear = puede("productos.crear");
  const puedeEditar = puede("productos.actualizar");
  const puedeArchivar = puede("productos.archivar");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await api<Paged<Producto>>(
        `/t/productos?pageSize=50${query ? `&q=${encodeURIComponent(query)}` : ""}`,
      );
      setItems(res.items);
    } finally {
      setCargando(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  async function archivar(id: string) {
    if (!confirm("¿Archivar este producto?")) return;
    await api(`/t/productos/${id}`, { method: "DELETE" });
    void cargar();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Productos</h1>
        {puedeCrear && (
          <button
            type="button"
            onClick={() => setModal("nuevo")}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
          >
            + Nuevo producto
          </button>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o SKU…"
        className="mb-4 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
      />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Producto</th>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2 text-right">Precio</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Sin productos. Crea el primero.
                </td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{p.nombre}</td>
                <td className="px-4 py-2 text-slate-500">{p.skuPadre}</td>
                <td className="px-4 py-2 text-right text-slate-700">
                  {p.variantes[0]
                    ? `$${Number.parseFloat(p.variantes[0].precioBase).toFixed(2)}`
                    : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => setModal(p)}
                      className="mr-3 text-brand hover:underline"
                    >
                      Editar
                    </button>
                  )}
                  {puedeArchivar && (
                    <button
                      type="button"
                      onClick={() => archivar(p.id)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      Archivar
                    </button>
                  )}
                  {!puedeEditar && !puedeArchivar && <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <ProductoModal
          producto={modal === "nuevo" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function ProductoModal({
  producto,
  onClose,
  onSaved,
}: {
  producto: Producto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editando = producto !== null;
  const [skuPadre, setSkuPadre] = useState(producto?.skuPadre ?? "");
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [precioBase, setPrecioBase] = useState(producto?.variantes[0]?.precioBase ?? "");
  const [aplicaIva, setAplicaIva] = useState(producto?.aplicaIva ?? true);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaId, setCategoriaId] = useState(producto?.categoriaId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<Categoria[] | Paged<Categoria>>("/t/categorias")
      .then((r) => setCategorias(Array.isArray(r) ? r : r.items))
      .catch(() => setCategorias([]));
  }, []);

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      if (editando && producto) {
        await api(`/t/productos/${producto.id}`, {
          method: "PATCH",
          body: { nombre, aplicaIva, ...(categoriaId ? { categoriaId } : {}) },
        });
      } else {
        await api("/t/productos", {
          body: {
            skuPadre,
            nombre,
            precioBase,
            aplicaIva,
            tasaIva: "16",
            ...(categoriaId ? { categoriaId } : {}),
          },
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          {editando ? "Editar producto" : "Nuevo producto"}
        </h2>
        <div className="space-y-3">
          {!editando && (
            <Field label="SKU">
              <input
                value={skuPadre}
                onChange={(e) => setSkuPadre(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </Field>
          )}
          <Field label="Nombre">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            />
          </Field>
          {!editando && (
            <Field label="Precio (IVA incluido)">
              <input
                type="number"
                step="0.01"
                value={precioBase}
                onChange={(e) => setPrecioBase(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </Field>
          )}
          <Field label="Categoría">
            <select
              value={categoriaId ?? ""}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={aplicaIva}
              onChange={(e) => setAplicaIva(e.target.checked)}
            />
            Aplica IVA (16%)
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
            onClick={guardar}
            disabled={guardando || !nombre || (!editando && (!skuPadre || !precioBase))}
            className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </div>
  );
}
