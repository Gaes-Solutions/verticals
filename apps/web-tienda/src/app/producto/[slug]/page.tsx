import { AgregarAlCarrito } from "@/components/agregar-al-carrito";
import { api } from "@/lib/api";
import Link from "next/link";

interface ProductoDetalle {
  id: string;
  tituloPublico: string;
  descripcionMd: string | null;
  fotosArray: string[];
  precioPublicoOverride: string | null;
  producto: { variantes: Array<{ id: string; precioBase: string; nombreVariante: string | null }> };
  resenas: Array<{ id: string; rating: number; titulo: string | null; comentario: string | null }>;
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
  const precio = prod.precioPublicoOverride ?? variante?.precioBase ?? "0";

  return (
    <div>
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
            <AgregarAlCarrito
              varianteId={variante.id}
              titulo={prod.tituloPublico}
              precio={precio}
            />
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
