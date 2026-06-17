"use client";

import { agregar } from "@/lib/carrito-store";
import { Check, Truck } from "lucide-react";
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

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline gap-2">
        {oferta && (
          <span className="text-gray-400 text-lg line-through">${precioLista.toFixed(2)}</span>
        )}
        <p className="font-bold text-3xl text-marca">${precioNum.toFixed(2)}</p>
        {oferta && oferta.descuentoPct > 0 && (
          <span className="rounded bg-red-600 px-2 py-0.5 font-bold text-sm text-white">
            -{oferta.descuentoPct}%
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-sm">
        {envioGratis && (
          <span className="flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
            <Truck size={14} strokeWidth={2} /> Envío gratis
          </span>
        )}
        {stockBajo && stockPublico != null && (
          <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
            ¡Últimas {stockPublico} piezas!
          </span>
        )}
        {sinStock && (
          <span className="rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-500">
            Sin stock
          </span>
        )}
      </div>
      {mostrarMsi && (
        <p className="mt-1 text-gray-600 text-sm">
          o hasta <span className="font-semibold text-marca">{mejorPlazo} meses sin intereses</span>{" "}
          de ${(precioNum / mejorPlazo).toFixed(2)}
        </p>
      )}

      {variantes.length > 1 && (
        <div className="mt-4">
          <p className="mb-1 font-medium text-gray-700 text-sm">Elige una opción:</p>
          <div className="flex flex-wrap gap-2">
            {variantes.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSel(i)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  i === sel
                    ? "border-marca bg-marca/10 font-medium text-marca"
                    : "border-gray-300 text-gray-700 hover:border-marca"
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
          className="w-20 rounded-lg border px-3 py-2"
        />
        <button
          type="button"
          onClick={onAgregar}
          disabled={sinStock}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-marca px-6 py-2 font-medium text-marca transition hover:bg-marca/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {agregado && <Check size={16} strokeWidth={2.5} />}
          {agregado ? "Agregado" : "Agregar al carrito"}
        </button>
        {comprarAhora && (
          <button
            type="button"
            onClick={onComprarAhora}
            disabled={sinStock}
            className="rounded-lg bg-marca px-6 py-2 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Comprar ahora
          </button>
        )}
      </div>

      {sinStock && productoPublicadoId && <AvisoStock productoPublicadoId={productoPublicadoId} />}
    </div>
  );
}
