"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface Pedido {
  folioPublico: string;
  statusPedido: string;
  total: string;
  guiaTracking: string | null;
}

function GraciasInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const folio = sp.get("folio") ?? "";
  const email = sp.get("email") ?? "";
  const [pedido, setPedido] = useState<Pedido | null>(null);

  // Sin folio no hay nada que confirmar: mejor el catálogo o el rastreo manual.
  useEffect(() => {
    if (!folio) router.replace("/");
  }, [folio, router]);

  useEffect(() => {
    if (!folio || !email) return;
    fetch(`/api/seguimiento?folio=${folio}&email=${encodeURIComponent(email)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setPedido)
      .catch(() => {});
  }, [folio, email]);

  if (!folio) return null;

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-ok-light text-ok">
        <Check size={40} strokeWidth={3} />
      </div>
      <h1 className="font-bold text-3xl">¡Gracias por tu compra!</h1>
      <p className="mt-2 text-slate-600">
        Tu pedido <strong>{folio}</strong> fue confirmado.
        {email && (
          <>
            {" "}
            Te enviamos la confirmación a <strong>{email}</strong>.
          </>
        )}
      </p>

      <div className="gx-card mt-6 text-left">
        <div className="flex items-center justify-between">
          <span className="font-bold">{folio}</span>
          {pedido && <span className="gx-badge-ok">Confirmado</span>}
        </div>
        {pedido ? (
          <p className="mt-2 text-slate-600 text-sm">
            Total pagado: ${Number(pedido.total).toFixed(2)}
          </p>
        ) : (
          <p className="mt-2 text-slate-400 text-sm">Cargando resumen…</p>
        )}
        <p className="mt-3 text-slate-500 text-sm">
          Te avisaremos cuando preparemos y enviemos tu pedido. Puedes seguir su estado en cualquier
          momento.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href={`/seguimiento?folio=${folio}&email=${encodeURIComponent(email)}`}
          className="gx-btn-primary"
        >
          Rastrear mi pedido
        </Link>
        <Link href="/cuenta" className="gx-btn-secondary">
          Mi cuenta
        </Link>
        <Link href="/" className="gx-btn-secondary">
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
