"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PedidoSeguimiento,
  esPedidoSeguimiento,
  mensajeConsultaPedido,
} from "./seguimiento-contract";

interface Resultado {
  folio: string;
  email: string;
  pedido: PedidoSeguimiento | null;
  error: string | null;
  buscando: boolean;
}
const EMPTY: Resultado = { folio: "", email: "", pedido: null, error: null, buscando: false };

/** One active read; edits and unmounts invalidate every older response. */
export function useConsultaPedido() {
  const actual = useRef<AbortController | null>(null);
  const [resultado, setResultado] = useState<Resultado>(EMPTY);
  const cancelar = useCallback(() => {
    actual.current?.abort();
    actual.current = null;
    setResultado(EMPTY);
  }, []);
  useEffect(
    () => () => {
      actual.current?.abort();
      actual.current = null;
    },
    [],
  );

  const consultar = useCallback(async (folioInput: string, emailInput: string) => {
    if (actual.current) return;
    const folio = folioInput.trim();
    const email = emailInput.trim();
    const initial = { ...EMPTY, folio, email };
    if (!folio || !email) {
      setResultado({ ...initial, error: mensajeConsultaPedido(400) });
      return;
    }
    const controller = new AbortController();
    actual.current = controller;
    setResultado({ ...initial, buscando: true });
    try {
      const response = await fetch(`/api/seguimiento?${new URLSearchParams({ folio, email })}`, {
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setResultado({ ...initial, error: mensajeConsultaPedido(response.status) });
        return;
      }
      const data: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (!esPedidoSeguimiento(data, folio)) throw new Error("invalid order response");
      setResultado({ ...initial, pedido: data });
    } catch {
      if (!controller.signal.aborted)
        setResultado({ ...initial, error: mensajeConsultaPedido(503) });
    } finally {
      if (actual.current === controller) actual.current = null;
    }
  }, []);
  return { resultado, consultar, cancelar };
}
