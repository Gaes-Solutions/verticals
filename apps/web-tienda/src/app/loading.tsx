import { hayFiltrosActivos } from "@/lib/catalogo-query";

/** Tarjetas en skeleton; mismas clases de grid que el catálogo real. */
function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => i).map((i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-slate-100 bg-white">
          <div className="aspect-square animate-pulse bg-slate-100" />
          <div className="space-y-2 p-3.5">
            <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton de carga del catálogo mientras Next resuelve la página. Usa los
 * searchParams para mostrar el layout que realmente va a aparecer: el home con
 * hero y secciones (sin filtros) o la vista filtrada con sidebar y título.
 */
export default async function Loading({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const filtrando = hayFiltrosActivos(await searchParams);
  return (
    <div aria-busy="true" aria-label="Cargando catálogo">
      {!filtrando && <div className="mb-8 h-40 animate-pulse rounded-2xl bg-slate-200" />}

      <div className="lg:flex lg:gap-6">
        {filtrando && (
          <aside className="hidden w-60 shrink-0 lg:block">
            <div className="gx-card sticky top-32 !p-4">
              <div className="space-y-3">
                <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-4/6 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          </aside>
        )}

        <div className="min-w-0 flex-1">
          {filtrando ? (
            <div className="mb-4">
              <div className="mb-2 h-3 w-32 animate-pulse rounded bg-slate-100" />
              <div className="h-8 w-56 animate-pulse rounded bg-slate-100" />
              <div className="mt-3 h-9 w-full animate-pulse rounded-lg bg-slate-100" />
            </div>
          ) : (
            <>
              <div className="mb-4 h-7 w-48 animate-pulse rounded bg-slate-200" />
              <div className="mb-8">
                <GridSkeleton />
              </div>
              <div className="mb-4 h-7 w-48 animate-pulse rounded bg-slate-200" />
              <div className="mb-8">
                <GridSkeleton />
              </div>
              <div className="mb-4 h-7 w-48 animate-pulse rounded bg-slate-200" />
            </>
          )}
          <GridSkeleton />
        </div>
      </div>
    </div>
  );
}
