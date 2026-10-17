"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  type AccionPedido,
  confirmacionAccion,
  entradaAccion,
  errorAccion,
  esEstadoAccion,
  esObjetoAccion,
} from "./pedido-acciones-contract";
class FalloAccion extends Error {}
/** One write at a time. Uncertain writes require a verified GET before retry. */
export function useAccionPedido(folio: string, accion: AccionPedido) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiereConsulta, setRequiereConsulta] = useState(false);
  const [bloqueada, setBloqueada] = useState(false);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);
  const lock = useRef(false);
  const vivo = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      controller.current?.abort();
    };
  }, []);
  async function ejecutar(payload?: Record<string, unknown>) {
    const consulta = payload === undefined;
    if (lock.current || confirmacion || (!consulta && (requiereConsulta || bloqueada))) return;
    const body = consulta ? null : entradaAccion(accion, payload);
    if (!consulta && !body) {
      setError("Revisa el motivo y las cantidades antes de enviar.");
      return;
    }
    lock.current = true;
    setOcupado(true);
    setError(null);
    const request = new AbortController();
    controller.current = request;
    try {
      const resultado = await solicitarResultado(folio, accion, body, request.signal);
      if (!vivo.current || request.signal.aborted) return;
      const mensaje = resultado.confirmacion;
      if (consulta) {
        setRequiereConsulta(false);
        setBloqueada(resultado.bloqueada);
        if (resultado.bloqueada)
          setError(
            "El estado actual del pedido no permite esta operación. Revisa el detalle o contacta a la tienda.",
          );
      }
      if (mensaje) {
        setConfirmacion(mensaje);
        router.refresh();
      }
    } catch (err) {
      if (!vivo.current || request.signal.aborted) return;
      setRequiereConsulta(true);
      setError(err instanceof FalloAccion ? err.message : errorAccion(503));
    } finally {
      lock.current = false;
      if (vivo.current) setOcupado(false);
    }
  }
  return {
    ocupado,
    error,
    requiereConsulta,
    bloqueada,
    confirmacion,
    enviar: (body: Record<string, unknown>) => ejecutar(body),
    consultar: () => ejecutar(),
  };
}

async function solicitarResultado(
  folio: string,
  accion: AccionPedido,
  body: Record<string, unknown> | null,
  signal: AbortSignal,
) {
  const res = await fetch(`/api/cuenta/pedidos/${encodeURIComponent(folio)}/${accion}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    ...(body
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new FalloAccion(errorRespuesta(res.status, data));
  if (body) {
    const confirmacion = confirmacionAccion(accion, folio, data);
    if (!confirmacion) throw new FalloAccion(errorAccion(502));
    return { confirmacion, bloqueada: false };
  }
  if (!esEstadoAccion(data, folio)) throw new FalloAccion(errorAccion(502));
  return {
    confirmacion: data.confirmada ? data.detalle : null,
    bloqueada: !data.permitida && !data.confirmada,
  };
}
function errorRespuesta(status: number, data: unknown) {
  return status !== 401 &&
    status < 500 &&
    esObjetoAccion(data) &&
    typeof data.message === "string" &&
    data.message.length <= 500
    ? data.message
    : errorAccion(status);
}
