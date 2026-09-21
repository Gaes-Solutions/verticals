"use client";

import { useRouter } from "next/navigation";

/**
 * Estado de error reintentable para páginas server-rendered: explica qué pasó
 * y ofrece reintentar (refresh) sin mentir un 404 cuando el fallo fue del servidor.
 */
export function EstadoError({
  titulo = "No se pudo cargar",
  descripcion = "Tuvimos un problema al cargar esta información. Inténtalo de nuevo.",
}: {
  titulo?: string;
  descripcion?: string;
}) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="font-bold text-2xl text-slate-800">{titulo}</h1>
      <p className="mt-2 text-sm text-slate-500">{descripcion}</p>
      <button type="button" onClick={() => router.refresh()} className="gx-btn-primary mt-6">
        Reintentar
      </button>
    </div>
  );
}
