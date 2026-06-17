"use client";

import { leerCarrito } from "@/lib/carrito-store";
import { Search, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

/** Buscador + cuenta + carrito con contador. Vive en el header (cliente por el contador). */
export function HeaderAcciones() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () => setCount(leerCarrito().reduce((acc, i) => acc + i.cantidad, 0));
    refresh();
    window.addEventListener("carrito-actualizado", refresh);
    return () => window.removeEventListener("carrito-actualizado", refresh);
  }, []);

  function buscar(e: FormEvent) {
    e.preventDefault();
    router.push(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/");
  }

  return (
    <div className="flex flex-1 items-center gap-3 sm:gap-5">
      <form onSubmit={buscar} className="relative flex-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar productos…"
          className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pr-10 pl-4 text-sm outline-none focus:border-marca focus:bg-white"
        />
        <button
          type="submit"
          aria-label="Buscar"
          className="-translate-y-1/2 absolute top-1/2 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-marca text-white"
        >
          <Search size={16} strokeWidth={2.5} />
        </button>
      </form>

      <Link
        href="/cuenta"
        className="hidden items-center gap-1.5 text-gray-600 text-sm hover:text-marca sm:flex"
      >
        <User size={20} strokeWidth={1.75} />
        <span className="hidden md:inline">Mi cuenta</span>
      </Link>

      <Link
        href="/carrito"
        aria-label="Carrito"
        className="relative flex items-center gap-1.5 text-gray-600 hover:text-marca"
      >
        <ShoppingCart size={22} strokeWidth={1.75} />
        {count > 0 && (
          <span className="-right-2 -top-2 absolute flex h-5 min-w-5 items-center justify-center rounded-full bg-marca px-1 font-bold text-[11px] text-white">
            {count}
          </span>
        )}
      </Link>
    </div>
  );
}
