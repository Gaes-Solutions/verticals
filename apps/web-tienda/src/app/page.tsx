import { Buscador } from "@/components/buscador";
import { type CatalogoResponse, api, getCategorias } from "@/lib/api";
import Link from "next/link";

function precioDe(p: CatalogoResponse["items"][number]): string {
  const precio = p.precioPublicoOverride ?? p.producto.variantes[0]?.precioBase ?? "0";
  return `$${Number(precio).toFixed(2)}`;
}

function ProductoCard({ p }: { p: CatalogoResponse["items"][number] }) {
  return (
    <Link
      href={`/producto/${p.slugSeo}`}
      className="group rounded-lg border bg-white p-4 transition hover:shadow-md"
    >
      <div className="mb-3 flex aspect-square items-center justify-center rounded bg-gray-100 text-4xl">
        {p.fotosArray[0] ? (
          <img
            src={p.fotosArray[0]}
            alt={p.tituloPublico}
            className="h-full w-full rounded object-cover"
          />
        ) : (
          "📦"
        )}
      </div>
      <h2 className="line-clamp-2 text-sm font-medium group-hover:text-marca">{p.tituloPublico}</h2>
      {p.categoriaPublica && (
        <p className="mt-1 text-xs text-gray-400">{p.categoriaPublica.nombre}</p>
      )}
      <p className="mt-2 font-bold text-marca">{precioDe(p)}</p>
    </Link>
  );
}

function Grid({ items }: { items: CatalogoResponse["items"] }) {
  return (
    <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductoCard key={p.id} p={p} />
      ))}
    </div>
  );
}

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  const { q, cat } = await searchParams;
  const filtrando = Boolean(q || cat);

  const qs = new URLSearchParams({ pageSize: "24" });
  if (q) qs.set("q", q);
  if (cat) qs.set("categoriaPublicaId", cat);

  let data: CatalogoResponse;
  let categorias: Awaited<ReturnType<typeof getCategorias>>;
  let destacados: CatalogoResponse["items"] = [];
  try {
    [data, categorias] = await Promise.all([
      api<CatalogoResponse>(`/tienda/catalogo?${qs.toString()}`, {
        revalidate: filtrando ? undefined : 60,
      }),
      getCategorias(),
    ]);
    if (!filtrando) {
      const dest = await api<CatalogoResponse>("/tienda/catalogo?destacado=true&pageSize=8", {
        revalidate: 300,
      });
      destacados = dest.items;
    }
  } catch (err) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-6 text-red-700">
        <h1 className="font-bold">No se pudo cargar el catálogo</h1>
        <p className="mt-2 text-sm">{err instanceof Error ? err.message : "Error desconocido"}</p>
        <p className="mt-2 text-sm text-gray-600">
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

      {!filtrando && destacados.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">⭐ Destacados</h2>
          <Grid items={destacados} />
        </section>
      )}

      <h1 className="mb-6 text-2xl font-bold">
        {q ? `Resultados para "${q}"` : catActiva ? catActiva.nombre : "Catálogo"}
      </h1>

      {data.items.length === 0 ? (
        <p className="text-gray-500">
          {filtrando
            ? "No encontramos productos con ese criterio."
            : "Aún no hay productos publicados."}
        </p>
      ) : (
        <Grid items={data.items} />
      )}
    </div>
  );
}
