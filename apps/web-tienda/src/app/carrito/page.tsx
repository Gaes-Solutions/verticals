"use client";

import { BarraEnvioGratis } from "@/components/barra-envio-gratis";
import { SugerenciasCarrito } from "@/components/sugerencias-carrito";
import {
  type CarritoLineaLocal,
  actualizarCantidad,
  leerCarrito,
  quitar,
} from "@/lib/carrito-store";
import { ImageOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function CarritoPage() {
  const [items, setItems] = useState<CarritoLineaLocal[]>([]);
  const [envioGratisDesde, setEnvioGratisDesde] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => setItems(leerCarrito());
    refresh();
    window.addEventListener("carrito-actualizado", refresh);
    fetch("/api/tienda-config")
      .then((r) => r.json())
      .then((c: { envioGratisDesde: string | null }) => {
        if (c.envioGratisDesde) setEnvioGratisDesde(Number(c.envioGratisDesde));
      })
      .catch(() => {});
    return () => window.removeEventListener("carrito-actualizado", refresh);
  }, []);

  const total = items.reduce((acc, i) => acc + Number(i.precio) * i.cantidad, 0);

  if (items.length === 0) {
    return (
      <div className="text-center">
        <h1 className="font-bold text-2xl">Tu carrito está vacío</h1>
        <Link href="/" className="mt-4 inline-block text-marca">
          Ver catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl pb-28 lg:pb-0">
      <h1 className="mb-6 font-bold text-2xl">Tu carrito</h1>

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          {envioGratisDesde && (
            <div className="mb-4">
              <BarraEnvioGratis subtotal={total} umbral={envioGratisDesde} />
            </div>
          )}

          <div className="space-y-3">
            {items.map((i) => (
              <div key={i.varianteId} className="flex gap-3 gx-card !p-3 sm:!p-4">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded bg-slate-100">
                  {i.imagenUrl ? (
                    <img
                      src={i.imagenUrl}
                      alt={i.titulo}
                      className="h-full w-full rounded object-cover"
                    />
                  ) : (
                    <ImageOff size={24} strokeWidth={1.5} className="text-slate-300" />
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    {i.slugSeo ? (
                      <Link
                        href={`/producto/${i.slugSeo}`}
                        className="font-medium hover:text-marca"
                      >
                        {i.titulo}
                      </Link>
                    ) : (
                      <p className="font-medium">{i.titulo}</p>
                    )}
                    <span className="whitespace-nowrap font-bold">
                      ${(Number(i.precio) * i.cantidad).toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => actualizarCantidad(i.varianteId, i.cantidad - 1)}
                        className="flex h-10 w-10 items-center justify-center rounded border text-lg hover:bg-slate-50"
                        aria-label="Disminuir"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm">{i.cantidad}</span>
                      <button
                        type="button"
                        onClick={() => actualizarCantidad(i.varianteId, i.cantidad + 1)}
                        className="flex h-10 w-10 items-center justify-center rounded border text-lg hover:bg-slate-50"
                        aria-label="Aumentar"
                      >
                        +
                      </button>
                      <span className="ml-1 text-slate-400 text-xs">
                        ${Number(i.precio).toFixed(2)} c/u
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => quitar(i.varianteId)}
                      className="gx-btn-ghost !px-2 text-danger"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <SugerenciasCarrito />
        </div>

        {/* Resumen: sticky en desktop, barra fija en móvil */}
        <aside className="mt-6 lg:sticky lg:top-32 lg:mt-0">
          <div className="gx-card hidden !p-4 lg:block">
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-slate-500 text-xs">Subtotal sin costo de envío.</p>
            <Link href="/checkout" className="gx-btn-primary mt-4 w-full !py-3">
              Continuar compra →
            </Link>
            <Link href="/" className="gx-btn-ghost mt-2 w-full">
              Seguir comprando
            </Link>
          </div>
        </aside>
      </div>

      {/* Total siempre visible en móvil */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3 shadow-[0_-4px_12px_rgb(0_0_0/0.08)] lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-slate-500 text-xs">Subtotal</p>
            <p className="font-bold text-lg">${total.toFixed(2)}</p>
          </div>
          <Link href="/checkout" className="gx-btn-primary flex-1 !py-3 sm:flex-none sm:px-8">
            Continuar compra →
          </Link>
        </div>
      </div>
    </div>
  );
}
