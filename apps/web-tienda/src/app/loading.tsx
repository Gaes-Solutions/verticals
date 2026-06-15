/** Skeleton de carga del catálogo mientras Next resuelve la página. */
export default function Loading() {
  return (
    <div>
      <div className="mb-8 h-40 animate-pulse rounded-2xl bg-gray-200" />
      <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => i).map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-gray-100 bg-white">
            <div className="aspect-square animate-pulse bg-gray-100" />
            <div className="space-y-2 p-3.5">
              <div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
