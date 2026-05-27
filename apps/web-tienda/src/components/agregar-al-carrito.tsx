"use client";

import { agregar } from "@/lib/carrito-store";
import { useState } from "react";

export function AgregarAlCarrito({
  varianteId,
  titulo,
  precio,
}: {
  varianteId: string;
  titulo: string;
  precio: string;
}) {
  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);

  function onAgregar() {
    agregar({ varianteId, titulo, precio, cantidad });
    setAgregado(true);
    setTimeout(() => setAgregado(false), 1500);
  }

  return (
    <div className="mt-6 flex items-center gap-3">
      <input
        type="number"
        min={1}
        value={cantidad}
        onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
        className="w-20 rounded border px-3 py-2"
      />
      <button
        type="button"
        onClick={onAgregar}
        className="rounded bg-marca px-6 py-2 font-medium text-white transition hover:bg-marca-dark"
      >
        {agregado ? "✓ Agregado" : "Agregar al carrito"}
      </button>
    </div>
  );
}
