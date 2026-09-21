import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-6xl">🛍️</p>
      <h1 className="mt-4 font-bold text-2xl">No encontramos esta página</h1>
      <p className="mt-2 text-slate-500">
        El enlace puede estar roto o el producto ya no está disponible.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className="gx-btn-primary">
          Ir al catálogo
        </Link>
        <Link href="/seguimiento" className="gx-btn-secondary">
          Rastrear pedido
        </Link>
      </div>
    </div>
  );
}
