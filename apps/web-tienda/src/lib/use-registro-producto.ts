"use client";
import { useEffect, useRef, useState } from "react";
import { errorRegistro, objetoRegistro } from "./producto-registro-contract";
export class ErrorRegistroProducto extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(errorRegistro(status));
  }
}
/** One explicit write at a time, confirmed receipt, no automatic retry or draft persistence. */
export function useRegistroProducto() {
  const [listo, setListo] = useState(false);
  const [fase, setFase] = useState<"idle" | "enviando" | "enviado" | "incierto">("idle");
  const [error, setError] = useState<string | null>(null);
  const current = useRef<AbortController | null>(null);
  useEffect(() => {
    setListo(true);
    return () => {
      current.current?.abort();
      current.current = null;
    };
  }, []);
  async function enviar(
    path: string,
    body: unknown,
    validar: (value: unknown) => boolean,
    alFallar?: (e: ErrorRegistroProducto) => void,
  ) {
    if (!listo || current.current || fase === "enviado") return false;
    const c = new AbortController();
    current.current = c;
    setFase("enviando");
    setError(null);
    try {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(20000)]);
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
        cache: "no-store",
      });
      const data: unknown = await res.json().catch(() => null);
      signal.throwIfAborted();
      if (!res.ok)
        throw new ErrorRegistroProducto(
          res.status,
          objetoRegistro(data) && typeof data.code === "string" ? data.code : undefined,
        );
      if (!validar(data)) throw new ErrorRegistroProducto(502);
      if (current.current !== c || c.signal.aborted) return false;
      setFase("enviado");
      return true;
    } catch (e) {
      if (current.current === c && !c.signal.aborted) {
        const failure = e instanceof ErrorRegistroProducto ? e : new ErrorRegistroProducto(503);
        setError(failure.message);
        setFase([400, 401, 403, 404, 409, 422, 429].includes(failure.status) ? "idle" : "incierto");
        alFallar?.(failure);
      }
      return false;
    } finally {
      if (current.current === c) current.current = null;
    }
  }
  return {
    listo,
    fase,
    error,
    enviar,
    limpiar: () => {
      if (!current.current) {
        setError(null);
        setFase("idle");
      }
    },
  };
}
