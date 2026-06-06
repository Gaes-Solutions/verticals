import { AgregarAlCarrito } from "@/components/agregar-al-carrito";
import { GuardarWishlist } from "@/components/guardar-wishlist";
import { api } from "@/lib/api";
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
  producto: { variantes: Array<{ id: string; precioBase: string; nombreVariante: string | null }> };
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
    // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requerido para SEO, contenido propio serializado
    <script
      type="application/ld+json"
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
  const variante = prod.producto.variantes[0];
  const precio = precioDe(prod);

  return (
    <div>
      <ProductoJsonLd prod={prod} />
      <Link href="/" className="text-sm text-marca">
        ← Catálogo
      </Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div className="flex aspect-square items-center justify-center rounded-lg border bg-white text-6xl">
          {prod.fotosArray[0] ? (
            <img
              src={prod.fotosArray[0]}
              alt={prod.tituloPublico}
              className="h-full w-full rounded-lg object-cover"
            />
          ) : (
            "📦"
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{prod.tituloPublico}</h1>
          <p className="mt-3 text-3xl font-bold text-marca">${Number(precio).toFixed(2)}</p>
          {prod.descripcionMd && <p className="mt-4 text-gray-600">{prod.descripcionMd}</p>}
          {variante && (
            <div className="flex items-end gap-3">
              <AgregarAlCarrito
                varianteId={variante.id}
                titulo={prod.tituloPublico}
                precio={precio}
              />
              <GuardarWishlist productoPublicadoId={prod.id} />
            </div>
          )}
        </div>
      </div>

      {prod.resenas.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-bold">Reseñas</h2>
          <div className="space-y-4">
            {prod.resenas.map((r) => (
              <div key={r.id} className="rounded border bg-white p-4">
                <div className="text-amber-500">
                  {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)}
                </div>
                {r.titulo && <p className="mt-1 font-medium">{r.titulo}</p>}
                {r.comentario && <p className="mt-1 text-sm text-gray-600">{r.comentario}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
