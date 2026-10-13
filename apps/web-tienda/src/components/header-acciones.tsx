"use client";

import { leerCarrito } from "@/lib/carrito-store";
import { construirParamsFiltros } from "@/lib/catalogo-query";
import { Package, Search, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

/** Buscador + cuenta + carrito con contador. Vive en el header (cliente por el contador). */
export function HeaderAcciones() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [count, setCount] = useState(0);

  // El campo refleja el término activo en la URL: al volver de un detalle o
  // navegar atrás/adelante no queda un texto viejo distinto al resultado.
  const qUrl = searchParams.get("q") ?? "";
  useEffect(() => {
    setQ(qUrl);
  }, [qUrl]);

  useEffect(() => {
    const refresh = () => setCount(leerCarrito().reduce((acc, i) => acc + i.cantidad, 0));
    refresh();
    window.addEventListener("carrito-actualizado", refresh);
    return () => window.removeEventListener("carrito-actualizado", refresh);
  }, []);

  function buscar(e: FormEvent) {
    e.preventDefault();
    // Buscar no pierde el contexto: conserva categoría, precio, ofertas, etc.
    // y solo reemplaza el término (reiniciando la paginación).
    const termino = q.trim();
    const qs = construirParamsFiltros(searchParams, { q: termino || null });
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <div className="store-header-actions">
      <form onSubmit={buscar} className="store-search">
        <label htmlFor="store-search" className="sr-only">
          Buscar en la tienda
        </label>
        <input
          id="store-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="¿Qué estás buscando hoy?"
          autoComplete="off"
        />
        <button type="submit" aria-label="Buscar productos">
          <Search size={23} />
        </button>
      </form>
      <div className="store-header-links">
        <Link href="/cuenta" className="store-header-link">
          <User size={23} />
          <span>
            <small>Bienvenido</small>
            <strong>Mi cuenta</strong>
          </span>
        </Link>
        <Link href="/seguimiento" className="store-header-link store-orders">
          <Package size={23} />
          <span>
            <small>Sigue tu compra</small>
            <strong>Mis pedidos</strong>
          </span>
        </Link>
        <Link
          href="/carrito"
          className="store-header-link store-cart"
          aria-label={`Carrito, ${count} productos`}
        >
          <span className="relative">
            <ShoppingCart size={27} />
            <b className="store-cart-count">{count}</b>
          </span>
          <span>
            <small>Tu compra</small>
            <strong>Carrito</strong>
          </span>
        </Link>
      </div>
    </div>
  );
}
