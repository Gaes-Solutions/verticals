"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { idRegistro, objetoRegistro } from "./producto-registro-contract";
/** Keep drafts hidden until the same account is verified; owner changes remount the form. */
export function usePropietarioPregunta(productoId: string) {
  const [owner, setOwner] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(true);
  const [error, setError] = useState(false);
  const current = useRef<AbortController | null>(null);
  const cargar = useCallback(async () => {
    current.current?.abort();
    const c = new AbortController();
    current.current = c;
    setVerificando(true);
    setError(false);
    try {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(20000)]);
      const res = await fetch(`/api/cuenta/productos/${encodeURIComponent(productoId)}/preguntas`, {
        cache: "no-store",
        signal,
      });
      const data: unknown = await res.json().catch(() => null);
      signal.throwIfAborted();
      if (current.current !== c) return;
      if (res.status === 401 || res.status === 403) {
        setOwner(null);
        return;
      }
      if (
        !res.ok ||
        !objetoRegistro(data) ||
        !idRegistro(data.clienteId) ||
        typeof data.tenantSlug !== "string" ||
        !data.tenantSlug
      )
        throw new Error();
      setOwner(data.clienteId);
    } catch {
      if (current.current === c && !c.signal.aborted) setError(true);
    } finally {
      if (current.current === c) {
        current.current = null;
        setVerificando(false);
      }
    }
  }, [productoId]);
  useEffect(() => {
    void cargar();
    const revisar = () => {
      if (document.visibilityState === "visible") void cargar();
    };
    const ocultar = () => {
      if (document.visibilityState !== "visible") {
        current.current?.abort();
        current.current = null;
        setVerificando(true);
      } else void cargar();
    };
    window.addEventListener("focus", revisar);
    document.addEventListener("visibilitychange", ocultar);
    return () => {
      current.current?.abort();
      current.current = null;
      window.removeEventListener("focus", revisar);
      document.removeEventListener("visibilitychange", ocultar);
    };
  }, [cargar]);
  return { owner, verificando, error, cargar };
}
