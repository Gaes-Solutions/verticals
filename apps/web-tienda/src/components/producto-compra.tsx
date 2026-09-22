"use client";

import { agregar } from "@/lib/carrito-store";
import { etiquetaUnidad } from "@/lib/etiquetas";
import { Check, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvisoStock } from "./aviso-stock";

export interface VarianteCompra {
  id: string;
  precioBase: string;
  nombreVariante: string | null;
  opciones?: Record<string, string> | null;
}

interface MsiConfig {
  habilitado: boolean;
  meses: number[];
  montoMinimo: string;
}

function etiquetaVariante(v: VarianteCompra, i: number): string {
  if (v.nombreVariante) return v.nombreVariante;
  const ops = v.opciones ? Object.values(v.opciones) : [];
  return ops.length ? ops.join(" · ") : `Opción ${i + 1}`;
}

export interface OfertaCompra {
  precioPromocion: string;
  descuentoPct: number;
}

export function ProductoCompra({
  variantes,
  precioOverride,
  titulo,
  comprarAhora,
  msi,
  oferta,
  stockPublico,
  stockBajo,
  envioGratis,
  unidadMedida,
  imagenUrl,
  slugSeo,
  productoPublicadoId,
}: {
  variantes: VarianteCompra[];
  precioOverride: string | null;
  titulo: string;
  comprarAhora: boolean;
  msi: MsiConfig;
  oferta?: OfertaCompra | null;
  stockPublico?: number | null;
  stockBajo?: boolean;
  envioGratis?: boolean;
  unidadMedida?: string | null;
  imagenUrl?: string;
  slugSeo?: string;
  productoPublicadoId?: string;
}) {
  const router = useRouter();
  const [sel, setSel] = useState(0);
  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);

  const variante = variantes[sel] ?? variantes[0];
  if (!variante) return null;
  const precioLista = Number(precioOverride ?? variante.precioBase);
  const precioNum = oferta ? Number(oferta.precioPromocion) : precioLista;
  const precio = String(precioNum);
  const sinStock = stockPublico != null && stockPublico <= 0;

  function alCarrito() {
    if (!variante) return;
    agregar({
      varianteId: variante.id,
      titulo,
      precio,
      cantidad,
      ...(imagenUrl ? { imagenUrl } : {}),
      ...(slugSeo ? { slugSeo } : {}),
    });
  }
  function onAgregar() {
    alCarrito();
    setAgregado(true);
    setTimeout(() => setAgregado(false), 1500);
  }
  function onComprarAhora() {
    alCarrito();
    router.push("/checkout");
  }

  const mostrarMsi = msi.habilitado && msi.meses.length > 0 && precioNum >= Number(msi.montoMinimo);
  const mejorPlazo = mostrarMsi ? Math.max(...msi.meses) : 0;
  const unidad = etiquetaUnidad(unidadMedida);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline gap-2">
        {oferta && (
          <span className="text-slate-400 text-lg line-through">${precioLista.toFixed(2)}</span>
        )}
        <p className="font-bold text-3xl text-marca">
          ${precioNum.toFixed(2)}
          {unidad && <span className="ml-1 font-normal text-slate-400 text-sm">{unidad}</span>}
        </p>
        {oferta && oferta.descuentoPct > 0 && (
          <span className="rounded bg-danger px-2 py-0.5 font-bold text-sm text-white">
            -{oferta.descuentoPct}%
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-sm">
        {envioGratis && (
          <span className="gx-badge-ok flex items-center gap-1">
            <Truck size={14} strokeWidth={2} /> Envío gratis
          </span>
        )}
        {stockBajo && stockPublico != null && (
          <span className="gx-badge-warn">¡Últimas {stockPublico} piezas!</span>
        )}
        {sinStock && <span className="gx-badge-danger">Sin stock</span>}
      </div>
      {mostrarMsi && (
        <p className="mt-1 text-slate-600 text-sm">
          o hasta <span className="font-semibold text-marca">{mejorPlazo} meses sin intereses</span>{" "}
          de ${(precioNum / mejorPlazo).toFixed(2)}
        </p>
      )}

      {variantes.length > 1 && (
        <div className="mt-4">
          <p className="mb-1 font-medium text-slate-700 text-sm">Elige una opción:</p>
          <div className="flex flex-wrap gap-2">
            {variantes.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSel(i)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  i === sel
                    ? "border-marca bg-marca/10 font-medium text-marca"
                    : "border-slate-300 text-slate-700 hover:border-marca"
                }`}
              >
                {etiquetaVariante(v, i)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          type="number"
          min={1}
          value={cantidad}
          onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
          aria-label="Cantidad"
          className="gx-input w-20"
        />
        <button
          type="button"
          onClick={onAgregar}
          disabled={sinStock}
          className="gx-btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {agregado && <Check size={16} strokeWidth={2.5} />}
          {agregado ? "Agregado" : "Agregar al carrito"}
        </button>
        {comprarAhora && (
          <button
            type="button"
            onClick={onComprarAhora}
            disabled={sinStock}
            className="gx-btn-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Comprar ahora
          </button>
        )}
      </div>

      <div aria-live="polite">
        {agregado && (
          <p className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 font-medium text-ok">
              <Check size={16} strokeWidth={2.5} /> Agregado al carrito
            </span>
            <Link href="/carrito" className="font-medium text-marca hover:underline">
              Ver carrito
            </Link>
          </p>
        )}
      </div>

      {sinStock && productoPublicadoId && <AvisoStock productoPublicadoId={productoPublicadoId} />}
    </div>
  );
}
