"use client";

import type { ProductoPublicado } from "@/lib/api";
import { actualizarCantidad, agregar, leerCarrito } from "@/lib/carrito-store";
import { ImageOff, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { type MouseEvent, useEffect, useState } from "react";

/** MSI configurable del tenant (viene de getTiendaConfig). */
export interface MsiConfigPublica {
  habilitado: boolean;
  meses: number[];
  montoMinimo: string;
}

function partePrecio(valor: number): { ent: string; cent: string } {
  const [ent = "0", cent = "00"] = valor.toFixed(2).split(".");
  return { ent, cent };
}

/** Tarjeta de producto nivel marketplace: badges de oferta/FULL, MSI y quick-add. */
export function ProductoCard({ p, msi }: { p: ProductoPublicado; msi?: MsiConfigPublica }) {
  const base = Number(
    p.precioDesde || p.precioPublicoOverride || p.producto.variantes[0]?.precioBase || 0,
  );
  const promo = p.enOferta && p.precioPromocion ? Number(p.precioPromocion) : null;
  const precio = promo ?? base;
  const { ent, cent } = partePrecio(precio);

  const mostrarMsi = msi?.habilitado && msi.meses.length > 0 && precio >= Number(msi.montoMinimo);
  const mesesMsi = mostrarMsi
    ? (msi?.meses.filter((m) => m >= 3).sort((a, b) => a - b)[0] ?? msi?.meses[0] ?? 0)
    : 0;

  return (
    <Link
      href={`/producto/${p.slugSeo}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white transition duration-200 hover:-translate-y-1 hover:shadow-lg"
    >
      {p.enOferta && p.descuentoPct > 0 && (
        <span className="absolute left-2.5 top-2.5 z-10 rounded-md bg-offer px-2 py-0.5 font-bold text-offer-dark text-xs shadow">
          -{p.descuentoPct}%
        </span>
      )}
      {p.envioGratis && (
        <span className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1 rounded-md bg-ok px-2 py-0.5 font-bold text-white text-xs shadow">
          <Truck size={12} strokeWidth={2.5} /> FULL
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
        <div className="mt-2">
          {promo != null && (
            <span className="text-slate-400 text-xs line-through">${base.toFixed(2)}</span>
          )}
          <p className="flex items-baseline gap-0.5 font-black text-slate-900 text-2xl">
            <span className="text-base">$</span>
            {ent}
            <sup className="font-bold text-xs">{cent}</sup>
          </p>
          {mostrarMsi && mesesMsi > 0 && (
            <p className="mt-0.5 font-medium text-ok text-xs">
              {mesesMsi} x ${(precio / mesesMsi).toFixed(2)} sin intereses
            </p>
          )}
        </div>
        <div className="mt-1.5 flex min-h-[20px] flex-wrap gap-1">
          {p.stockBajo && p.stockPublico != null && (
            <span className="gx-badge-warn text-[11px]">¡Últimas {p.stockPublico}!</span>
          )}
        </div>
        <div className="mt-2">
          <QuickAdd p={p} precio={precio.toFixed(2)} />
        </div>
      </div>
    </Link>
  );
}

/**
 * Quick-add: el primer toque agrega 1 al carrito y el botón se convierte en
 * stepper (− n ＋) sin salir del grid. Sincronizado con el carrito real.
 */
function QuickAdd({ p, precio }: { p: ProductoPublicado; precio: string }) {
  const variante = p.producto.variantes[0];
  const [cant, setCant] = useState(0);

  useEffect(() => {
    if (!variante) return;
    const leer = () =>
      setCant(leerCarrito().find((i) => i.varianteId === variante.id)?.cantidad ?? 0);
    leer();
    window.addEventListener("carrito-actualizado", leer);
    return () => window.removeEventListener("carrito-actualizado", leer);
  }, [variante?.id]);

  if (!variante) return null;
  const sinStock = p.stockPublico != null && p.stockPublico <= 0;
  const linea = {
    varianteId: variante.id,
    titulo: p.tituloPublico,
    precio,
    ...(p.fotosArray[0] ? { imagenUrl: p.fotosArray[0] } : {}),
    slugSeo: p.slugSeo,
  };

  function alTocar(e: MouseEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (cant === 0) {
    return (
      <button
        type="button"
        disabled={sinStock}
        onClick={(e) => {
          alTocar(e);
          agregar({ ...linea, cantidad: 1 });
        }}
        className="gx-btn-primary w-full !py-2.5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={16} strokeWidth={2.5} /> Agregar
      </button>
    );
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop que solo detiene propagacion del click hacia la tarjeta-link; los botones internos (-/+) son focusables y operables con teclado, el contador en si no es un control
    <div
      className="flex w-full items-center justify-between rounded-lg bg-marca/10 ring-1 ring-marca/40"
      onClick={alTocar}
    >
      <button
        type="button"
        aria-label="Quitar uno"
        onClick={(e) => {
          alTocar(e);
          actualizarCantidad(variante.id, cant - 1);
        }}
        className="flex h-10 w-10 items-center justify-center rounded-l-lg font-bold text-lg text-marca transition hover:bg-marca/20"
      >
        −
      </button>
      <span className="font-bold text-marca text-sm" aria-live="polite">
        {cant}
      </span>
      <button
        type="button"
        aria-label="Agregar uno"
        onClick={(e) => {
          alTocar(e);
          actualizarCantidad(variante.id, cant + 1);
        }}
        className="flex h-10 w-10 items-center justify-center rounded-r-lg font-bold text-lg text-marca transition hover:bg-marca/20"
      >
        +
      </button>
    </div>
  );
}

export function ProductoGrid({
  items,
  msi,
}: {
  items: ProductoPublicado[];
  msi?: MsiConfigPublica;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductoCard key={p.id} p={p} {...(msi ? { msi } : {})} />
      ))}
    </div>
  );
}
