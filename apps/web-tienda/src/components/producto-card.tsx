"use client";

import type { ProductoPublicado } from "@/lib/api";
import { siguienteCantidadCatalogo } from "@/lib/cantidad-catalogo";
import { actualizarCantidad, agregar, leerCarrito } from "@/lib/carrito-store";
import { ariaCalificacion, estrellasDe, etiquetaUnidad, lineaEntrega } from "@/lib/etiquetas";
import { Clock, Store, Truck } from "lucide-react";
import Link from "next/link";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { BotonAgregar } from "./boton-agregar";
import { ImagenCompra } from "./imagen-compra";

/** MSI configurable del tenant (viene de getTiendaConfig). */
export interface MsiConfigPublica {
  habilitado: boolean;
  meses: number[];
  montoMinimo: string;
}

/** Entrega configurable del tenant: ETA de envío y/o recogida en tienda. */
export interface EntregaConfigPublica {
  eta: { min: number; max: number } | null;
  recogida: boolean;
}

function partePrecio(valor: number): { ent: string; cent: string } {
  const [ent = "0", cent = "00"] = valor.toFixed(2).split(".");
  return { ent, cent };
}

/** Estrellas readonly nivel marketplace + cuenta, accesibles con aria-label. */
export function EstrellasProducto({
  promedio,
  cuenta,
}: {
  promedio: number;
  cuenta: number;
}) {
  return (
    <span className="flex items-center gap-1" aria-label={ariaCalificacion(promedio, cuenta)}>
      <span className="text-warn" aria-hidden="true">
        {estrellasDe(promedio)}
      </span>
      <span className="text-slate-500 text-xs">({cuenta})</span>
    </span>
  );
}

/** Tarjeta de producto nivel marketplace: badges de oferta/FULL, MSI y quick-add. */
export function ProductoCard({
  p,
  msi,
  entrega,
}: {
  p: ProductoPublicado;
  msi?: MsiConfigPublica;
  entrega?: EntregaConfigPublica;
}) {
  const base = Number(
    p.precioDesde || p.precioPublicoOverride || p.producto.variantes[0]?.precioBase || 0,
  );
  const promo = p.enOferta && p.precioPromocion ? Number(p.precioPromocion) : null;
  const precio = promo ?? base;

  return (
    <article
      aria-label={p.tituloPublico}
      className="store-product-card group relative flex flex-col overflow-hidden"
    >
      {p.enOferta && p.descuentoPct > 0 && (
        <span className="absolute left-2.5 top-2.5 z-10 rounded-md bg-offer px-2 py-0.5 font-bold text-offer-dark text-xs shadow">
          -{p.descuentoPct}%
        </span>
      )}
      {p.envioGratis && (
        <span className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1 rounded-md bg-ok px-2 py-0.5 font-bold text-white text-xs shadow">
          <Truck size={12} strokeWidth={2.5} /> Envío gratis
        </span>
      )}
      <Link href={`/producto/${p.slugSeo}`} aria-label={`Ver ${p.tituloPublico}`}>
        <div className="store-product-image flex aspect-square items-center justify-center overflow-hidden">
          <ImagenCompra
            src={p.fotosArray[0]}
            alt={p.tituloPublico}
            className="h-full w-full object-contain p-4 transition duration-300 group-hover:scale-105"
          />
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        {p.categoriaPublica && (
          <p className="mb-1 text-[11px] text-slate-400 uppercase tracking-wide">
            {p.categoriaPublica.nombre}
          </p>
        )}
        <Link href={`/producto/${p.slugSeo}`} className="flex-1">
          <h2 className="line-clamp-2 font-medium text-slate-800 text-sm group-hover:text-marca">
            {p.tituloPublico}
          </h2>
        </Link>
        {p.ratingCuenta != null && p.ratingCuenta > 0 && p.ratingPromedio != null && (
          <div className="mt-1">
            <EstrellasProducto promedio={p.ratingPromedio} cuenta={p.ratingCuenta} />
          </div>
        )}
        <PrecioProducto
          base={base}
          precio={precio}
          enOferta={promo != null}
          unidadMedida={p.unidadMedida}
          msi={msi}
          entrega={entrega}
        />
        <div className="mt-1.5 flex min-h-[20px] flex-wrap gap-1">
          {p.stockBajo && p.stockPublico != null && (
            <span className="gx-badge-warn text-[11px]">¡Últimas {p.stockPublico}!</span>
          )}
        </div>
        <div className="mt-2">
          <QuickAdd p={p} precio={precio.toFixed(2)} />
        </div>
      </div>
    </article>
  );
}

/** Bloque de precio de la tarjeta: promo tachada, grande con unidad, MSI y ETA. */
function PrecioProducto({
  base,
  precio,
  enOferta,
  unidadMedida,
  msi,
  entrega,
}: {
  base: number;
  precio: number;
  enOferta: boolean;
  unidadMedida?: string | null;
  msi?: MsiConfigPublica;
  entrega?: EntregaConfigPublica;
}) {
  const { ent, cent } = partePrecio(precio);
  const unidad = etiquetaUnidad(unidadMedida);
  const textoEntrega = entrega ? lineaEntrega(entrega.eta, entrega.recogida) : null;
  const mostrarMsi = msi?.habilitado && msi.meses.length > 0 && precio >= Number(msi.montoMinimo);
  const mesesMsi = mostrarMsi
    ? (msi?.meses.filter((m) => m >= 3).sort((a, b) => a - b)[0] ?? msi?.meses[0] ?? 0)
    : 0;
  return (
    <div className="mt-2">
      {enOferta && <span className="text-slate-400 text-xs line-through">${base.toFixed(2)}</span>}
      <p className="flex items-baseline gap-0.5 font-black text-slate-900 text-2xl">
        <span className="text-base">$</span>
        {ent}
        <sup className="font-bold text-xs">{cent}</sup>
        {unidad && <span className="ml-1 font-normal text-slate-400 text-xs">{unidad}</span>}
      </p>
      {mostrarMsi && mesesMsi > 0 && (
        <p className="mt-0.5 font-medium text-ok text-xs">
          {mesesMsi} x ${(precio / mesesMsi).toFixed(2)} sin intereses
        </p>
      )}
      {textoEntrega && (
        <p className="mt-1 flex items-center gap-1 text-slate-500 text-xs">
          {entrega?.eta ? (
            <Clock size={12} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Store size={12} strokeWidth={2} aria-hidden="true" />
          )}
          {textoEntrega}
        </p>
      )}
    </div>
  );
}

/**
 * Quick-add: el primer toque agrega 1 al carrito y el botón se convierte en
 * stepper (− n ＋) sin salir del grid. Sincronizado con el carrito real.
 */
function QuickAdd({ p, precio }: { p: ProductoPublicado; precio: string }) {
  return (
    <CantidadProducto
      key={JSON.stringify([p.id, p.producto.variantes.map((v) => v.id)])}
      p={p}
      precio={precio}
    />
  );
}
function CantidadProducto({ p, precio }: { p: ProductoPublicado; precio: string }) {
  const variante = p.producto.variantes[0];
  const varianteId = variante?.id;
  const [lectura, setLectura] = useState({ cantidad: 0, contexto: 0, lista: false });
  const [error, setError] = useState("");
  const contexto = useRef(0);
  const activo = useRef(false);
  const cant = lectura.cantidad;

  useEffect(() => {
    activo.current = true;
    if (!varianteId)
      return () => {
        activo.current = false;
      };
    const leer = () => {
      try {
        setLectura({
          cantidad: leerCarrito().find((i) => i.varianteId === varianteId)?.cantidad ?? 0,
          contexto: contexto.current,
          lista: true,
        });
      } catch {
        setLectura({ cantidad: 0, contexto: contexto.current, lista: false });
        setError("No pudimos leer tu carrito. Revisa que el navegador permita guardar datos.");
      }
    };
    const cambiarContexto = () => {
      contexto.current++;
      setError("");
      leer();
    };
    leer();
    window.addEventListener("carrito-actualizado", leer);
    window.addEventListener("carrito-contexto-cambiado", cambiarContexto);
    return () => {
      activo.current = false;
      window.removeEventListener("carrito-actualizado", leer);
      window.removeEventListener("carrito-contexto-cambiado", cambiarContexto);
    };
  }, [varianteId]);

  if (!variante) return null;
  const sinStock =
    p.stockPublico != null && (!Number.isFinite(p.stockPublico) || p.stockPublico < 1);
  const precioValido = Number.isFinite(Number(precio)) && Number(precio) >= 0;
  const linea = {
    varianteId: variante.id,
    titulo: p.tituloPublico,
    precio,
    ...(p.fotosArray[0] ? { imagenUrl: p.fotosArray[0] } : {}),
    slugSeo: p.slugSeo,
  };

  function cambiar(cambio: 1 | -1) {
    if (!variante || !activo.current || !lectura.lista || lectura.contexto !== contexto.current)
      return;
    try {
      const actual = leerCarrito().find((i) => i.varianteId === variante.id);
      const next = siguienteCantidadCatalogo(actual?.cantidad ?? 0, cambio, p.stockPublico);
      if (next === null || (cambio > 0 && !precioValido)) return;
      setError("");
      if (actual) actualizarCantidad(variante.id, next);
      else if (next > 0) agregar({ ...linea, cantidad: next });
    } catch {
      setError("No pudimos confirmar el cambio. Revisa tu carrito antes de volver a intentar.");
    }
  }

  function alTocar(e: MouseEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (p.producto.variantes.length > 1)
    return (
      <Link href={`/producto/${p.slugSeo}`} className="store-add-button w-full">
        Elegir opciones →
      </Link>
    );

  if (cant === 0) {
    return (
      <div>
        <BotonAgregar
          key={lectura.contexto}
          disabled={sinStock || !lectura.lista || !precioValido}
          textoDeshabilitado={
            !lectura.lista ? "Preparando…" : !precioValido ? "No disponible" : "Agotado"
          }
          onAgregar={() => cambiar(1)}
        />
        {error && (
          <p role="alert" className="mt-2 text-danger text-xs">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <fieldset
        key={lectura.contexto}
        className="flex min-w-0 w-full items-center justify-between rounded-lg bg-marca/10 ring-1 ring-marca/40"
        aria-label={`Cantidad de ${p.tituloPublico}`}
      >
        <button
          type="button"
          aria-label="Quitar uno"
          onClick={(e) => {
            alTocar(e);
            cambiar(-1);
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-l-lg font-bold text-lg text-marca transition hover:bg-marca/20"
        >
          −
        </button>
        <span
          className="min-w-0 flex-1 break-all text-center font-bold text-marca text-sm"
          aria-live="polite"
        >
          {cant}
        </span>
        <button
          type="button"
          aria-label="Agregar uno"
          disabled={
            !lectura.lista ||
            !precioValido ||
            siguienteCantidadCatalogo(cant, 1, p.stockPublico) === null
          }
          onClick={(e) => {
            alTocar(e);
            cambiar(1);
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-r-lg font-bold text-lg text-marca transition hover:bg-marca/20 disabled:opacity-30"
        >
          +
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

export function ProductoGrid({
  items,
  msi,
  entrega,
}: {
  items: ProductoPublicado[];
  msi?: MsiConfigPublica;
  entrega?: EntregaConfigPublica;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductoCard
          key={p.id}
          p={p}
          {...(msi ? { msi } : {})}
          {...(entrega ? { entrega } : {})}
        />
      ))}
    </div>
  );
}
