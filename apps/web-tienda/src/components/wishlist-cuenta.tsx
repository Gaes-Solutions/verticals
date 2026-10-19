"use client";

import { agregar } from "@/lib/carrito-store";
import type { WishlistItem } from "@/lib/cliente";
import { listaWishlist } from "@/lib/preferencias-contract";
import { ErrorPreferencia, fetchPreferencia, useSolicitudCuenta } from "@/lib/use-solicitud-cuenta";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Lista de deseos en la página de cuenta, con quitar + agregar al carrito. */
export function WishlistCuenta({ inicial }: { inicial: WishlistItem[] }) {
  return <ListaWishlist key={JSON.stringify(inicial)} inicial={inicial} />;
}
function ListaWishlist({ inicial }: { inicial: WishlistItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(listaWishlist(inicial) ? inicial : []);
  const [incierto, setIncierto] = useState(!listaWishlist(inicial));
  const { ocupado, error, ejecutar } = useSolicitudCuenta();
  const [agregado, setAgregado] = useState<string | null>(null);
  const [errorCarrito, setErrorCarrito] = useState("");

  function quitar(itemId: string) {
    if (incierto) return;
    void ejecutar(
      async (signal) => {
        const { status } = await fetchPreferencia(
          `/api/cuenta/wishlist/${encodeURIComponent(itemId)}`,
          signal,
          { method: "DELETE" },
        );
        if (status !== 204) throw new ErrorPreferencia(502);
        setItems((prev) => prev.filter((i) => i.itemId !== itemId));
        window.dispatchEvent(new Event("wishlist-actualizada"));
        router.refresh();
      },
      () => setIncierto(true),
    );
  }
  function actualizar() {
    void ejecutar(async (signal) => {
      const { data } = await fetchPreferencia("/api/cuenta/wishlist", signal);
      if (!listaWishlist(data)) throw new ErrorPreferencia(502);
      setItems(data);
      setIncierto(false);
      window.dispatchEvent(new Event("wishlist-actualizada"));
    });
  }

  function alCarrito(i: WishlistItem) {
    if (!i.varianteId) {
      router.push(`/producto/${i.slugSeo}`);
      return;
    }
    setErrorCarrito("");
    try {
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
    } catch {
      setAgregado(null);
      setErrorCarrito(
        "No pudimos confirmar el cambio. Revisa tu carrito y sus cantidades antes de volver a intentar.",
      );
    }
  }

  return (
    <div>
      {errorCarrito && (
        <p role="alert" className="mb-2 text-danger text-sm">
          {errorCarrito}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-2 text-danger text-sm">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={actualizar}
        disabled={ocupado}
        className="gx-btn-secondary mb-3 min-h-11"
      >
        Actualizar lista de deseos
      </button>
      {incierto && (
        <p className="mb-2 text-slate-600 text-sm">
          Actualiza la lista antes de volver a quitar un producto.
        </p>
      )}
      {items.length === 0 && !incierto && (
        <p className="text-slate-500 text-sm">Tu lista de deseos está vacía.</p>
      )}
      <div className="grid grid-cols-1 gap-4 min-[380px]:grid-cols-2 md:grid-cols-3">
        {items.map((i) => (
          <div key={i.itemId} className="gx-card !p-3">
            <Link href={`/producto/${i.slugSeo}`}>
              <div className="mb-2 flex aspect-square items-center justify-center rounded bg-slate-100 text-3xl">
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
              <p className="line-clamp-2 break-words text-sm font-medium hover:text-marca">
                {i.tituloPublico}
              </p>
            </Link>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-marca">${Number(i.precio).toFixed(2)}</span>
              <button
                type="button"
                onClick={() => quitar(i.itemId)}
                disabled={ocupado || incierto}
                aria-label={`Quitar ${i.tituloPublico} de favoritos`}
                className="gx-btn-ghost min-h-11 !px-2 text-danger"
              >
                Quitar
              </button>
            </div>
            <button
              type="button"
              onClick={() => alCarrito(i)}
              className="gx-btn-primary mt-2 min-h-11 w-full"
            >
              {!i.varianteId
                ? "Elegir opciones"
                : agregado === i.itemId
                  ? "✓ Agregado"
                  : "Agregar al carrito"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
