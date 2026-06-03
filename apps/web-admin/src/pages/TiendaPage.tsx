import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";
import type { ConfigTienda, Paged, Producto } from "../lib/types.js";

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function TiendaPage() {
  const [config, setConfig] = useState<ConfigTienda>({});
  const [productos, setProductos] = useState<Producto[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<ConfigTienda>("/t/ecommerce/config")
      .then((c) => setConfig(c ?? {}))
      .catch(() => setConfig({}));
    api<Paged<Producto>>("/t/productos?pageSize=50")
      .then((r) => setProductos(r.items))
      .catch(() => setProductos([]));
  }, []);

  async function guardarConfig() {
    setError(null);
    setMsg(null);
    setGuardando(true);
    try {
      await api("/t/ecommerce/config", {
        method: "PUT",
        body: {
          activa: config.activa ?? false,
          subdominio: config.subdominio ?? "",
          nombre: config.nombre ?? "",
        },
      });
      setMsg("✓ Configuración guardada");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function publicar(p: Producto) {
    setError(null);
    setMsg(null);
    try {
      await api("/t/ecommerce/productos-publicados", {
        body: {
          productoId: p.id,
          tituloPublico: p.nombre,
          slugSeo: slugify(p.nombre) || p.skuPadre.toLowerCase(),
          descripcionMd: p.nombre,
          destacadoHome: false,
        },
      });
      setMsg(`✓ "${p.nombre}" publicado en la tienda`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al publicar (¿ya estaba publicado?)");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Tienda online</h1>

      <section className="mb-8 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-bold text-slate-800">Configuración</h2>
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={config.activa ?? false}
            onChange={(e) => setConfig({ ...config, activa: e.target.checked })}
          />
          Tienda activa (visible al público)
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Nombre de la tienda</span>
          <input
            value={config.nombre ?? ""}
            onChange={(e) => setConfig({ ...config, nombre: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Subdominio</span>
          <input
            value={config.subdominio ?? ""}
            onChange={(e) => setConfig({ ...config, subdominio: e.target.value })}
            placeholder="mi-tienda"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={guardarConfig}
          disabled={guardando}
          className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">Publicar productos</h2>
        <p className="mb-4 text-sm text-slate-500">
          Pon tus productos a la venta en la tienda online.
        </p>
        <div className="max-h-72 overflow-y-auto">
          {productos.map((p) => (
            <div
              key={p.id}
              className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
            >
              <span className="text-sm font-medium text-slate-800">{p.nombre}</span>
              <button
                type="button"
                onClick={() => publicar(p)}
                className="rounded-lg border border-brand px-3 py-1 text-sm font-semibold text-brand hover:bg-teal-50"
              >
                Publicar
              </button>
            </div>
          ))}
          {productos.length === 0 && (
            <p className="text-sm text-slate-400">
              Crea productos primero en la sección Productos.
            </p>
          )}
        </div>
      </section>

      {msg && <p className="mt-4 text-sm text-emerald-600">{msg}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
