import type { ProductoPublicado } from "@/lib/api";
import { ImageOff, Truck } from "lucide-react";
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
      className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white transition duration-200 hover:-translate-y-1 hover:shadow-lg"
    >
      {p.enOferta && p.descuentoPct > 0 && (
        <span className="absolute left-2.5 top-2.5 z-10 rounded-md bg-danger px-2 py-0.5 font-bold text-white text-xs shadow">
          -{p.descuentoPct}%
        </span>
      )}
      <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        {p.fotosArray[0] ? (
          <img
            src={p.fotosArray[0]}
            alt={p.tituloPublico}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <ImageOff size={40} strokeWidth={1.5} className="text-slate-300" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        {p.categoriaPublica && (
          <p className="mb-1 text-[11px] text-slate-400 uppercase tracking-wide">
            {p.categoriaPublica.nombre}
          </p>
        )}
        <h2 className="line-clamp-2 flex-1 font-medium text-slate-800 text-sm group-hover:text-marca">
          {p.tituloPublico}
        </h2>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-bold text-slate-900 text-lg">${precio.toFixed(2)}</span>
          {promo != null && (
            <span className="text-slate-400 text-xs line-through">${base.toFixed(2)}</span>
          )}
        </div>
        <div className="mt-1.5 flex min-h-[20px] flex-wrap gap-1">
          {p.envioGratis && (
            <span className="gx-badge-ok flex items-center gap-1 text-[11px]">
              <Truck size={12} strokeWidth={2} /> Envío gratis
            </span>
          )}
          {p.stockBajo && p.stockPublico != null && (
            <span className="gx-badge-warn text-[11px]">¡Últimas {p.stockPublico}!</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ProductoGrid({ items }: { items: ProductoPublicado[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductoCard key={p.id} p={p} />
      ))}
    </div>
  );
}
