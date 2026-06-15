import Link from "next/link";

/** Paginación del catálogo. Conserva los filtros actuales (sp) y cambia `page`. */
export function Paginacion({
  page,
  pageSize,
  total,
  sp,
}: {
  page: number;
  pageSize: number;
  total: number;
  sp: Record<string, string | undefined>;
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
  if (totalPaginas <= 1) return null;

  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== "page") q.set(k, v);
    }
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  // Ventana de páginas alrededor de la actual.
  const desde = Math.max(1, page - 2);
  const hasta = Math.min(totalPaginas, desde + 4);
  const paginas: number[] = [];
  for (let p = Math.max(1, hasta - 4); p <= hasta; p++) paginas.push(p);

  const btn = "flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm";

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {page > 1 && (
        <Link href={href(page - 1)} className={`${btn} border-gray-200 hover:border-marca`}>
          ← Anterior
        </Link>
      )}
      {paginas.map((p) => (
        <Link
          key={p}
          href={href(p)}
          className={`${btn} ${
            p === page
              ? "border-marca bg-marca font-semibold text-white"
              : "border-gray-200 text-gray-700 hover:border-marca"
          }`}
        >
          {p}
        </Link>
      ))}
      {page < totalPaginas && (
        <Link href={href(page + 1)} className={`${btn} border-gray-200 hover:border-marca`}>
          Siguiente →
        </Link>
      )}
    </nav>
  );
}
