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
          msiHabilitado: config.msiHabilitado ?? false,
          msiMeses: config.msiMeses ?? [3, 6, 12],
          msiMontoMinimo: String(config.msiMontoMinimo ?? 0),
          galeriaZoom: config.galeriaZoom ?? true,
          mostrarRatingProducto: config.mostrarRatingProducto ?? true,
          cuponEnCheckout: config.cuponEnCheckout ?? true,
          comprarAhora: config.comprarAhora ?? true,
          cancelacionCliente: config.cancelacionCliente ?? true,
          facturacionSelfService: config.facturacionSelfService ?? true,
          preguntasPublicas: config.preguntasPublicas ?? true,
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

      <section className="mb-8 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">Funciones de la tienda</h2>
        <p className="mb-4 text-slate-500 text-sm">
          Activa solo lo que quieras mostrar. Se aplican a tu tienda al guardar.
        </p>

        <div className="mb-4 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 font-medium text-slate-800 text-sm">
            <input
              type="checkbox"
              checked={config.msiHabilitado ?? false}
              onChange={(e) => setConfig({ ...config, msiHabilitado: e.target.checked })}
            />
            Meses sin intereses (MSI)
          </label>
          {config.msiHabilitado && (
            <div className="mt-3 pl-6">
              <p className="mb-1 text-slate-500 text-xs">Plazos que ofreces:</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {[3, 6, 9, 12, 18, 24].map((m) => {
                  const activos = config.msiMeses ?? [3, 6, 12];
                  const on = activos.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setConfig({
                          ...config,
                          msiMeses: on
                            ? activos.filter((x) => x !== m)
                            : [...activos, m].sort((a, b) => a - b),
                        })
                      }
                      className={`rounded-lg border px-3 py-1 text-sm ${
                        on
                          ? "border-brand bg-brand text-white"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {m} meses
                    </button>
                  );
                })}
              </div>
              <label className="block">
                <span className="mb-1 block text-slate-500 text-xs">
                  Monto mínimo de compra para ofrecer MSI ($)
                </span>
                <input
                  type="number"
                  min={0}
                  value={Number(config.msiMontoMinimo ?? 0)}
                  onChange={(e) => setConfig({ ...config, msiMontoMinimo: e.target.value })}
                  className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
        </div>

        <Toggle
          label="Galería de fotos con zoom"
          checked={config.galeriaZoom ?? true}
          onChange={(v) => setConfig({ ...config, galeriaZoom: v })}
        />
        <Toggle
          label="Mostrar calificación (estrellas) en el producto"
          checked={config.mostrarRatingProducto ?? true}
          onChange={(v) => setConfig({ ...config, mostrarRatingProducto: v })}
        />
        <Toggle
          label="Campo de cupón en el checkout"
          checked={config.cuponEnCheckout ?? true}
          onChange={(v) => setConfig({ ...config, cuponEnCheckout: v })}
        />
        <Toggle
          label='Botón "Comprar ahora" (compra rápida)'
          checked={config.comprarAhora ?? true}
          onChange={(v) => setConfig({ ...config, comprarAhora: v })}
        />
        <Toggle
          label="Permitir que el cliente cancele su compra (antes de envío)"
          checked={config.cancelacionCliente ?? true}
          onChange={(v) => setConfig({ ...config, cancelacionCliente: v })}
        />
        <Toggle
          label="Factura (CFDI) self-service desde la cuenta del cliente"
          checked={config.facturacionSelfService ?? true}
          onChange={(v) => setConfig({ ...config, facturacionSelfService: v })}
        />
        <Toggle
          label="Preguntas y respuestas públicas en el producto"
          checked={config.preguntasPublicas ?? true}
          onChange={(v) => setConfig({ ...config, preguntasPublicas: v })}
        />

        <button
          type="button"
          onClick={guardarConfig}
          disabled={guardando}
          className="mt-4 rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar funciones"}
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mb-2 flex items-center gap-2 text-slate-700 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
