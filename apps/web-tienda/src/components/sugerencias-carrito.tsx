"use client";

import type { CatalogoResponse, ProductoPublicado } from "@/lib/api";
import { agregar, leerCarrito } from "@/lib/carrito-store";
import { ImageOff, Plus } from "lucide-react";
import { useEffect, useState } from "react";

function precioDe(p: ProductoPublicado): number {
  const base = Number(
    p.precioDesde || p.precioPublicoOverride || p.producto.variantes[0]?.precioBase || 0,
  );
  return p.enOferta && p.precioPromocion ? Number(p.precioPromocion) : base;
}

/**
 * "Sueles comprar con esto": hasta 4 productos populares que NO están en el
 * carrito, con quick-add. Sin datos → no renderiza nada.
 */
export function SugerenciasCarrito() {
  const [sugerencias, setSugerencias] = useState<ProductoPublicado[]>([]);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      try {
        const res = await fetch("/api/catalogo?orden=populares&pageSize=24", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const cat = (await res.json()) as CatalogoResponse;
        if (!activo) return;
        const enCarrito = new Set(leerCarrito().map((i) => i.varianteId));
        setSugerencias(
          cat.items
            .filter((p) => p.producto.variantes[0] && !enCarrito.has(p.producto.variantes[0].id))
            .slice(0, 4),
        );
      } catch {
        // Sin sugerencias: el carrito sigue funcionando igual.
      }
    }
    cargar();
    window.addEventListener("carrito-actualizado", cargar);
    return () => {
      activo = false;
      window.removeEventListener("carrito-actualizado", cargar);
    };
  }, []);

  if (sugerencias.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-bold text-slate-900 text-lg">Sueles comprar con esto</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sugerencias.map((p) => {
          const variante = p.producto.variantes[0];
          const precio = precioDe(p).toFixed(2);
          return (
            <div key={p.id} className="flex items-center gap-3 gx-card !p-3">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
                {p.fotosArray[0] ? (
                  <img
                    src={p.fotosArray[0]}
                    alt={p.tituloPublico}
                    className="h-full w-full rounded-lg object-cover"
                  />
                ) : (
                  <ImageOff size={20} strokeWidth={1.5} className="text-slate-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{p.tituloPublico}</p>
                <p className="font-bold text-slate-900">${precio}</p>
              </div>
              <button
                type="button"
                aria-label={`Agregar ${p.tituloPublico}`}
                onClick={() =>
                  agregar({
                    varianteId: variante.id,
                    titulo: p.tituloPublico,
                    precio,
                    cantidad: 1,
                    ...(p.fotosArray[0] ? { imagenUrl: p.fotosArray[0] } : {}),
                    slugSeo: p.slugSeo,
                  })
                }
                className="gx-btn-primary flex-shrink-0 !rounded-full !p-0 h-10 w-10"
              >
                <Plus size={18} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
