"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/** Barra de búsqueda del catálogo: actualiza el query param `q` en la URL. */
export function Buscador() {
  const router = useRouter();
  const params = useSearchParams();
  const [valor, setValor] = useState(params.get("q") ?? "");

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams(params.toString());
    if (valor.trim()) sp.set("q", valor.trim());
    else sp.delete("q");
    sp.delete("cat");
    router.push(`/?${sp.toString()}`);
  }

  return (
    <form onSubmit={buscar} className="flex gap-2">
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Buscar productos…"
        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-marca focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-lg bg-marca px-5 py-2 font-semibold text-white hover:opacity-90"
      >
        Buscar
      </button>
    </form>
  );
}
