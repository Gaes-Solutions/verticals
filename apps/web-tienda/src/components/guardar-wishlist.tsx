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
      className="gx-btn-secondary"
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
