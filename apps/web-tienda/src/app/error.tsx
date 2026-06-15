"use client";

import Link from "next/link";

/** Error boundary global de la tienda: opción de reintentar + volver al inicio. */
export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-6xl">😕</p>
      <h1 className="mt-4 font-bold text-2xl">Algo salió mal</h1>
      <p className="mt-2 text-gray-500">
        Tuvimos un problema al cargar esta página. Intenta de nuevo.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-marca px-5 py-2.5 font-semibold text-white hover:opacity-90"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
