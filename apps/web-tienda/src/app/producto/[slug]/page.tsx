import { GaleriaProducto } from "@/components/galeria-producto";
import { GuardarWishlist } from "@/components/guardar-wishlist";
import { ProductoCompra } from "@/components/producto-compra";
import { api, getTiendaConfig } from "@/lib/api";
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
  producto: {
    variantes: Array<{
      id: string;
      precioBase: string;
      nombreVariante: string | null;
      opciones: Record<string, string> | null;
    }>;
  };
  resenas: Array<{ id: string; rating: number; titulo: string | null; comentario: string | null }>;
}

function precioDe(prod: ProductoDetalle): string {
  return prod.precioPublicoOverride ?? prod.producto.variantes[0]?.precioBase ?? "0";
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
      availability: "https://schema.org/InStock",
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

  return (
    <div>
      <ProductoJsonLd prod={prod} />
      <Link href="/" className="text-sm text-marca">
        ← Catálogo
      </Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <GaleriaProducto
          fotos={prod.fotosArray}
          alt={prod.tituloPublico}
          zoom={config.galeriaZoom}
        />
        <div>
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
          />
          <div className="mt-4">
            <GuardarWishlist productoPublicadoId={prod.id} />
          </div>
          {prod.descripcionMd && <p className="mt-6 text-gray-600">{prod.descripcionMd}</p>}
        </div>
      </div>

      {prod.resenas.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 font-bold text-lg">Reseñas</h2>
          <div className="space-y-4">
            {prod.resenas.map((r) => (
              <div key={r.id} className="rounded border bg-white p-4">
                <div className="text-amber-500">
                  {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)}
                </div>
                {r.titulo && <p className="mt-1 font-medium">{r.titulo}</p>}
                {r.comentario && <p className="mt-1 text-gray-600 text-sm">{r.comentario}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
