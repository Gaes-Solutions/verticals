"use client";

import type { CategoriaPublica } from "@/lib/api";
import { construirParamsFiltros } from "@/lib/catalogo-query";
import { leerRangoPrecio } from "@/lib/rango-precio";
import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { DialogoTienda } from "./dialogo-tienda";

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
    // Conserva el contexto (filtros previos) y reinicia la paginación; sin
    // scroll para que el usuario no pierda la posición del panel de filtros.
    const qs = construirParamsFiltros(params, entries);
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }
  return { params, setParam };
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-slate-100 border-b py-5 first:pt-0">
      <h3 className="mb-2.5 font-semibold text-slate-900 text-sm tracking-tight">{titulo}</h3>
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
  const [errorPrecio, setErrorPrecio] = useState("");
  const precioId = useId();
  const cat = params.get("cat");
  const soloOfertas = params.get("soloOfertas") === "true";
  const soloDisponibles = params.get("soloDisponibles") === "true";
  // Los inputs reflejan siempre la URL: al quitar un chip, limpiar filtros o
  // navegar atrás/adelante, el valor tecleado sin aplicar no puede quedarse viejo.
  const precioMinUrl = params.get("precioMin") ?? "";
  const precioMaxUrl = params.get("precioMax") ?? "";
  const url = params.toString();
  useEffect(() => {
    const next = new URLSearchParams(url);
    setMin(next.get("precioMin") ?? "");
    setMax(next.get("precioMax") ?? "");
    setErrorPrecio("");
  }, [url]);

  function nav(entries: Record<string, string | null>) {
    setParam(entries);
    onNavigate?.();
  }

  const hayFiltrosQueLimpiar = Boolean(
    cat || precioMinUrl || precioMaxUrl || soloOfertas || soloDisponibles || params.get("q"),
  );

  return (
    <div className="text-sm">
      <Seccion titulo="Categorías">
        <ul className="space-y-0.5">
          <li>
            <button
              type="button"
              onClick={() => nav({ cat: null })}
              className={`block min-h-11 w-full rounded px-2 py-1.5 text-left transition ${!cat ? "bg-marca/10 font-semibold text-marca" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Todas
            </button>
          </li>
          {categorias.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => nav({ cat: c.id })}
                className={`block min-h-11 w-full truncate rounded px-2 py-1.5 text-left transition ${cat === c.id ? "bg-marca/10 font-semibold text-marca" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {c.nombre}
              </button>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Precio">
        <form
          className="flex min-w-0 items-center gap-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const rango = leerRangoPrecio(min, max);
            if (!rango.ok) {
              setErrorPrecio(rango.mensaje);
              return;
            }
            setErrorPrecio("");
            nav({ precioMin: rango.min, precioMax: rango.max });
          }}
        >
          <label htmlFor={`${precioId}-min`} className="sr-only">
            Precio mínimo
          </label>
          <input
            id={`${precioId}-min`}
            type="text"
            inputMode="decimal"
            maxLength={13}
            aria-invalid={!!errorPrecio}
            aria-describedby={errorPrecio ? `${precioId}-error` : undefined}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="Mín"
            className="gx-input min-h-11 min-w-0"
          />
          <span className="text-slate-300">–</span>
          <label htmlFor={`${precioId}-max`} className="sr-only">
            Precio máximo
          </label>
          <input
            id={`${precioId}-max`}
            type="text"
            inputMode="decimal"
            maxLength={13}
            aria-invalid={!!errorPrecio}
            aria-describedby={errorPrecio ? `${precioId}-error` : undefined}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="Máx"
            className="gx-input min-h-11 min-w-0"
          />
          <button
            type="submit"
            aria-label="Aplicar rango de precio"
            className="gx-btn-primary min-h-11 shrink-0"
          >
            OK
          </button>
        </form>
        {errorPrecio && (
          <p id={`${precioId}-error`} role="alert" className="mt-2 text-danger text-xs">
            {errorPrecio}
          </p>
        )}
      </Seccion>

      <Seccion titulo="Ofertas y disponibilidad">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 py-1 text-slate-700">
          <input
            type="checkbox"
            checked={soloOfertas}
            onChange={() => nav({ soloOfertas: soloOfertas ? null : "true" })}
            className="h-4 w-4 accent-marca"
          />
          Solo ofertas
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 py-1 text-slate-700">
          <input
            type="checkbox"
            checked={soloDisponibles}
            onChange={() => nav({ soloDisponibles: soloDisponibles ? null : "true" })}
            className="h-4 w-4 accent-marca"
          />
          Solo en stock
        </label>
      </Seccion>

      {hayFiltrosQueLimpiar && (
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
          className="gx-btn-secondary mt-4 min-h-11 w-full"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

/** Barra superior: orden + botón Filtros (móvil con drawer) + chips activos. */
export function BarraFiltros({
  categorias,
  total,
}: {
  categorias: CategoriaPublica[];
  total: number | null;
}) {
  const { params, setParam } = useParams();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const close = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);

  const cat = params.get("cat");
  const catNombre = categorias.find((c) => c.id === cat)?.nombre;
  const chips: { label: string; clear: Record<string, null> }[] = [];
  if (params.get("q")) chips.push({ label: `"${params.get("q")}"`, clear: { q: null } });
  if (catNombre) chips.push({ label: catNombre, clear: { cat: null } });
  if (params.get("soloOfertas") === "true")
    chips.push({ label: "Ofertas", clear: { soloOfertas: null } });
  if (params.get("soloDisponibles") === "true")
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
      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-3 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="gx-btn-secondary min-h-11 lg:hidden"
        >
          <SlidersHorizontal size={16} strokeWidth={2} /> Filtros
          {chips.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-marca px-1 text-[11px] text-white">
              {chips.length}
            </span>
          )}
        </button>

        <span className="hidden text-slate-500 text-sm sm:inline">
          {total === null
            ? "Consulta no disponible"
            : `${total.toLocaleString("es-MX")} resultados`}
        </span>

        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="hidden text-slate-500 sm:inline">Ordenar</span>
          <select
            aria-label="Ordenar productos"
            value={params.get("orden") ?? "relevancia"}
            onChange={(e) =>
              setParam({ orden: e.target.value === "relevancia" ? null : e.target.value })
            }
            className="gx-input min-h-11 min-w-0 !w-auto !rounded-xl !bg-white"
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
              aria-label={`Quitar filtro ${chip.label}`}
              className="flex min-h-11 items-center gap-1 rounded-full bg-marca/10 px-3 py-1 font-medium text-marca text-xs hover:bg-marca/20"
            >
              {chip.label} <X size={13} strokeWidth={2.5} className="text-marca/70" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <DialogoTienda titulo="Filtros" onCerrar={() => setOpen(false)}>
          <PanelFiltros categorias={categorias} onNavigate={() => setOpen(false)} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="gx-btn-primary mt-4 min-h-11 w-full"
          >
            {total === null ? "Cerrar filtros" : `Ver ${total.toLocaleString("es-MX")} resultados`}
          </button>
        </DialogoTienda>
      )}
    </>
  );
}
