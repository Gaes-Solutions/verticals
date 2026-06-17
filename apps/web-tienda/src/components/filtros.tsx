"use client";

import type { CategoriaPublica } from "@/lib/api";
import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const ORDENES = [
  { value: "relevancia", label: "Más relevantes" },
  { value: "precio_asc", label: "Menor precio" },
  { value: "precio_desc", label: "Mayor precio" },
  { value: "novedad", label: "Novedades" },
  { value: "populares", label: "Más populares" },
];

function useParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function setParam(entries: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(entries)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }
  return { params, setParam };
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-gray-100 border-b py-4 first:pt-0">
      <h3 className="mb-2.5 font-semibold text-gray-800 text-sm">{titulo}</h3>
      {children}
    </div>
  );
}

/** Panel de filtros (precio, categoría, ofertas, stock). Reusado en sidebar y drawer. */
export function PanelFiltros({
  categorias,
  onNavigate,
}: {
  categorias: CategoriaPublica[];
  onNavigate?: () => void;
}) {
  const { params, setParam } = useParams();
  const [min, setMin] = useState(params.get("precioMin") ?? "");
  const [max, setMax] = useState(params.get("precioMax") ?? "");
  const cat = params.get("cat");
  const soloOfertas = params.get("soloOfertas") === "true";
  const soloDisponibles = params.get("soloDisponibles") === "true";

  function nav(entries: Record<string, string | null>) {
    setParam(entries);
    onNavigate?.();
  }

  return (
    <div className="text-sm">
      <Seccion titulo="Categorías">
        <ul className="space-y-0.5">
          <li>
            <button
              type="button"
              onClick={() => nav({ cat: null })}
              className={`block w-full rounded px-2 py-1.5 text-left transition ${!cat ? "bg-marca/10 font-semibold text-marca" : "text-gray-600 hover:bg-gray-50"}`}
            >
              Todas
            </button>
          </li>
          {categorias.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => nav({ cat: c.id })}
                className={`block w-full truncate rounded px-2 py-1.5 text-left transition ${cat === c.id ? "bg-marca/10 font-semibold text-marca" : "text-gray-600 hover:bg-gray-50"}`}
              >
                {c.nombre}
              </button>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Precio">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="Mín"
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 outline-none focus:border-marca"
          />
          <span className="text-gray-300">–</span>
          <input
            type="number"
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="Máx"
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 outline-none focus:border-marca"
          />
          <button
            type="button"
            onClick={() => nav({ precioMin: min || null, precioMax: max || null })}
            className="shrink-0 rounded-lg bg-marca px-3 py-1.5 font-semibold text-white"
          >
            OK
          </button>
        </div>
      </Seccion>

      <Seccion titulo="Ofertas y disponibilidad">
        <label className="flex cursor-pointer items-center gap-2 py-1 text-gray-700">
          <input
            type="checkbox"
            checked={soloOfertas}
            onChange={() => nav({ soloOfertas: soloOfertas ? null : "true" })}
            className="h-4 w-4 accent-marca"
          />
          Solo ofertas
        </label>
        <label className="flex cursor-pointer items-center gap-2 py-1 text-gray-700">
          <input
            type="checkbox"
            checked={soloDisponibles}
            onChange={() => nav({ soloDisponibles: soloDisponibles ? null : "true" })}
            className="h-4 w-4 accent-marca"
          />
          Solo en stock
        </label>
      </Seccion>

      <button
        type="button"
        onClick={() =>
          nav({
            cat: null,
            precioMin: null,
            precioMax: null,
            soloOfertas: null,
            soloDisponibles: null,
            q: null,
          })
        }
        className="mt-4 w-full rounded-lg border border-gray-200 py-2 font-medium text-gray-500 hover:bg-gray-50"
      >
        Limpiar filtros
      </button>
    </div>
  );
}

/** Barra superior: orden + botón Filtros (móvil con drawer) + chips activos. */
export function BarraFiltros({
  categorias,
  total,
}: {
  categorias: CategoriaPublica[];
  total: number;
}) {
  const { params, setParam } = useParams();
  const [open, setOpen] = useState(false);

  const cat = params.get("cat");
  const catNombre = categorias.find((c) => c.id === cat)?.nombre;
  const chips: { label: string; clear: Record<string, null> }[] = [];
  if (params.get("q")) chips.push({ label: `"${params.get("q")}"`, clear: { q: null } });
  if (catNombre) chips.push({ label: catNombre, clear: { cat: null } });
  if (params.get("soloOfertas")) chips.push({ label: "Ofertas", clear: { soloOfertas: null } });
  if (params.get("soloDisponibles"))
    chips.push({ label: "En stock", clear: { soloDisponibles: null } });
  const pMin = params.get("precioMin");
  const pMax = params.get("precioMax");
  if (pMin || pMax)
    chips.push({
      label: `$${pMin || "0"} – $${pMax || "∞"}`,
      clear: { precioMin: null, precioMax: null },
    });

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 font-medium text-gray-700 text-sm lg:hidden"
        >
          <SlidersHorizontal size={16} strokeWidth={2} /> Filtros
          {chips.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-marca px-1 text-[11px] text-white">
              {chips.length}
            </span>
          )}
        </button>

        <span className="hidden text-gray-500 text-sm sm:inline">
          {total.toLocaleString("es-MX")} resultados
        </span>

        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="hidden text-gray-500 sm:inline">Ordenar</span>
          <select
            value={params.get("orden") ?? "relevancia"}
            onChange={(e) =>
              setParam({ orden: e.target.value === "relevancia" ? null : e.target.value })
            }
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 outline-none focus:border-marca"
          >
            {ORDENES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setParam(chip.clear)}
              className="flex items-center gap-1 rounded-full bg-marca/10 px-3 py-1 font-medium text-marca text-xs hover:bg-marca/20"
            >
              {chip.label} <X size={13} strokeWidth={2.5} className="text-marca/70" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute right-0 bottom-0 left-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-gray-800 text-lg">Filtros</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-2xl text-gray-400 leading-none"
              >
                ×
              </button>
            </div>
            <PanelFiltros categorias={categorias} onNavigate={() => setOpen(false)} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-lg bg-marca py-3 font-semibold text-white"
            >
              Ver {total.toLocaleString("es-MX")} resultados
            </button>
          </div>
        </div>
      )}
    </>
  );
}
