"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorPreferencia } from "./preferencias-contract";
export class ErrorPreferencia extends Error {
  constructor(readonly status: number) {
    super(errorPreferencia(status));
  }
}
export async function fetchPreferencia(path: string, signal: AbortSignal, init: RequestInit = {}) {
  const res = await fetch(path, { ...init, cache: "no-store", signal });
  if (!res.ok) throw new ErrorPreferencia(res.status);
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  signal.throwIfAborted();
  return { status: res.status, data };
}
/** One active operation, bounded through response-body reading and cleaned on unmount. */
export function useSolicitudCuenta() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const vivo = useRef(false);
  const lock = useRef(false);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      controller.current?.abort();
      lock.current = false;
    };
  }, []);
  const ejecutar = useCallback(
    async (tarea: (signal: AbortSignal) => Promise<void>, alFallar?: (error: unknown) => void) => {
      if (lock.current) return;
      lock.current = true;
      setOcupado(true);
      setError(null);
      const c = new AbortController();
      controller.current = c;
      try {
        await tarea(AbortSignal.any([c.signal, AbortSignal.timeout(20000)]));
      } catch (e) {
        if (vivo.current && !c.signal.aborted) {
          setError(e instanceof ErrorPreferencia ? e.message : errorPreferencia(503));
          alFallar?.(e);
        }
      } finally {
        if (controller.current === c) {
          lock.current = false;
          if (vivo.current) setOcupado(false);
        }
      }
    },
    [],
  );
  return { ocupado, error, ejecutar };
}
