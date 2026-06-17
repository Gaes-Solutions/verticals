"use client";

import { type VistoReciente, leerVistos, registrarVisto } from "@/lib/vistos";
import { ImageOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    setItems(leerVistos().filter((v) => v.slugSeo !== excluir));
  }, [excluir]);

  if (items.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="mb-4 border-marca border-l-4 pl-3 font-bold text-xl">Vistos recientemente</h2>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-5 md:grid-cols-6">
        {items.map((v) => (
          <Link
            key={v.slugSeo}
            href={`/producto/${v.slugSeo}`}
            className="group rounded-xl border border-gray-100 bg-white p-2 transition hover:shadow-md"
          >
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-gray-50 to-gray-100">
              {v.imagen ? (
                <img
                  src={v.imagen}
                  alt={v.titulo}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <ImageOff size={28} strokeWidth={1.5} className="text-gray-300" />
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-gray-700 text-xs group-hover:text-marca">
              {v.titulo}
            </p>
            <p className="font-bold text-marca text-sm">${Number(v.precio).toFixed(2)}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
