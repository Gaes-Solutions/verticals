"use client";

import { agregar } from "@/lib/carrito-store";
import type { WishlistItem } from "@/lib/cliente";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Lista de deseos en la página de cuenta, con quitar + agregar al carrito. */
export function WishlistCuenta({ inicial }: { inicial: WishlistItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(inicial);
  const [agregado, setAgregado] = useState<string | null>(null);

  async function quitar(itemId: string) {
    const res = await fetch(`/api/cuenta/wishlist/${itemId}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.itemId !== itemId));
      router.refresh();
    }
  }

  function alCarrito(i: WishlistItem) {
    if (!i.varianteId) {
      router.push(`/producto/${i.slugSeo}`);
      return;
    }
    agregar({
      varianteId: i.varianteId,
      titulo: i.tituloPublico,
      precio: i.precio,
      cantidad: 1,
      slugSeo: i.slugSeo,
      ...(i.foto ? { imagenUrl: i.foto } : {}),
    });
    setAgregado(i.itemId);
    setTimeout(() => setAgregado(null), 1500);
  }

  if (items.length === 0) {
    return <p className="text-sm text-gray-500">Tu lista de deseos está vacía.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {items.map((i) => (
        <div key={i.itemId} className="rounded-lg border bg-white p-3">
          <Link href={`/producto/${i.slugSeo}`}>
            <div className="mb-2 flex aspect-square items-center justify-center rounded bg-gray-100 text-3xl">
              {i.foto ? (
                <img
                  src={i.foto}
                  alt={i.tituloPublico}
                  className="h-full w-full rounded object-cover"
                />
              ) : (
                "📦"
              )}
            </div>
            <p className="line-clamp-2 text-sm font-medium hover:text-marca">{i.tituloPublico}</p>
          </Link>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-bold text-marca">${Number(i.precio).toFixed(2)}</span>
            <button
              type="button"
              onClick={() => quitar(i.itemId)}
              className="text-gray-400 text-xs hover:text-red-500"
            >
              Quitar
            </button>
          </div>
          <button
            type="button"
            onClick={() => alCarrito(i)}
            className="mt-2 w-full rounded-lg bg-marca py-1.5 font-semibold text-sm text-white hover:opacity-90"
          >
            {agregado === i.itemId ? "✓ Agregado" : "Agregar al carrito"}
          </button>
        </div>
      ))}
    </div>
  );
}
