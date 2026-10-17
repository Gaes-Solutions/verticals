"use client";
import { useEffect, useRef, useState } from "react";
import { type CarritoLineaLocal, guardarCarrito, leerCarrito } from "./carrito-store";
import {
  ERROR_VERIFICAR,
  type LineaVerificada,
  leerVerificacionCarrito,
  seleccionCarritoValida,
} from "./verificar-carrito-contract";

type Resultado = { key: string; lineas: LineaVerificada[]; fecha: number; generacion: number };
/** A live read belongs to the exact local snapshot and cart context it inspected. */
export function useCarritoVerificado(items: CarritoLineaLocal[]) {
  const source = JSON.stringify(items);
  const [revision, setRevision] = useState(0);
  const key = `${revision}:${source}`;
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<{ key: string; mensaje: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generacion = useRef(0);
  const continuando = useRef(false);
  const revalidar = () => {
    generacion.current++;
    controller.current?.abort();
    setRevision((n) => n + 1);
  };
  useEffect(() => {
    const refresh = () => {
      generacion.current++;
      controller.current?.abort();
      setRevision((n) => n + 1);
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("carrito-contexto-cambiado", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("carrito-contexto-cambiado", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    const cancel = new AbortController();
    controller.current = cancel;
    setResultado(null);
    setError(null);
    continuando.current = false;
    const seleccion = JSON.parse(source) as CarritoLineaLocal[];
    const items = seleccion.map(({ varianteId, cantidad }) => ({ varianteId, cantidad }));
    const generation = generacion.current;
    const cargar = async () => {
      if (!seleccionCarritoValida(items)) {
        if (seleccion.length)
          setError({ key, mensaje: "Revisa los productos y sus cantidades antes de continuar." });
        return;
      }
      try {
        const signal = AbortSignal.any([cancel.signal, AbortSignal.timeout(20000)]);
        const res = await fetch("/api/carrito/verificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
          cache: "no-store",
          redirect: "error",
          signal,
        });
        const data = await res.json();
        signal.throwIfAborted();
        const lineas = res.ok ? leerVerificacionCarrito(data, items) : null;
        if (!lineas) throw new Error(ERROR_VERIFICAR);
        if (controller.current === cancel && !cancel.signal.aborted)
          setResultado({ key, lineas, fecha: Date.now(), generacion: generation });
      } catch {
        if (controller.current === cancel && !cancel.signal.aborted)
          setError({ key, mensaje: ERROR_VERIFICAR });
      }
    };
    const timer = setTimeout(() => void cargar(), 300);
    return () => {
      clearTimeout(timer);
      cancel.abort();
      if (controller.current === cancel) controller.current = null;
    };
  }, [source, key]);
  const actual = resultado?.key === key ? resultado : null;
  const fallo = error?.key === key ? error.mensaje : null;
  const listo = !!actual && actual.lineas.every((l) => l.estado === "publicado");
  function prepararCompra(): boolean {
    if (continuando.current || !listo || !actual) return false;
    try {
      if (
        JSON.stringify(leerCarrito()) !== source ||
        actual.generacion !== generacion.current ||
        Date.now() - actual.fecha > 60000
      ) {
        window.dispatchEvent(new Event("carrito-actualizado"));
        revalidar();
        return false;
      }
      continuando.current = true;
      const precios = new Map(actual.lineas.map((l) => [l.varianteId, l.precio]));
      const updated = items.map((i) => ({ ...i, precio: precios.get(i.varianteId) ?? i.precio }));
      if (JSON.stringify(updated) !== source) guardarCarrito(updated);
      return true;
    } catch {
      continuando.current = false;
      setError({
        key,
        mensaje: "No pudimos guardar los precios. Revisa tu carrito antes de continuar.",
      });
      return false;
    }
  }
  return {
    lineas: actual?.lineas ?? null,
    error: fallo,
    cargando: items.length > 0 && !actual && !fallo,
    listo: listo && !fallo,
    revalidar,
    prepararCompra,
  };
}
