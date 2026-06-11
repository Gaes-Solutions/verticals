"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const ORDENES = [
  { value: "relevancia", label: "Relevancia" },
  { value: "precio_asc", label: "Precio: menor a mayor" },
  { value: "precio_desc", label: "Precio: mayor a menor" },
  { value: "novedad", label: "Novedades" },
  { value: "populares", label: "Más populares" },
];

/** Ordenamiento + filtros (precio, ofertas, disponibilidad) que escriben a la URL. */
export function OrdenFiltros() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [min, setMin] = useState(params.get("precioMin") ?? "");
  const [max, setMax] = useState(params.get("precioMax") ?? "");

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const soloOfertas = params.get("soloOfertas") === "true";
  const soloDisponibles = params.get("soloDisponibles") === "true";

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-gray-500">Ordenar</span>
        <select
          value={params.get("orden") ?? "relevancia"}
          onChange={(e) =>
            setParam("orden", e.target.value === "relevancia" ? null : e.target.value)
          }
          className="rounded border px-2 py-1.5"
        >
          {ORDENES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1">
        <span className="text-gray-500">Precio</span>
        <input
          type="number"
          inputMode="numeric"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={() => setParam("precioMin", min || null)}
          placeholder="mín"
          className="w-20 rounded border px-2 py-1.5"
        />
        <span className="text-gray-400">–</span>
        <input
          type="number"
          inputMode="numeric"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() => setParam("precioMax", max || null)}
          placeholder="máx"
          className="w-20 rounded border px-2 py-1.5"
        />
      </div>

      <button
        type="button"
        onClick={() => setParam("soloOfertas", soloOfertas ? null : "true")}
        className={`rounded-full px-3 py-1.5 ${
          soloOfertas ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        🔥 Ofertas
      </button>
      <button
        type="button"
        onClick={() => setParam("soloDisponibles", soloDisponibles ? null : "true")}
        className={`rounded-full px-3 py-1.5 ${
          soloDisponibles ? "bg-marca text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        En stock
      </button>
    </div>
  );
}
