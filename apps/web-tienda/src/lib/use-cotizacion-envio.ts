"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CotizacionEnvio,
  destinoEnvioValido,
  errorCotizacion,
  leerCotizacionEnvio,
  subtotalEnvioValido,
} from "./envios-contract";
class ErrorCotizacion extends Error {
  constructor(status: number) {
    super(errorCotizacion(status));
  }
}
/** A quote belongs to the exact destination and amount submitted, never a later edit. */
export function useCotizacionEnvio(subtotal: number) {
  const [cp, setCp] = useState("");
  const [estado, setEstado] = useState("");
  const key = JSON.stringify([cp, estado.trim(), subtotal]);
  const [resultado, setResultado] = useState<{ key: string; cot: CotizacionEnvio } | null>(null);
  const [fallo, setFallo] = useState<{ key: string; mensaje: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const current = useRef<AbortController | null>(null);
  const cancelar = useCallback(() => {
    current.current?.abort();
    current.current = null;
    setPending(null);
    setResultado(null);
    setFallo(null);
  }, []);
  useEffect(() => {
    cancelar();
    return () => {
      current.current?.abort();
      current.current = null;
    };
  }, [key, cancelar]);
  function cambiarCp(value: string) {
    cancelar();
    setCp(value.replace(/\D/g, "").slice(0, 5));
  }
  function cambiarEstado(value: string) {
    cancelar();
    setEstado(value);
  }
  async function cotizar() {
    if (current.current) return;
    setResultado(null);
    setFallo(null);
    if (!subtotalEnvioValido(String(subtotal))) {
      setFallo({
        key,
        mensaje: "Selecciona una cantidad y un precio válidos para calcular el envío.",
      });
      return;
    }
    if (!destinoEnvioValido(cp, estado.trim())) {
      setFallo({ key, mensaje: errorCotizacion(400) });
      return;
    }
    const controller = new AbortController();
    current.current = controller;
    setPending(key);
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
      const params = new URLSearchParams({ cp, subtotal: String(subtotal) });
      if (estado.trim()) params.set("estado", estado.trim());
      const res = await fetch(`/api/envios?${params}`, { signal, cache: "no-store" });
      const data: unknown = await res.json().catch(() => null);
      signal.throwIfAborted();
      if (!res.ok) throw new ErrorCotizacion(res.status);
      const cot = leerCotizacionEnvio(data);
      if (!cot) throw new ErrorCotizacion(502);
      if (current.current === controller) setResultado({ key, cot });
    } catch (e) {
      if (current.current === controller && !controller.signal.aborted)
        setFallo({ key, mensaje: e instanceof ErrorCotizacion ? e.message : errorCotizacion(503) });
    } finally {
      if (current.current === controller) {
        current.current = null;
        setPending(null);
      }
    }
  }
  return {
    cp,
    estado,
    cambiarCp,
    cambiarEstado,
    cotizar,
    opciones: resultado?.key === key ? resultado.cot.opcionesEnvio : null,
    error: fallo?.key === key ? fallo.mensaje : null,
    cargando: pending === key,
  };
}
