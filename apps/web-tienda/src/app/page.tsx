import { BarraFiltros, PanelFiltros } from "@/components/filtros";
import { Paginacion } from "@/components/paginacion";
import { ProductoGrid } from "@/components/producto-card";
import { type CatalogoResponse, api, getCategorias, getTiendaConfig } from "@/lib/api";
import { Flame, PackageSearch, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

async function seccion(query: string): Promise<CatalogoResponse["items"]> {
  try {
    const r = await api<CatalogoResponse>(`/tienda/catalogo?${query}`, { revalidate: 120 });
    return r.items;
  } catch {
    return [];
  }
}

function Seccion({
  icono,
  titulo,
  items,
  verMas,
}: {
  icono: ReactNode;
  titulo: string;
  items: CatalogoResponse["items"];
  verMas?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="flex items-center gap-2 font-bold text-gray-900 text-xl">
          {icono}
          {titulo}
        </h2>
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
    <section className="mb-10 overflow-hidden rounded-3xl bg-gradient-to-br from-marca via-teal-600 to-teal-800 px-6 py-12 text-white sm:px-12 sm:py-16">
      <p className="font-medium text-sm text-white/80">Bienvenido a {nombre}</p>
      <h1 className="mt-2 max-w-2xl font-bold text-3xl leading-tight sm:text-5xl">
        {lema ?? "Todo lo que buscas, al mejor precio."}
      </h1>
      <p className="mt-3 max-w-xl text-white/90">
        Miles de productos · Envío a todo México · Compra protegida · Meses sin intereses.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/?soloOfertas=true"
          className="flex items-center gap-1.5 rounded-full bg-white px-6 py-3 font-semibold text-marca text-sm shadow-lg transition hover:scale-105"
        >
          <Flame size={16} strokeWidth={2.25} /> Ver ofertas
        </Link>
        <Link
          href="/?orden=populares"
          className="rounded-full bg-white/15 px-6 py-3 font-semibold text-sm ring-1 ring-white/40 backdrop-blur transition hover:bg-white/25"
        >
          Más vendidos
        </Link>
      </div>
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
    q || cat || orden || precioMin || precioMax || soloOfertas || soloDisponibles || sp.page,
  );

  const pageActual = Math.max(1, Number(sp.page) || 1);
  const qs = new URLSearchParams({ pageSize: "24", page: String(pageActual) });
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
      </div>
    );
  }

  const catActiva = categorias.find((c) => c.id === cat);
  const titulo = q ? `Resultados para "${q}"` : (catActiva?.nombre ?? "Todo el catálogo");

  return (
    <div>
      {!filtrando && (
        <>
          <Hero nombre={cfg?.nombre ?? "Tienda"} lema={cfg?.lema ?? null} />
          <Seccion
            icono={<Flame size={22} className="text-red-500" />}
            titulo="Ofertas del día"
            items={ofertas}
            verMas="/?soloOfertas=true"
          />
          <Seccion
            icono={<Sparkles size={22} className="text-marca" />}
            titulo="Recién llegados"
            items={novedades}
            verMas="/?orden=novedad"
          />
          <Seccion
            icono={<TrendingUp size={22} className="text-marca" />}
            titulo="Más vendidos"
            items={populares}
            verMas="/?orden=populares"
          />
        </>
      )}

      <nav className="mb-2 text-gray-400 text-xs">
        <Link href="/" className="hover:text-marca">
          Inicio
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-gray-600">{titulo}</span>
      </nav>
      <h1 className="mb-4 font-bold text-2xl text-gray-900">{titulo}</h1>

      <div className="lg:flex lg:gap-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-32 rounded-2xl border border-gray-100 bg-white p-4">
            <PanelFiltros categorias={categorias} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <BarraFiltros categorias={categorias} total={data.total} />
          {data.items.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center">
              <PackageSearch size={48} strokeWidth={1.5} className="mx-auto text-gray-300" />
              <p className="mt-3 font-medium text-gray-700">No encontramos productos</p>
              <p className="mt-1 text-gray-400 text-sm">Prueba con otros filtros o términos.</p>
            </div>
          ) : (
            <>
              <ProductoGrid items={data.items} />
              <Paginacion page={data.page} pageSize={data.pageSize} total={data.total} sp={sp} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
