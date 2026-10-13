import { EstadoError } from "@/components/estado-error";
import { BarraFiltros, PanelFiltros } from "@/components/filtros";
import { Paginacion } from "@/components/paginacion";
import { type EntregaConfigPublica, ProductoGrid } from "@/components/producto-card";
import { RepetirDespensa } from "@/components/repetir-despensa";
import { TiendaCerrada } from "@/components/tienda-cerrada";
import { ApiError, type CatalogoResponse, api, getCategorias, getTiendaConfig } from "@/lib/api";
import { hayFiltrosActivos, queryCatalogo } from "@/lib/catalogo-query";
import { BadgeCheck, Flame, PackageSearch, Sparkles, TrendingUp, Truck } from "lucide-react";
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
    <section className="mb-10">
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
      <ProductoGrid items={items} {...(msi ? { msi } : {})} {...(entrega ? { entrega } : {})} />
    </section>
  );
}

function Hero({
  nombre,
  lema,
  envio,
  msi,
}: {
  nombre: string;
  lema: string | null;
  envio: boolean;
  msi: boolean;
}) {
  return (
    <section className="relative isolate mb-12 overflow-hidden rounded-[2rem] bg-gradient-to-br from-marca via-brand-dark to-slate-950 px-6 py-12 text-white shadow-xl shadow-marca/10 sm:px-12 sm:py-16">
      <div className="pointer-events-none absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-1/3 -z-10 h-96 w-96 rounded-full bg-teal-300/10 blur-3xl" />
      <p className="font-semibold text-sm text-teal-100">Bienvenido a {nombre}</p>
      <h1 className="mt-2 max-w-2xl font-bold text-3xl leading-tight sm:text-5xl">
        {lema ?? "Todo lo que buscas, al mejor precio."}
      </h1>
      <p className="mt-3 max-w-xl text-white/90">
        Miles de productos · Compra protegida
        {envio ? " · Envío a todo México" : ""}
        {msi ? " · Meses sin intereses" : ""}.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/?soloOfertas=true"
          className="flex items-center gap-1.5 rounded-full bg-white px-6 py-3 font-semibold text-marca text-sm shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:shadow-xl"
        >
          <Flame size={16} strokeWidth={2.25} /> Ver ofertas
        </Link>
        <Link
          href="/?orden=populares"
          className="rounded-full bg-white/10 px-6 py-3 font-semibold text-sm ring-1 ring-white/30 backdrop-blur transition hover:bg-white/20"
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
  const filtrando = hayFiltrosActivos(sp);

  const tienda = await getTiendaConfig();
  if (!tienda.abierta) return <TiendaCerrada nombre={tienda.nombre} lema={tienda.lema} />;

  let data: CatalogoResponse;
  let categorias: Awaited<ReturnType<typeof getCategorias>> = [];
  let cfg: Awaited<ReturnType<typeof getTiendaConfig>> | null = null;
  let ofertas: CatalogoResponse["items"] = [];
  let novedades: CatalogoResponse["items"] = [];
  let populares: CatalogoResponse["items"] = [];
  try {
    [data, categorias, cfg] = await Promise.all([
      api<CatalogoResponse>(`/tienda/catalogo?${queryCatalogo(sp)}`, {
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
          <Hero
            nombre={cfg?.nombre ?? "Tienda"}
            lema={cfg?.lema ?? null}
            envio={Boolean(cfg?.etaEnvio)}
            msi={Boolean(cfg?.msiHabilitado && cfg.msiMeses.length > 0)}
          />
          <div className="-mt-5 mb-10 grid grid-cols-1 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marca/10 text-marca">
                <BadgeCheck size={18} />
              </span>
              <div>
                <p className="font-semibold text-sm">Compra protegida</p>
                <p className="text-slate-500 text-xs">Tus datos están seguros</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marca/10 text-marca">
                <Truck size={18} />
              </span>
              <div>
                <p className="font-semibold text-sm">Entrega confiable</p>
                <p className="text-slate-500 text-xs">Recibe en la puerta de tu casa</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marca/10 text-marca">
                <Sparkles size={18} />
              </span>
              <div>
                <p className="font-semibold text-sm">Productos seleccionados</p>
                <p className="text-slate-500 text-xs">Calidad para cada compra</p>
              </div>
            </div>
          </div>
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

      <nav className="mb-2 text-slate-400 text-xs">
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
