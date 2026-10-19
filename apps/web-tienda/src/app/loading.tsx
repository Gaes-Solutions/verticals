/** Tarjetas en skeleton; mismas clases de grid que el catálogo real. */
function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => i).map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="overflow-hidden rounded-xl border border-slate-100 bg-white"
        >
          <div className="aspect-square motion-safe:animate-pulse bg-slate-100" />
          <div className="space-y-2 p-3.5">
            <div className="h-3 w-3/4 motion-safe:animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-1/3 motion-safe:animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Next supplies no page search parameters to this server loading boundary. */
export default function Loading() {
  return (
    <section aria-busy="true" aria-label="Cargando tienda">
      <header className="mb-5">
        <h1 className="font-semibold text-lg text-slate-800">Estamos preparando la tienda</h1>
        <output className="mt-1 block text-sm text-slate-500">Un momento, por favor…</output>
      </header>
      <GridSkeleton />
    </section>
  );
}
