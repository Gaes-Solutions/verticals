import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";
import type { Paged, Producto } from "../lib/types.js";

const TIPO_LABEL: Record<string, string> = {
  publico: "Público",
  mayoreo_nivel: "Mayoreo (por nivel)",
  cliente_individual: "Cliente específico",
};

interface ListaResumen {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  isDefault?: boolean;
  _count?: { items: number };
}
interface ListaItem {
  varianteId: string;
  precio: string;
  variante: { id: string; sku: string };
}
interface ListaDetalle extends ListaResumen {
  items: ListaItem[];
}

export function PreciosPage() {
  const [listas, setListas] = useState<ListaResumen[]>([]);
  const [sel, setSel] = useState<ListaDetalle | null>(null);
  const [modalNueva, setModalNueva] = useState(false);

  const cargar = useCallback(async () => {
    setListas(await api<ListaResumen[]>("/t/precios/listas"));
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function abrir(id: string) {
    setSel(await api<ListaDetalle>(`/t/precios/listas/${id}`));
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Listas de precios</h1>
        <button
          type="button"
          onClick={() => setModalNueva(true)}
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
        >
          + Nueva lista
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        {/* Listas */}
        <div className="space-y-2">
          {listas.length === 0 && (
            <p className="rounded-lg bg-white p-4 text-sm text-slate-400 shadow-sm">
              Sin listas. Crea la primera (ej. "Mayoreo").
            </p>
          )}
          {listas.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => abrir(l.id)}
              className={`w-full rounded-lg border p-3 text-left shadow-sm ${
                sel?.id === l.id ? "border-brand bg-brand/5" : "border-slate-200 bg-white"
              }`}
            >
              <p className="font-semibold text-slate-800">{l.nombre}</p>
              <p className="text-xs text-slate-500">
                {l.codigo} · {TIPO_LABEL[l.tipo] ?? l.tipo} · {l._count?.items ?? 0} productos
              </p>
            </button>
          ))}
        </div>

        {/* Detalle de la lista seleccionada */}
        <div>
          {sel ? (
            <DetalleLista lista={sel} onCambio={() => abrir(sel.id).then(cargar)} />
          ) : (
            <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
              Selecciona una lista para ver y editar sus precios.
            </p>
          )}
        </div>
      </div>

      {modalNueva && (
        <NuevaListaModal
          onClose={() => setModalNueva(false)}
          onCreada={() => {
            setModalNueva(false);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function DetalleLista({ lista, onCambio }: { lista: ListaDetalle; onCambio: () => void }) {
  const [busq, setBusq] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [precio, setPrecio] = useState("");
  const [sel, setSel] = useState<{ varianteId: string; nombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (busq.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await api<Paged<Producto>>(`/t/productos?q=${encodeURIComponent(busq)}&pageSize=8`);
      setResultados(r.items);
    }, 250);
    return () => clearTimeout(t);
  }, [busq]);

  async function agregar() {
    if (!sel || !(Number.parseFloat(precio) > 0)) return;
    setError(null);
    try {
      await api(`/t/precios/listas/${lista.id}/items`, {
        method: "PUT",
        body: { varianteId: sel.varianteId, precio },
      });
      setSel(null);
      setBusq("");
      setPrecio("");
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el precio");
    }
  }

  async function quitar(varianteId: string) {
    await api(`/t/precios/listas/${lista.id}/items/${varianteId}`, { method: "DELETE" }).catch(
      () => undefined,
    );
    onCambio();
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="mb-1 font-bold text-slate-800">{lista.nombre}</h2>
      <p className="mb-4 text-xs text-slate-500">
        {lista.codigo} · {TIPO_LABEL[lista.tipo] ?? lista.tipo}
      </p>

      {/* Agregar producto a la lista */}
      <div className="mb-4 rounded-lg bg-slate-50 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">Poner precio a un producto</p>
        {sel ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 text-sm text-slate-700">{sel.nombre}</span>
            <input
              type="number"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="Precio"
              className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={agregar}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setSel(null)}
              className="text-sm text-slate-500"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <input
              value={busq}
              onChange={(e) => setBusq(e.target.value)}
              placeholder="Buscar producto…"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-brand focus:outline-none"
            />
            {resultados.length > 0 && (
              <div className="mt-2 space-y-1">
                {resultados.map((p) => {
                  const v = p.variantes[0];
                  if (!v) return null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSel({ varianteId: v.id, nombre: p.nombre })}
                      className="block w-full rounded px-2 py-1 text-left text-sm text-slate-700 hover:bg-white"
                    >
                      {p.nombre} <span className="text-slate-400">· {v.sku}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Items */}
      {lista.items.length === 0 ? (
        <p className="text-sm text-slate-400">Aún no hay precios en esta lista.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">SKU</th>
                <th className="py-1 text-right">Precio</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {lista.items.map((it) => (
                <tr key={it.varianteId} className="border-t border-slate-100">
                  <td className="py-2 text-slate-700">{it.variante.sku}</td>
                  <td className="py-2 text-right font-medium text-slate-800">
                    ${Number.parseFloat(it.precio).toFixed(2)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => quitar(it.varianteId)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NuevaListaModal({ onClose, onCreada }: { onClose: () => void; onCreada: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("mayoreo_nivel");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    setError(null);
    setGuardando(true);
    try {
      await api("/t/precios/listas", { body: { codigo, nombre, tipo } });
      onCreada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la lista");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-slate-800">Nueva lista de precios</h2>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Código
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/\s/g, "_"))}
              placeholder="MAYOREO"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Nombre
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Precio de mayoreo"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Tipo
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            >
              <option value="mayoreo_nivel">Mayoreo (por nivel)</option>
              <option value="cliente_individual">Cliente específico</option>
              <option value="publico">Público</option>
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
            disabled={guardando || !codigo || !nombre}
            className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Creando…" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
