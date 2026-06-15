import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-6xl">🛍️</p>
      <h1 className="mt-4 font-bold text-2xl">No encontramos esta página</h1>
      <p className="mt-2 text-gray-500">
        El enlace puede estar roto o el producto ya no está disponible.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-marca px-5 py-2.5 font-semibold text-white hover:opacity-90"
        >
          Ir al catálogo
        </Link>
        <Link
          href="/seguimiento"
          className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50"
        >
          Rastrear pedido
        </Link>
      </div>
    </div>
  );
}
