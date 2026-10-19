"use client";
import { agregar, leerCarrito } from "@/lib/carrito-store";
import {
  type SugerenciaCompra,
  leerSugerencias,
  sugerenciasFueraDelCarrito,
} from "@/lib/sugerencias-contract";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ImagenCompra } from "./imagen-compra";

/** Popular public products; never implies personal purchase history. */
export function SugerenciasCarrito() {
  const [sugerencias, setSugerencias] = useState<SugerenciaCompra[]>([]);
  const [aviso, setAviso] = useState("");
  const revision = useRef(0);
  const [version, setVersion] = useState(0);
  const [resultadoVersion, setResultadoVersion] = useState(-1);
  useEffect(() => {
    let activo = true;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seleccion = "";
    const cargar = async (generation: number) => {
      const cancel = new AbortController();
      controller = cancel;
      try {
        const data = await consultarSugerencias(cancel);
        if (activo && revision.current === generation) {
          setSugerencias(sugerenciasFueraDelCarrito(data, leerCarrito()));
          setResultadoVersion(generation);
        }
      } catch {
        if (activo && revision.current === generation) setSugerencias([]);
      }
    };
    const refresh = (event?: Event) => {
      let next: string;
      try {
        next = JSON.stringify(
          leerCarrito()
            .map((i) => i.varianteId)
            .sort(),
        );
      } catch {
        revision.current++;
        controller?.abort();
        clearTimeout(timer);
        setVersion(revision.current);
        setSugerencias([]);
        return;
      }
      if (event?.type === "carrito-actualizado" && seleccion === next) return;
      seleccion = next;
      const generation = ++revision.current;
      controller?.abort();
      clearTimeout(timer);
      setVersion(generation);
      setSugerencias([]);
      setAviso("");
      timer = setTimeout(() => void cargar(generation), 300);
    };
    refresh();
    window.addEventListener("carrito-actualizado", refresh);
    window.addEventListener("carrito-contexto-cambiado", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      activo = false;
      controller?.abort();
      clearTimeout(timer);
      window.removeEventListener("carrito-actualizado", refresh);
      window.removeEventListener("carrito-contexto-cambiado", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  function anadir(p: SugerenciaCompra) {
    if (resultadoVersion !== revision.current || p.variantes.length !== 1) return;
    try {
      if (!sugerenciasFueraDelCarrito([p], leerCarrito()).length) return;
      agregar({
        varianteId: p.variantes[0] as string,
        titulo: p.titulo,
        precio: p.precio,
        cantidad: 1,
        slugSeo: p.slug,
        ...(p.imagen ? { imagenUrl: p.imagen } : {}),
      });
    } catch {
      setAviso("No pudimos confirmar que se agregó. Revisa tu carrito antes de volver a intentar.");
    }
  }
  if (resultadoVersion !== version || !sugerencias.length) return null;
  return (
    <section className="mt-8" aria-labelledby="sugerencias-titulo">
      <h2 id="sugerencias-titulo" className="mb-3 font-bold text-slate-900 text-lg">
        También te puede gustar
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sugerencias.map((p) => (
          <div key={p.id} className="flex items-center gap-3 gx-card !p-3">
            <Link
              href={`/producto/${p.slug}`}
              aria-label={`Ver ${p.titulo}`}
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100"
            >
              <ImagenCompra src={p.imagen} alt={p.titulo} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/producto/${p.slug}`}
                className="line-clamp-2 break-words font-medium text-sm"
              >
                {p.titulo}
              </Link>
              <p className="font-bold text-slate-900">
                {p.variantes.length > 1 ? "Precio según opción" : `$${p.precio}`}
              </p>
              {p.variantes.length > 1 && (
                <Link
                  href={`/producto/${p.slug}`}
                  className="mt-1 inline-flex min-h-11 items-center font-semibold text-marca text-sm"
                >
                  Elegir opciones →
                </Link>
              )}
            </div>
            {p.variantes.length === 1 && (
              <button
                type="button"
                aria-label={`Agregar ${p.titulo}`}
                onClick={() => anadir(p)}
                className="gx-btn-primary h-11 w-11 shrink-0 !rounded-full !p-0"
              >
                <Plus size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
      {aviso && (
        <p role="alert" className="mt-3 text-sm">
          {aviso}
        </p>
      )}
    </section>
  );
}

async function consultarSugerencias(cancel: AbortController) {
  const signal = AbortSignal.any([cancel.signal, AbortSignal.timeout(15000)]);
  const res = await fetch("/api/catalogo?orden=populares&pageSize=24", {
    cache: "no-store",
    signal,
    redirect: "error",
  });
  const data = res.ok ? leerSugerencias(await res.json()) : null;
  signal.throwIfAborted();
  if (!data) throw new Error("Invalid catalog");
  return data;
}
