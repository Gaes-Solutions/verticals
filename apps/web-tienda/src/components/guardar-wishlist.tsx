"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Botón "Guardar" en la página de producto: agrega a la wishlist del cliente. */
export function GuardarWishlist({ productoPublicadoId }: { productoPublicadoId: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "guardando" | "guardado">("idle");

  async function guardar() {
    setEstado("guardando");
    const res = await fetch("/api/cuenta/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productoPublicadoId }),
    });
    if (res.status === 401) {
      router.push("/cuenta/login");
      return;
    }
    setEstado(res.ok ? "guardado" : "idle");
  }

  return (
    <button
      type="button"
      onClick={guardar}
      disabled={estado === "guardando" || estado === "guardado"}
      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-marca hover:text-marca disabled:opacity-60"
    >
      {estado === "guardado" ? "♥ Guardado" : "♡ Guardar"}
    </button>
  );
}
