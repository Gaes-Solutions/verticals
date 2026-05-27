"use client";

import { type CarritoLineaLocal, leerCarrito, quitar } from "@/lib/carrito-store";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function CarritoPage() {
  const [items, setItems] = useState<CarritoLineaLocal[]>([]);

  useEffect(() => {
    const refresh = () => setItems(leerCarrito());
    refresh();
    window.addEventListener("carrito-actualizado", refresh);
    return () => window.removeEventListener("carrito-actualizado", refresh);
  }, []);

  const total = items.reduce((acc, i) => acc + Number(i.precio) * i.cantidad, 0);

  if (items.length === 0) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold">Tu carrito está vacío</h1>
        <Link href="/" className="mt-4 inline-block text-marca">
          Ver catálogo
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Tu carrito</h1>
      <div className="space-y-3">
        {items.map((i) => (
          <div
            key={i.varianteId}
            className="flex items-center justify-between rounded border bg-white p-4"
          >
            <div>
              <p className="font-medium">{i.titulo}</p>
              <p className="text-sm text-gray-500">
                {i.cantidad} × ${Number(i.precio).toFixed(2)}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-bold">${(Number(i.precio) * i.cantidad).toFixed(2)}</span>
              <button
                type="button"
                onClick={() => quitar(i.varianteId)}
                className="text-sm text-red-500 hover:underline"
              >
                Quitar
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between border-t pt-4">
        <span className="text-lg font-bold">Total: ${total.toFixed(2)}</span>
        <Link
          href="/checkout"
          className="rounded bg-marca px-6 py-3 font-medium text-white hover:bg-marca-dark"
        >
          Proceder al pago →
        </Link>
      </div>
    </div>
  );
}
