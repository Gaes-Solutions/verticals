import { useEffect, useState } from "react";
import { loadToken } from "../lib/api.js";
import { type LocalCatalogAccess, searchLocalCatalog } from "../lib/local-catalog.js";
import type { Producto } from "../lib/types.js";

export function OfflineCatalog({
  access,
  onReconnect,
  onLogout,
}: {
  access: LocalCatalogAccess;
  onReconnect: () => void;
  onLogout: () => void;
}) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Producto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);
  const session = access.grant.session;
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() >= access.grant.expiresAt || loadToken() !== access.token) {
        setExpired(true);
        setProducts([]);
      }
    }, 500);
    void access.storage
      .getCatalogManifest()
      .then((value) => setUpdated(value?.serverTime ?? null))
      .catch(() => setUpdated(null));
    return () => window.clearInterval(timer);
  }, [access]);
  useEffect(() => {
    if (expired) return;
    const controller = new AbortController();
    setProducts([]);
    const timer = window.setTimeout(() => {
      setError(null);
      void searchLocalCatalog(session, query, false, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted) setProducts(items);
        })
        .catch((failure) => {
          if (!controller.signal.aborted)
            setError(
              failure instanceof Error ? failure.message : "No se pudo consultar el catálogo.",
            );
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, session, expired]);
  return (
    <main className="h-full overflow-auto bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="gx-card flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 break-words">
            <h1 className="text-2xl font-bold">Consulta sin conexión</h1>
            <p className="mt-1 text-sm text-slate-500">
              {session.sucursal.nombre} · {session.caja?.nombre}
            </p>
            <p className="mt-2 text-sm">Para vender, reconecta y verifica tu caja.</p>
            {updated && (
              <p className="mt-1 text-xs text-slate-500">
                Catálogo guardado: {new Date(updated).toLocaleString("es-MX")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="gx-btn-primary" onClick={onReconnect}>
              Verificar conexión
            </button>
            <button type="button" className="gx-btn-ghost" onClick={onLogout}>
              Salir
            </button>
          </div>
        </header>
        {expired ? (
          <div className="gx-card" aria-live="polite">
            La sesión venció o cambió. Conecta el equipo y vuelve a iniciar sesión.
          </div>
        ) : (
          <>
            <section className="gx-card">
              <label className="gx-label" htmlFor="local-search">
                Buscar en catálogo guardado
              </label>
              <input
                id="local-search"
                className="gx-input w-full"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre o SKU"
              />
              <p className="mt-2 text-xs text-slate-500">
                Precios base guardados. Las promociones, existencias y el total se verifican al
                reconectar.
              </p>
              {error && (
                <p className="mt-2 text-sm text-danger" aria-live="polite">
                  {error}
                </p>
              )}
            </section>
            <section
              aria-label="Productos guardados"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {products.map((product) => (
                <article key={product.id} className="gx-card min-w-0 break-words">
                  <h2 className="font-bold">{product.nombre}</h2>
                  {product.variantes.map((variant) => (
                    <div key={variant.id} className="mt-3 border-t border-slate-200 pt-2 text-sm">
                      <p>{variant.nombreVariante ?? variant.sku}</p>
                      <p className="text-xs text-slate-500">SKU: {variant.sku}</p>
                      <p className="mt-1 font-semibold">
                        {Number(variant.precioBase).toLocaleString("es-MX", {
                          style: "currency",
                          currency: "MXN",
                        })}
                      </p>
                    </div>
                  ))}
                </article>
              ))}
              {!error && products.length === 0 && (
                <p className="text-sm text-slate-500">Sin resultados para esta búsqueda.</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
