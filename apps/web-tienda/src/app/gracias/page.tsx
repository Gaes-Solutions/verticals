"use client";

import { type PedidoSeguimiento, etiquetaPedido } from "@/lib/seguimiento-contract";
import { useConsultaPedido } from "@/lib/use-consulta-pedido";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function GraciasInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const folio = sp.get("folio") ?? "";
  const email = sp.get("email") ?? "";
  const { resultado, consultar, cancelar } = useConsultaPedido();
  const coincide = resultado.folio === folio.trim() && resultado.email === email.trim();
  const pedido = coincide ? resultado.pedido : null;
  const error = coincide ? resultado.error : null;
  const buscando = !coincide || resultado.buscando;

  useEffect(() => {
    if (!folio) router.replace("/");
  }, [folio, router]);
  useEffect(() => {
    if (folio) void consultar(folio, email);
    return cancelar;
  }, [folio, email, consultar, cancelar]);

  if (!folio) return null;
  const cancelado = pedido?.statusPedido === "cancelado";
  const titulo = tituloGracias(pedido, buscando);
  const Icono = buscando ? LoaderCircle : pedido && !cancelado ? Check : CircleAlert;
  const seguimiento = `/seguimiento?${new URLSearchParams({ folio: pedido?.folioPublico ?? folio, email })}`;

  return (
    <div className="mx-auto max-w-lg text-center" aria-busy={buscando}>
      <div
        className={`mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full ${pedido && !cancelado ? "bg-ok-light text-ok" : "bg-slate-100 text-slate-500"}`}
      >
        <Icono
          size={40}
          strokeWidth={3}
          aria-hidden="true"
          className={buscando ? "animate-spin" : undefined}
        />
      </div>
      <h1 className="font-bold text-3xl">{titulo}</h1>
      <ResultadoGracias
        pedido={pedido}
        buscando={buscando}
        error={error}
        email={email}
        reintentar={() => void consultar(folio, email)}
      />
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href={seguimiento} className="gx-btn-primary min-h-11">
          Rastrear mi pedido
        </Link>
        <Link href="/cuenta" className="gx-btn-secondary min-h-11">
          Mi cuenta
        </Link>
        <Link href="/" className="gx-btn-secondary min-h-11">
          Seguir comprando
        </Link>
      </div>
    </div>
  );
}
export default function GraciasPage() {
  return (
    <Suspense fallback={<p>Consultando pedido…</p>}>
      <GraciasInner />
    </Suspense>
  );
}

function tituloGracias(pedido: PedidoSeguimiento | null, buscando: boolean) {
  const cancelado = pedido?.statusPedido === "cancelado";
  const recogida = pedido?.metodoEnvio === "click_collect";
  return !pedido
    ? buscando
      ? "Verificando tu pedido"
      : "Consulta tu pedido"
    : cancelado
      ? "Tu pedido fue cancelado"
      : recogida
        ? "Tu pedido quedó registrado"
        : "¡Gracias por tu compra!";
}

function ResultadoGracias({
  pedido,
  buscando,
  error,
  email,
  reintentar,
}: {
  pedido: PedidoSeguimiento | null;
  buscando: boolean;
  error: string | null;
  email: string;
  reintentar: () => void;
}) {
  const cancelado = pedido?.statusPedido === "cancelado";
  const recogida = pedido?.metodoEnvio === "click_collect";
  return (
    <>
      {pedido ? (
        <>
          <p className="mt-2 break-words text-slate-600">
            Tu folio es <strong>{pedido.folioPublico}</strong>. Consulta aquí el estado de tu
            pedido.
          </p>
          <div className="gx-card mt-6 text-left">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="min-w-0 break-all font-bold">{pedido.folioPublico}</span>
              <span
                className={`${cancelado ? "gx-badge-danger" : "gx-badge-info"} min-w-0 max-w-full break-words whitespace-normal`}
              >
                {etiquetaPedido(pedido)}
              </span>
            </div>
            <p className="mt-2 text-slate-600 text-sm">
              Total del pedido: ${Number(pedido.total).toFixed(2)}
            </p>
            <p className="mt-3 text-slate-500 text-sm">
              {recogida && pedido.statusPedido === "recibido"
                ? "No se realizó ningún cobro en línea. Paga tu pedido cuando lo recojas en la tienda."
                : "Consulta los próximos pasos y las actualizaciones de tu pedido en el seguimiento."}
            </p>
          </div>
        </>
      ) : buscando ? (
        <output className="mt-6 block text-slate-500">Consultando el estado de tu pedido…</output>
      ) : (
        <div className="gx-card mt-6">
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
          {email.trim() && (
            <button type="button" onClick={reintentar} className="gx-btn-primary mt-4 min-h-12">
              Reintentar consulta
            </button>
          )}
          <p className="mt-3 text-slate-500 text-sm">
            Puedes consultar de nuevo con el folio y el correo de compra. No necesitas repetir tu
            pedido.
          </p>
        </div>
      )}
    </>
  );
}
