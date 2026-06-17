"use client";

import { Heart } from "lucide-react";
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
      className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 text-sm hover:border-marca hover:text-marca disabled:opacity-60"
    >
      <Heart
        size={16}
        strokeWidth={2}
        className={estado === "guardado" ? "fill-marca text-marca" : ""}
      />
      {estado === "guardado" ? "Guardado" : "Guardar"}
    </button>
  );
}
