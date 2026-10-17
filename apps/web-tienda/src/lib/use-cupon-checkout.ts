"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CuponEvaluado,
  codigoCuponValido,
  errorCupon,
  esCuponEvaluado,
  normalizarCupon,
} from "./cupon-contract";
class ErrorConsultaCupon extends Error {
  constructor(status: number) {
    super(errorCupon(status));
  }
}
interface Context {
  owner: string;
  contexto: string;
  subtotal: string;
  habilitado: boolean;
}
export function useCuponCheckout({ owner, contexto, subtotal, habilitado }: Context) {
  const [entrada, setEntrada] = useState({ owner, codigo: "" });
  const codigo = habilitado && entrada.owner === owner ? entrada.codigo : "";
  const [resultado, setResultado] = useState<{
    contexto: string;
    codigo: string;
    info: CuponEvaluado;
  } | null>(null);
  const [fallo, setFallo] = useState<{ contexto: string; codigo: string; mensaje: string } | null>(
    null,
  );
  const [pending, setPending] = useState<{ contexto: string; codigo: string } | null>(null);
  const current = useRef<AbortController | null>(null);
  const normalized = normalizarCupon(codigo);
  const activeKey = JSON.stringify([owner, contexto, subtotal, habilitado]);
  const lastKey = useRef(activeKey);
  const cancelar = useCallback(() => {
    current.current?.abort();
    current.current = null;
    setPending(null);
  }, []);
  useEffect(() => {
    cancelar();
    setResultado(null);
    setFallo(null);
    return () => {
      current.current?.abort();
      current.current = null;
    };
  }, [activeKey, cancelar]);
  useEffect(() => {
    cancelar();
    setEntrada({ owner, codigo: "" });
    setResultado(null);
    setFallo(null);
  }, [owner, habilitado, cancelar]);
  useEffect(() => {
    lastKey.current = activeKey;
  }, [activeKey]);
  const info =
    habilitado && resultado?.contexto === activeKey && resultado.codigo === normalized
      ? resultado.info
      : null;
  const error = fallo?.contexto === activeKey && fallo.codigo === normalized ? fallo.mensaje : null;
  const validando = pending?.contexto === activeKey && pending.codigo === normalized;
  function cambiar(value: string) {
    cancelar();
    setEntrada({ owner, codigo: value.toUpperCase() });
    setResultado(null);
    setFallo(null);
  }
  function quitar() {
    cambiar("");
  }
  async function aplicar() {
    if (current.current || !habilitado || !normalized) return;
    const key = activeKey;
    setResultado(null);
    setFallo(null);
    if (!codigoCuponValido(normalized)) {
      setFallo({ contexto: key, codigo: normalized, mensaje: errorCupon(400) });
      return;
    }
    const c = new AbortController();
    current.current = c;
    setPending({ contexto: key, codigo: normalized });
    try {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(15000)]);
      const params = new URLSearchParams({ codigo: normalized, subtotal });
      const res = await fetch(`/api/cupon?${params}`, { cache: "no-store", signal });
      const data: unknown = await res.json().catch(() => null);
      signal.throwIfAborted();
      if (!res.ok) throw new ErrorConsultaCupon(res.status);
      if (!esCuponEvaluado(data, normalized, subtotal)) throw new ErrorConsultaCupon(502);
      if (current.current === c && lastKey.current === key)
        setResultado({ contexto: key, codigo: normalized, info: data });
    } catch (e) {
      if (!c.signal.aborted && current.current === c && lastKey.current === key)
        setFallo({
          contexto: key,
          codigo: normalized,
          mensaje: e instanceof ErrorConsultaCupon ? e.message : errorCupon(503),
        });
    } finally {
      if (current.current === c) {
        current.current = null;
        setPending(null);
      }
    }
  }
  return {
    codigo,
    cambiar,
    quitar,
    aplicar,
    info,
    error,
    validando,
    bloquea: habilitado && !!normalized && (!info?.valido || !!validando),
    codigoAplicado: info?.valido ? normalized : null,
  };
}
