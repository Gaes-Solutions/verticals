import { Buscador } from "@/components/buscador";
import { OrdenFiltros } from "@/components/orden-filtros";
import { ProductoGrid } from "@/components/producto-card";
import { type CatalogoResponse, api, getCategorias } from "@/lib/api";
import Link from "next/link";
import { Suspense } from "react";

/** Trae una sección de la home (ofertas, novedades, populares…) sin romper si falla. */
async function seccion(query: string): Promise<CatalogoResponse["items"]> {
  try {
    const r = await api<CatalogoResponse>(`/tienda/catalogo?${query}`, { revalidate: 120 });
    return r.items;
  } catch {
    return [];
  }
}

function Seccion({
  titulo,
  items,
}: {
  titulo: string;
  items: CatalogoResponse["items"];
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-xl font-bold">{titulo}</h2>
      <ProductoGrid items={items} />
    </section>
  );
}

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { q, cat, orden, precioMin, precioMax, soloOfertas, soloDisponibles } = sp;
  const filtrando = Boolean(
    q || cat || orden || precioMin || precioMax || soloOfertas || soloDisponibles,
  );

  const qs = new URLSearchParams({ pageSize: "24" });
  if (q) qs.set("q", q);
  if (cat) qs.set("categoriaPublicaId", cat);
  if (orden) qs.set("orden", orden);
  if (precioMin) qs.set("precioMin", precioMin);
  if (precioMax) qs.set("precioMax", precioMax);
  if (soloOfertas) qs.set("soloOfertas", soloOfertas);
  if (soloDisponibles) qs.set("soloDisponibles", soloDisponibles);

  let data: CatalogoResponse;
  let categorias: Awaited<ReturnType<typeof getCategorias>>;
  let ofertas: CatalogoResponse["items"] = [];
  let novedades: CatalogoResponse["items"] = [];
  let populares: CatalogoResponse["items"] = [];
  try {
    [data, categorias] = await Promise.all([
      api<CatalogoResponse>(`/tienda/catalogo?${qs.toString()}`, {
        revalidate: filtrando ? undefined : 60,
      }),
      getCategorias(),
    ]);
    if (!filtrando) {
      [ofertas, novedades, populares] = await Promise.all([
        seccion("soloOfertas=true&pageSize=8"),
        seccion("orden=novedad&recienLlegados=true&pageSize=8"),
        seccion("orden=populares&pageSize=8"),
      ]);
    }
  } catch (err) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-6 text-red-700">
        <h1 className="font-bold">No se pudo cargar el catálogo</h1>
        <p className="mt-2 text-sm">{err instanceof Error ? err.message : "Error desconocido"}</p>
        <p className="mt-2 text-gray-600 text-sm">
          Verifica que la API esté corriendo y las credenciales de la tienda configuradas.
        </p>
      </div>
    );
  }

  const catActiva = categorias.find((c) => c.id === cat);

  return (
    <div>
      <div className="mb-6">
        <Buscador />
      </div>

      {categorias.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/"
            className={`rounded-full px-4 py-1.5 text-sm ${!cat && !q ? "bg-marca text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Todo
          </Link>
          {categorias.map((c) => (
            <Link
              key={c.id}
              href={`/?cat=${c.id}`}
              className={`rounded-full px-4 py-1.5 text-sm ${cat === c.id ? "bg-marca text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              {c.nombre}
            </Link>
          ))}
        </div>
      )}

      {!filtrando && (
        <>
          <Seccion titulo="🔥 Ofertas" items={ofertas} />
          <Seccion titulo="🆕 Recién llegados" items={novedades} />
          <Seccion titulo="⭐ Más populares" items={populares} />
        </>
      )}

      <h1 className="mb-4 text-2xl font-bold">
        {q ? `Resultados para "${q}"` : catActiva ? catActiva.nombre : "Catálogo"}
      </h1>
      <Suspense fallback={null}>
        <OrdenFiltros />
      </Suspense>
      {data.items.length === 0 ? (
        <p className="text-gray-500">
          {filtrando
            ? "No encontramos productos con ese criterio."
            : "Aún no hay productos publicados."}
        </p>
      ) : (
        <ProductoGrid items={data.items} />
      )}
    </div>
  );
}
