"use client";

import { guardarCarrito } from "@/lib/carrito-store";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Link del email de carrito abandonado: restaura el carrito y lleva a pagar. */
export default function RecoveryPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const router = useRouter();
  const [estado, setEstado] = useState<"cargando" | "no_disponible">("cargando");

  useEffect(() => {
    if (!codigo) return;
    fetch(`/api/recovery/${codigo}`).then(async (res) => {
      if (!res.ok) {
        setEstado("no_disponible");
        return;
      }
      const carrito = (await res.json()) as {
        items: Array<{
          varianteId: string;
          nombre: string;
          precioUnitario: string;
          cantidad: string;
        }>;
      };
      guardarCarrito(
        carrito.items.map((i) => ({
          varianteId: i.varianteId,
          titulo: i.nombre,
          precio: i.precioUnitario,
          cantidad: Number(i.cantidad),
        })),
      );
      router.replace("/carrito");
    });
  }, [codigo, router]);

  if (estado === "no_disponible") {
    return (
      <div className="text-center">
        <p className="text-gray-500">Este carrito ya no está disponible.</p>
        <Link href="/" className="mt-4 inline-block text-marca">
          ← Ir al catálogo
        </Link>
      </div>
    );
  }
  return <p className="text-center text-gray-500">Recuperando tu carrito…</p>;
}
