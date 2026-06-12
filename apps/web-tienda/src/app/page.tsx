import { OrdenFiltros } from "@/components/orden-filtros";
import { ProductoGrid } from "@/components/producto-card";
import { type CatalogoResponse, api, getCategorias, getTiendaConfig } from "@/lib/api";
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
  verMas,
}: {
  titulo: string;
  items: CatalogoResponse["items"];
  verMas?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="border-marca border-l-4 pl-3 font-bold text-xl">{titulo}</h2>
        {verMas && (
          <Link href={verMas} className="font-medium text-marca text-sm hover:underline">
            Ver todo →
          </Link>
        )}
      </div>
      <ProductoGrid items={items} />
    </section>
  );
}

function Hero({ nombre, lema }: { nombre: string; lema: string | null }) {
  return (
    <section className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-marca to-teal-700 px-6 py-10 text-white sm:px-10 sm:py-14">
      <p className="font-medium text-sm text-white/80">Bienvenido a</p>
      <h1 className="mt-1 font-bold text-3xl sm:text-4xl">{nombre}</h1>
      <p className="mt-2 max-w-xl text-white/90">
        {lema ?? "Todo lo que buscas, con envío a todo México y compra protegida."}
      </p>
      <Link
        href="/?soloOfertas=true"
        className="mt-5 inline-block rounded-full bg-white px-6 py-2.5 font-semibold text-marca text-sm shadow hover:bg-gray-50"
      >
        Ver ofertas 🔥
      </Link>
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
  let cfg: Awaited<ReturnType<typeof getTiendaConfig>> | null = null;
  let ofertas: CatalogoResponse["items"] = [];
  let novedades: CatalogoResponse["items"] = [];
  let populares: CatalogoResponse["items"] = [];
  try {
    [data, categorias, cfg] = await Promise.all([
      api<CatalogoResponse>(`/tienda/catalogo?${qs.toString()}`, {
        revalidate: filtrando ? undefined : 60,
      }),
      getCategorias(),
      getTiendaConfig().catch(() => null),
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
      {!filtrando && <Hero nombre={cfg?.nombre ?? "Tienda"} lema={cfg?.lema ?? null} />}

      {categorias.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/"
            className={`rounded-full px-4 py-1.5 font-medium text-sm transition ${!cat && !q ? "bg-marca text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-marca"}`}
          >
            Todo
          </Link>
          {categorias.map((c) => (
            <Link
              key={c.id}
              href={`/?cat=${c.id}`}
              className={`rounded-full px-4 py-1.5 font-medium text-sm transition ${cat === c.id ? "bg-marca text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-marca"}`}
            >
              {c.nombre}
            </Link>
          ))}
        </div>
      )}

      {!filtrando && (
        <>
          <Seccion titulo="🔥 Ofertas" items={ofertas} verMas="/?soloOfertas=true" />
          <Seccion titulo="🆕 Recién llegados" items={novedades} />
          <Seccion titulo="⭐ Más populares" items={populares} verMas="/?orden=populares" />
        </>
      )}

      <h1 className="mb-4 border-marca border-l-4 pl-3 font-bold text-2xl">
        {q ? `Resultados para "${q}"` : catActiva ? catActiva.nombre : "Todo el catálogo"}
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
