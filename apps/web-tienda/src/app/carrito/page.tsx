"use client";

import { BarraEnvioGratis } from "@/components/barra-envio-gratis";
import {
  type CarritoLineaLocal,
  actualizarCantidad,
  leerCarrito,
  quitar,
} from "@/lib/carrito-store";
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
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 font-bold text-2xl">Tu carrito</h1>

      {envioGratisDesde && (
        <div className="mb-4">
          <BarraEnvioGratis subtotal={total} umbral={envioGratisDesde} />
        </div>
      )}

      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.varianteId} className="flex gap-3 rounded-lg border bg-white p-3 sm:p-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-2xl">
              {i.imagenUrl ? (
                <img
                  src={i.imagenUrl}
                  alt={i.titulo}
                  className="h-full w-full rounded object-cover"
                />
              ) : (
                "📦"
              )}
            </div>
            <div className="flex flex-1 flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                {i.slugSeo ? (
                  <Link href={`/producto/${i.slugSeo}`} className="font-medium hover:text-marca">
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
                    className="flex h-8 w-8 items-center justify-center rounded border text-lg hover:bg-gray-50"
                    aria-label="Disminuir"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm">{i.cantidad}</span>
                  <button
                    type="button"
                    onClick={() => actualizarCantidad(i.varianteId, i.cantidad + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded border text-lg hover:bg-gray-50"
                    aria-label="Aumentar"
                  >
                    +
                  </button>
                  <span className="ml-1 text-gray-400 text-xs">
                    ${Number(i.precio).toFixed(2)} c/u
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => quitar(i.varianteId)}
                  className="text-red-500 text-sm hover:underline"
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="font-bold text-lg">Total: ${total.toFixed(2)}</span>
        <div className="flex gap-3">
          <Link
            href="/"
            className="rounded-lg border border-gray-300 px-4 py-3 text-gray-700 hover:bg-gray-50"
          >
            Seguir comprando
          </Link>
          <Link
            href="/checkout"
            className="rounded-lg bg-marca px-6 py-3 font-medium text-white hover:opacity-90"
          >
            Proceder al pago →
          </Link>
        </div>
      </div>
    </div>
  );
}
