import { Escaparate } from "@/components/escaparate";
import { EstadoError } from "@/components/estado-error";
import { BarraFiltros, PanelFiltros } from "@/components/filtros";
import { Paginacion } from "@/components/paginacion";
import { type EntregaConfigPublica, ProductoGrid } from "@/components/producto-card";
import { RepetirDespensa } from "@/components/repetir-despensa";
import { TiendaCerrada } from "@/components/tienda-cerrada";
import { ApiError, type CatalogoResponse, api, getCategorias, getTiendaConfig } from "@/lib/api";
import { hayFiltrosActivos, queryCatalogo } from "@/lib/catalogo-query";
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
  msi,
  entrega,
}: {
  icono: ReactNode;
  titulo: string;
  items: CatalogoResponse["items"];
  verMas?: string;
  msi?: { habilitado: boolean; meses: number[]; montoMinimo: string };
  entrega?: EntregaConfigPublica;
}) {
  if (items.length === 0) return null;
  return (
    <section className="store-shelf mb-8">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="tienda-section-title">
          {icono}
          {titulo}
        </h2>
        {verMas && (
          <Link href={verMas} className="font-medium text-marca text-sm hover:underline">
            Ver todo →
          </Link>
        )}
      </div>
      <ProductoGrid
        items={items.slice(0, 4)}
        {...(msi ? { msi } : {})}
        {...(entrega ? { entrega } : {})}
      />
    </section>
  );
}

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filtrando = hayFiltrosActivos(sp);

  const tienda = await getTiendaConfig();
  if (!tienda.abierta) return <TiendaCerrada nombre={tienda.nombre} lema={tienda.lema} />;

  let data: CatalogoResponse;
  let categorias: Awaited<ReturnType<typeof getCategorias>> = [];
  let ofertas: CatalogoResponse["items"] = [];
  let novedades: CatalogoResponse["items"] = [];
  let populares: CatalogoResponse["items"] = [];
  try {
    [data, categorias] = await Promise.all([
      api<CatalogoResponse>(`/tienda/catalogo?${queryCatalogo(sp)}`, {
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
    // Se cerró entre que se leyó la configuración y el catálogo.
    if (err instanceof ApiError && err.code === "STORE_UNAVAILABLE") {
      return <TiendaCerrada nombre={tienda.nombre} lema={tienda.lema} />;
    }
    // Error con reintento: conservamos el shell (incluidos los filtros activos
    // en la URL) para que el usuario ajuste filtros o reintente sin perder contexto.
    const detalle = err instanceof Error ? err.message : "Error desconocido. Inténtalo de nuevo.";
    return (
      <div className="lg:flex lg:gap-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="gx-card sticky top-32 !p-4">
            <PanelFiltros categorias={categorias} />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <EstadoError
            titulo="No se pudo cargar el catálogo"
            descripcion={`${detalle} Revisa tu conexión o inténtalo de nuevo.`}
          />
        </div>
      </div>
    );
  }

  const catActiva = categorias.find((c) => c.id === sp.cat);
  const titulo = sp.q ? `Resultados para "${sp.q}"` : (catActiva?.nombre ?? "Todo el catálogo");
  const msiCfg = {
    habilitado: tienda.msiHabilitado,
    meses: tienda.msiMeses,
    montoMinimo: tienda.msiMontoMinimo,
  };
  const entregaCfg: EntregaConfigPublica = {
    eta: tienda.etaEnvio ?? null,
    recogida: tienda.recogidaEnTienda ?? false,
  };

  return (
    <div>
      {!filtrando && (
        <>
          <Escaparate
            nombre={tienda.nombre}
            lema={tienda.lema}
            items={data.items}
            categorias={categorias}
            recogida={Boolean(tienda.recogidaEnTienda)}
            envio={Boolean(tienda.etaEnvio)}
          />
          <RepetirDespensa />
          <Seccion
            icono={<Flame size={22} className="text-danger" />}
            titulo="Ofertas del día"
            items={ofertas}
            verMas="/?soloOfertas=true"
            msi={msiCfg}
            entrega={entregaCfg}
          />
          <Seccion
            icono={<Sparkles size={22} className="text-marca" />}
            titulo="Recién llegados"
            items={novedades}
            verMas="/?orden=novedad"
            msi={msiCfg}
            entrega={entregaCfg}
          />
          <Seccion
            icono={<TrendingUp size={22} className="text-marca" />}
            titulo="Más vendidos"
            items={populares}
            verMas="/?orden=populares"
            msi={msiCfg}
            entrega={entregaCfg}
          />
        </>
      )}

      <nav id="catalogo" className="mb-2 scroll-mt-44 text-slate-400 text-xs">
        <Link href="/" className="hover:text-marca">
          Inicio
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-slate-600">{titulo}</span>
      </nav>
      <h1 className="mb-5 font-bold text-2xl tracking-tight text-slate-900">{titulo}</h1>

      <div className="lg:flex lg:gap-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="gx-card sticky top-32 !p-4">
            <PanelFiltros categorias={categorias} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <BarraFiltros categorias={categorias} total={data.total} />
          {data.items.length === 0 ? (
            <div className="gx-card py-16 text-center">
              <PackageSearch size={48} strokeWidth={1.5} className="mx-auto text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">No encontramos productos</p>
              {filtrando ? (
                <>
                  <p className="mt-1 text-slate-400 text-sm">
                    Prueba con otros filtros o términos de búsqueda.
                  </p>
                  <Link href="/" className="gx-btn-primary mt-6">
                    Limpiar filtros y ver todo
                  </Link>
                </>
              ) : (
                <p className="mt-1 text-slate-400 text-sm">
                  Vuelve pronto, estamos agregando productos nuevos.
                </p>
              )}
            </div>
          ) : (
            <>
              <ProductoGrid items={data.items} msi={msiCfg} entrega={entregaCfg} />
              <Paginacion page={data.page} pageSize={data.pageSize} total={data.total} sp={sp} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
