"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface Pedido {
  folioPublico: string;
  statusPedido: string;
  total: string;
  guiaTracking: string | null;
}

function GraciasInner() {
  const sp = useSearchParams();
  const folio = sp.get("folio") ?? "";
  const email = sp.get("email") ?? "";
  const [pedido, setPedido] = useState<Pedido | null>(null);

  useEffect(() => {
    if (!folio || !email) return;
    fetch(`/api/seguimiento?folio=${folio}&email=${encodeURIComponent(email)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setPedido)
      .catch(() => {});
  }, [folio, email]);

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">
        ✓
      </div>
      <h1 className="font-bold text-3xl">¡Gracias por tu compra!</h1>
      <p className="mt-2 text-gray-600">
        Tu pedido <strong>{folio}</strong> fue confirmado.
        {email && (
          <>
            {" "}
            Te enviamos la confirmación a <strong>{email}</strong>.
          </>
        )}
      </p>

      <div className="mt-6 rounded-xl border bg-white p-5 text-left">
        <div className="flex items-center justify-between">
          <span className="font-bold">{folio}</span>
          {pedido && (
            <span className="rounded-full bg-marca/10 px-3 py-1 font-medium text-marca text-sm">
              Confirmado
            </span>
          )}
        </div>
        {pedido ? (
          <p className="mt-2 text-gray-600 text-sm">
            Total pagado: ${Number(pedido.total).toFixed(2)}
          </p>
        ) : (
          <p className="mt-2 text-gray-400 text-sm">Cargando resumen…</p>
        )}
        <p className="mt-3 text-gray-500 text-sm">
          Te avisaremos cuando preparemos y enviemos tu pedido. Puedes seguir su estado en cualquier
          momento.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href={`/seguimiento?folio=${folio}&email=${encodeURIComponent(email)}`}
          className="rounded-lg bg-marca px-5 py-2.5 font-semibold text-white hover:opacity-90"
        >
          Rastrear mi pedido
        </Link>
        <Link
          href="/cuenta"
          className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50"
        >
          Mi cuenta
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50"
        >
          Seguir comprando
        </Link>
      </div>
    </div>
  );
}

export default function GraciasPage() {
  return (
    <Suspense fallback={null}>
      <GraciasInner />
    </Suspense>
  );
}
