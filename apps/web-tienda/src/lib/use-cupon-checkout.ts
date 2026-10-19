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
async function consultarCupon(
  normalized: string,
  subtotal: string,
  signal: AbortSignal,
): Promise<CuponEvaluado> {
  const params = new URLSearchParams({ codigo: normalized, subtotal });
  const res = await fetch(`/api/cupon?${params}`, { cache: "no-store", signal });
  const data: unknown = await res.json().catch(() => null);
  signal.throwIfAborted();
  if (!res.ok) throw new ErrorConsultaCupon(res.status);
  if (!esCuponEvaluado(data, normalized, subtotal)) throw new ErrorConsultaCupon(502);
  return data;
}
function mensajeConsultaCupon(error: unknown): string {
  return error instanceof ErrorConsultaCupon ? error.message : errorCupon(503);
}
interface Context {
  owner: string;
  contexto: string;
  subtotal: string;
  habilitado: boolean;
}
export function useCuponCheckout({ owner, contexto, subtotal, habilitado }: Context) {
  const inputKey = JSON.stringify([owner, habilitado]);
  const [entrada, setEntrada] = useState({ contexto: inputKey, codigo: "" });
  const codigo = habilitado && entrada.contexto === inputKey ? entrada.codigo : "";
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
    lastKey.current = activeKey;
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
    setEntrada({ contexto: inputKey, codigo: "" });
    setResultado(null);
    setFallo(null);
  }, [inputKey, cancelar]);
  const info =
    habilitado && resultado?.contexto === activeKey && resultado.codigo === normalized
      ? resultado.info
      : null;
  const error = fallo?.contexto === activeKey && fallo.codigo === normalized ? fallo.mensaje : null;
  const validando = pending?.contexto === activeKey && pending.codigo === normalized;
  function cambiar(value: string) {
    cancelar();
    setEntrada({ contexto: inputKey, codigo: value.toUpperCase() });
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
    const vigente = () => !c.signal.aborted && current.current === c && lastKey.current === key;
    current.current = c;
    setPending({ contexto: key, codigo: normalized });
    try {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(15000)]);
      const data = await consultarCupon(normalized, subtotal, signal);
      signal.throwIfAborted();
      if (vigente()) setResultado({ contexto: key, codigo: normalized, info: data });
    } catch (e) {
      if (vigente())
        setFallo({
          contexto: key,
          codigo: normalized,
          mensaje: mensajeConsultaCupon(e),
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
