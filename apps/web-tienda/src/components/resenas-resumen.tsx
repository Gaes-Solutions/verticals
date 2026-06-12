/** Resumen de reseñas estilo Mercado Libre: promedio grande + barras por estrella. */
export function ResenasResumen({ ratings }: { ratings: number[] }) {
  if (ratings.length === 0) return null;
  const total = ratings.length;
  const promedio = ratings.reduce((a, b) => a + b, 0) / total;
  const conteo = [5, 4, 3, 2, 1].map((estrella) => ({
    estrella,
    n: ratings.filter((r) => r === estrella).length,
  }));

  return (
    <div className="mb-6 flex flex-col gap-6 rounded-xl border bg-white p-5 sm:flex-row sm:items-center">
      <div className="flex flex-col items-center sm:w-40">
        <span className="font-bold text-4xl text-gray-900">{promedio.toFixed(1)}</span>
        <span className="mt-1 text-amber-500">
          {"★".repeat(Math.round(promedio))}
          {"☆".repeat(5 - Math.round(promedio))}
        </span>
        <span className="mt-1 text-gray-500 text-sm">
          {total} reseña{total === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex-1 space-y-1.5">
        {conteo.map(({ estrella, n }) => (
          <div key={estrella} className="flex items-center gap-2 text-sm">
            <span className="w-10 text-gray-500">{estrella} ★</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${total ? (n / total) * 100 : 0}%` }}
              />
            </div>
            <span className="w-6 text-right text-gray-400">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
