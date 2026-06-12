import { CalculadoraEnvio } from "@/components/calculadora-envio";
import { GaleriaProducto } from "@/components/galeria-producto";
import { GuardarWishlist } from "@/components/guardar-wishlist";
import { PreguntasProducto } from "@/components/preguntas-producto";
import { ProductoGrid } from "@/components/producto-card";
import { ProductoCompra } from "@/components/producto-compra";
import { ResenasResumen } from "@/components/resenas-resumen";
import { RegistrarVisto, VistosRecientes } from "@/components/vistos-recientes";
import { type ProductoPublicado, api, getTiendaConfig } from "@/lib/api";
import type { Metadata } from "next";
import Link from "next/link";

interface ProductoDetalle {
  id: string;
  tituloPublico: string;
  descripcionMd: string | null;
  descripcionCortaMd: string | null;
  metaTitulo: string | null;
  metaDescripcion: string | null;
  fotosArray: string[];
  precioPublicoOverride: string | null;
  categoriaPublica: { nombre: string; slugSeo: string } | null;
  producto: {
    variantes: Array<{
      id: string;
      precioBase: string;
      nombreVariante: string | null;
      opciones: Record<string, string> | null;
    }>;
  };
  resenas: Array<{
    id: string;
    rating: number;
    titulo: string | null;
    comentario: string | null;
    imagenesArray?: string[];
  }>;
  preguntas: Array<{ id: string; pregunta: string; respuesta: string | null }>;
  // Enriquecido (Tanda 5):
  precioDesde: string;
  precioPromocion: string | null;
  promocionVigenteHasta: string | null;
  enOferta: boolean;
  descuentoPct: number;
  stockPublico: number | null;
  stockBajo: boolean;
  envioGratis: boolean;
  relacionados: ProductoPublicado[];
}

function precioDe(prod: ProductoDetalle): string {
  if (prod.enOferta && prod.precioPromocion) return prod.precioPromocion;
  return (
    prod.precioDesde ?? prod.precioPublicoOverride ?? prod.producto.variantes[0]?.precioBase ?? "0"
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const prod = await api<ProductoDetalle>(`/tienda/catalogo/${slug}`);
    const titulo = prod.metaTitulo ?? prod.tituloPublico;
    const descripcion =
      prod.metaDescripcion ?? prod.descripcionCortaMd ?? prod.descripcionMd ?? prod.tituloPublico;
    return {
      title: titulo,
      description: descripcion,
      openGraph: {
        title: titulo,
        description: descripcion,
        type: "website",
        ...(prod.fotosArray[0] ? { images: [{ url: prod.fotosArray[0] }] } : {}),
      },
    };
  } catch {
    return { title: "Producto no encontrado" };
  }
}

/** JSON-LD schema.org/Product para rich results en Google. */
function ProductoJsonLd({ prod }: { prod: ProductoDetalle }) {
  const ratings = prod.resenas.map((r) => r.rating);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: prod.tituloPublico,
    ...(prod.descripcionMd ? { description: prod.descripcionMd } : {}),
    ...(prod.fotosArray.length > 0 ? { image: prod.fotosArray } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "MXN",
      price: Number(precioDe(prod)).toFixed(2),
      availability:
        prod.stockPublico != null && prod.stockPublico <= 0
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
      ...(prod.enOferta && prod.promocionVigenteHasta
        ? { priceValidUntil: String(prod.promocionVigenteHasta).slice(0, 10) }
        : {}),
    },
    ...(ratings.length > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1),
            reviewCount: ratings.length,
          },
        }
      : {}),
  };
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD de SEO, contenido propio serializado
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/** JSON-LD BreadcrumbList para que Google muestre la ruta en los resultados. */
function BreadcrumbJsonLd({ prod, slug }: { prod: ProductoDetalle; slug: string }) {
  const items = [
    { name: "Inicio", item: "/" },
    ...(prod.categoriaPublica
      ? [{ name: prod.categoriaPublica.nombre, item: `/?cat=${prod.categoriaPublica.slugSeo}` }]
      : []),
    { name: prod.tituloPublico, item: `/producto/${slug}` },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  };
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD de SEO, contenido propio serializado
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function ProductoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let prod: ProductoDetalle;
  try {
    prod = await api<ProductoDetalle>(`/tienda/catalogo/${slug}`);
  } catch {
    return (
      <div className="text-center">
        <p className="text-gray-500">Producto no encontrado.</p>
        <Link href="/" className="mt-4 inline-block text-marca">
          ← Volver al catálogo
        </Link>
      </div>
    );
  }
  const config = await getTiendaConfig();

  const ratings = prod.resenas.map((r) => r.rating);
  const ratingProm = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  const precioActual = Number(precioDe(prod));

  return (
    <div>
      <ProductoJsonLd prod={prod} />
      <BreadcrumbJsonLd prod={prod} slug={slug} />
      <RegistrarVisto
        visto={{
          slugSeo: slug,
          titulo: prod.tituloPublico,
          precio: String(precioActual),
          ...(prod.fotosArray[0] ? { imagen: prod.fotosArray[0] } : {}),
        }}
      />

      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-gray-500 text-sm">
        <Link href="/" className="hover:text-marca">
          Inicio
        </Link>
        {prod.categoriaPublica && (
          <>
            <span className="text-gray-300">›</span>
            <Link href={`/?cat=${prod.categoriaPublica.slugSeo}`} className="hover:text-marca">
              {prod.categoriaPublica.nombre}
            </Link>
          </>
        )}
        <span className="text-gray-300">›</span>
        <span className="text-gray-700">{prod.tituloPublico}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <GaleriaProducto
            fotos={prod.fotosArray}
            alt={prod.tituloPublico}
            zoom={config.galeriaZoom}
          />
        </div>
        <div className="rounded-xl border bg-white p-5 sm:p-6">
          <h1 className="font-bold text-2xl">{prod.tituloPublico}</h1>
          {config.mostrarRatingProducto && ratings.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-amber-500">
                {"★".repeat(Math.round(ratingProm))}
                {"☆".repeat(5 - Math.round(ratingProm))}
              </span>
              <span className="text-gray-500">
                {ratingProm.toFixed(1)} · {ratings.length} reseña{ratings.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
          <ProductoCompra
            variantes={prod.producto.variantes}
            precioOverride={prod.precioPublicoOverride}
            titulo={prod.tituloPublico}
            comprarAhora={config.comprarAhora}
            msi={{
              habilitado: config.msiHabilitado,
              meses: config.msiMeses,
              montoMinimo: config.msiMontoMinimo,
            }}
            oferta={
              prod.enOferta && prod.precioPromocion
                ? { precioPromocion: prod.precioPromocion, descuentoPct: prod.descuentoPct }
                : null
            }
            stockPublico={prod.stockPublico}
            stockBajo={prod.stockBajo}
            envioGratis={prod.envioGratis}
            {...(prod.fotosArray[0] ? { imagenUrl: prod.fotosArray[0] } : {})}
            slugSeo={slug}
            productoPublicadoId={prod.id}
          />
          <div className="mt-4">
            <GuardarWishlist productoPublicadoId={prod.id} />
          </div>
          <CalculadoraEnvio subtotal={precioActual} />
          {prod.descripcionMd && (
            <p className="mt-6 whitespace-pre-line text-gray-600 leading-relaxed">
              {prod.descripcionMd}
            </p>
          )}
        </div>
      </div>

      {prod.resenas.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 border-marca border-l-4 pl-3 font-bold text-xl">Reseñas</h2>
          <ResenasResumen ratings={ratings} />
          <div className="space-y-4">
            {prod.resenas.map((r) => (
              <div key={r.id} className="rounded border bg-white p-4">
                <div className="text-amber-500">
                  {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)}
                </div>
                {r.titulo && <p className="mt-1 font-medium">{r.titulo}</p>}
                {r.comentario && <p className="mt-1 text-gray-600 text-sm">{r.comentario}</p>}
                {r.imagenesArray && r.imagenesArray.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.imagenesArray.map((src) => (
                      <img
                        key={src.slice(-16)}
                        src={src}
                        alt="Foto de reseña"
                        className="h-20 w-20 rounded object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {config.preguntasPublicas && (
        <PreguntasProducto productoPublicadoId={prod.id} preguntas={prod.preguntas} />
      )}

      {prod.relacionados.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 border-marca border-l-4 pl-3 font-bold text-xl">
            También te puede interesar
          </h2>
          <ProductoGrid items={prod.relacionados} />
        </section>
      )}

      <VistosRecientes excluir={slug} />
    </div>
  );
}
