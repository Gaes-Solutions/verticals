"use client";

import {
  VISTOS_CAMBIADOS,
  VISTOS_KEY,
  type VistoReciente,
  leerVistos,
  registrarVisto,
} from "@/lib/vistos";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ImagenCompra } from "./imagen-compra";

/** Registra el producto actual como visto (se monta en la página de producto). */
export function RegistrarVisto({ visto }: { visto: VistoReciente }) {
  useEffect(() => {
    registrarVisto(visto);
  }, [visto]);
  return null;
}

/** Sección "Vistos recientemente" (localStorage). Excluye el slug actual. */
export function VistosRecientes({ excluir }: { excluir?: string }) {
  const [items, setItems] = useState<VistoReciente[]>([]);
  const tituloId = useId();

  useEffect(() => {
    const refrescar = () => setItems(leerVistos().filter((v) => v.slugSeo !== excluir));
    const externo = (event: StorageEvent) => {
      if (event.key === null || event.key === VISTOS_KEY) refrescar();
    };
    refrescar();
    window.addEventListener(VISTOS_CAMBIADOS, refrescar);
    window.addEventListener("storage", externo);
    return () => {
      window.removeEventListener(VISTOS_CAMBIADOS, refrescar);
      window.removeEventListener("storage", externo);
    };
  }, [excluir]);

  if (items.length === 0) return null;

  return (
    <section className="mt-12" aria-labelledby={tituloId}>
      <h2 id={tituloId} className="mb-2 border-marca border-l-4 pl-3 font-bold text-xl">
        Vistos recientemente
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Último precio visto. Confirma el precio y la disponibilidad al abrir el producto.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5 md:grid-cols-6">
        {items.map((v) => (
          <Link
            key={v.slugSeo}
            href={`/producto/${v.slugSeo}`}
            className="group rounded-xl border border-slate-100 bg-white p-2 transition hover:shadow-md"
          >
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-slate-100">
              <ImagenCompra
                src={v.imagen}
                alt={v.titulo}
                className="h-full w-full object-contain transition group-hover:scale-105"
              />
            </div>
            <p className="mt-1.5 line-clamp-2 text-slate-700 text-xs group-hover:text-marca">
              {v.titulo}
            </p>
            <p className="break-all font-bold text-marca text-sm">
              {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
                Number(v.precio),
              )}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
