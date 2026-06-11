import type { ProductoPublicado } from "@/lib/api";
import Link from "next/link";

/** Tarjeta de producto con señales de venta: oferta, urgencia y envío gratis. */
export function ProductoCard({ p }: { p: ProductoPublicado }) {
  const base = Number(
    p.precioDesde || p.precioPublicoOverride || p.producto.variantes[0]?.precioBase || 0,
  );
  const promo = p.enOferta && p.precioPromocion ? Number(p.precioPromocion) : null;
  const precio = promo ?? base;

  return (
    <Link
      href={`/producto/${p.slugSeo}`}
      className="group relative flex flex-col rounded-lg border bg-white p-4 transition hover:shadow-md"
    >
      {p.enOferta && p.descuentoPct > 0 && (
        <span className="absolute left-2 top-2 z-10 rounded bg-red-600 px-1.5 py-0.5 font-bold text-white text-xs">
          -{p.descuentoPct}%
        </span>
      )}
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
        <p className="mt-1 text-gray-400 text-xs">{p.categoriaPublica.nombre}</p>
      )}
      <div className="mt-2">
        {promo != null && (
          <span className="mr-2 text-gray-400 text-xs line-through">${base.toFixed(2)}</span>
        )}
        <span className="font-bold text-marca">${precio.toFixed(2)}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {p.envioGratis && (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 text-xs">
            Envío gratis
          </span>
        )}
        {p.stockBajo && p.stockPublico != null && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 text-xs">
            ¡Últimas {p.stockPublico}!
          </span>
        )}
      </div>
    </Link>
  );
}

export function ProductoGrid({ items }: { items: ProductoPublicado[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductoCard key={p.id} p={p} />
      ))}
    </div>
  );
}
