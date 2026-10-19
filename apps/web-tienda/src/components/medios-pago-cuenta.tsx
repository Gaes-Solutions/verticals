"use client";
import type { MedioPagoGuardado } from "@/lib/cliente";
import { errorTarjeta, listaTarjetas } from "@/lib/medios-pago-contract";
import { CreditCard, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DialogoTienda } from "./dialogo-tienda";
class ErrorTarjeta extends Error {
  constructor(readonly status: number) {
    super(errorTarjeta(status));
  }
}
async function leerTarjetas(signal: AbortSignal) {
  const res = await fetch("/api/cuenta/medios-pago", { cache: "no-store", signal });
  if (!res.ok) throw new ErrorTarjeta(res.status);
  const data: unknown = await res.json().catch(() => null);
  signal.throwIfAborted();
  if (!listaTarjetas(data)) throw new ErrorTarjeta(502);
  return data;
}
/** Saved-card metadata only. An uncertain delete must be reconciled before another write. */
export function MediosPagoCuenta() {
  const [medios, setMedios] = useState<MedioPagoGuardado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [debeActualizar, setDebeActualizar] = useState(false);
  const [selected, setSelected] = useState<MedioPagoGuardado | null>(null);
  const read = useRef<AbortController | null>(null);
  const write = useRef<AbortController | null>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const focusAfterWrite = useRef(false);
  useEffect(() => {
    if (!selected && focusAfterWrite.current) {
      focusAfterWrite.current = false;
      refreshButton.current?.focus();
    }
  }, [selected]);
  const reportarError = useCallback((e: unknown, c: AbortController) => {
    if (!c.signal.aborted) {
      setError(e instanceof ErrorTarjeta ? e.message : errorTarjeta(503));
      setDebeActualizar(true);
      if (e instanceof ErrorTarjeta && [401, 403].includes(e.status)) setMedios(null);
    }
  }, []);
  const finalizarLectura = useCallback((c: AbortController) => {
    if (read.current !== c) return;
    read.current = null;
    if (!c.signal.aborted) setLoading(false);
  }, []);
  const cargar = useCallback(
    async (parent?: AbortSignal) => {
      read.current?.abort();
      const c = new AbortController();
      read.current = c;
      setLoading(true);
      setError(null);
      const signal = AbortSignal.any([
        c.signal,
        AbortSignal.timeout(20000),
        ...(parent ? [parent] : []),
      ]);
      try {
        const data = await leerTarjetas(signal);
        signal.throwIfAborted();
        setMedios(data);
        setDebeActualizar(false);
        return data;
      } catch (e) {
        reportarError(e, c);
        return null;
      } finally {
        finalizarLectura(c);
      }
    },
    [reportarError, finalizarLectura],
  );
  useEffect(() => {
    void cargar();
    return () => {
      read.current?.abort();
      read.current = null;
      write.current?.abort();
      write.current = null;
    };
  }, [cargar]);
  function confirmarBorrado(actual: MedioPagoGuardado[] | null, card: MedioPagoGuardado) {
    if (actual && !actual.some((m) => m.id === card.id))
      setMensaje("Tarjeta eliminada de tu cuenta.");
    else if (actual) {
      setDebeActualizar(true);
      setError("La tarjeta sigue en la lista. Actualiza antes de continuar.");
    }
  }
  function finalizarEscritura(c: AbortController) {
    if (write.current !== c) return;
    write.current = null;
    setBusy(false);
    focusAfterWrite.current = true;
    setSelected(null);
  }
  async function eliminar() {
    if (!selected || write.current || read.current || debeActualizar) return;
    const card = selected;
    const c = new AbortController();
    write.current = c;
    setBusy(true);
    setError(null);
    setMensaje(null);
    setDebeActualizar(true);
    const signal = AbortSignal.any([c.signal, AbortSignal.timeout(20000)]);
    try {
      const res = await fetch(`/api/cuenta/medios-pago/${encodeURIComponent(card.id)}`, {
        method: "DELETE",
        cache: "no-store",
        signal,
      });
      signal.throwIfAborted();
      if (!res.ok) throw new ErrorTarjeta(res.status);
      if (res.status !== 204) throw new ErrorTarjeta(502);
      const actual = await cargar(signal);
      signal.throwIfAborted();
      confirmarBorrado(actual, card);
    } catch (e) {
      reportarError(e, c);
    } finally {
      finalizarEscritura(c);
    }
  }
  const blocked = busy || loading || debeActualizar;
  return (
    <section aria-labelledby="tarjetas-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="tarjetas-title" className="text-lg font-bold">
          Mis tarjetas
        </h2>
        <button
          ref={refreshButton}
          type="button"
          disabled={busy || loading}
          onClick={() => {
            if (!read.current && !write.current) void cargar();
          }}
          className="gx-btn-ghost min-h-11"
        >
          Actualizar tarjetas
        </button>
      </div>
      {loading && (
        <output className="mb-3 block text-sm text-slate-500">Cargando tus tarjetas…</output>
      )}
      {!loading && medios?.length === 0 && (
        <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
          No tienes tarjetas guardadas. Si la tienda lo permite, puedes guardar una al pagar.
        </p>
      )}
      {medios && medios.length > 0 && (
        <ul className="space-y-2">
          {medios.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm"
            >
              <CreditCard size={20} className="shrink-0 text-slate-500" />
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium capitalize">{m.marca}</p>
                <p className="text-xs text-slate-500">
                  •••• {m.last4} · exp {String(m.expMes).padStart(2, "0")}/{m.expAnio}
                </p>
              </div>
              <button
                type="button"
                disabled={blocked}
                onClick={() => setSelected(m)}
                aria-label={`Eliminar tarjeta ${m.marca} terminada en ${m.last4}`}
                className="gx-btn-ghost min-h-11 min-w-11 shrink-0 text-danger disabled:opacity-50"
              >
                <Trash2 size={18} />
                <span className="sr-only">Eliminar</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-light p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {debeActualizar && (
        <p className="mt-2 text-sm text-slate-500">
          Actualiza la lista para comprobar tus tarjetas antes de hacer otro cambio.
        </p>
      )}
      {mensaje && <output className="mt-3 block text-sm text-ok">{mensaje}</output>}
      <p className="mt-3 text-xs text-slate-500">
        Las tarjetas guardadas usan una referencia segura de Conekta. Aquí solo mostramos su marca,
        últimos cuatro dígitos y vencimiento.
      </p>
      {selected && (
        <DialogoTienda
          titulo="Eliminar tarjeta guardada"
          bloqueado={busy}
          onCerrar={() => setSelected(null)}
        >
          <p className="break-words text-sm">
            ¿Eliminar la tarjeta {selected.marca} terminada en {selected.last4} de tu cuenta? Esto
            no cancela tus pedidos.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(null)}
              className="gx-btn-secondary min-h-11"
            >
              Conservar tarjeta
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void eliminar()}
              className="gx-btn-primary min-h-11"
            >
              {busy ? "Eliminando…" : "Eliminar tarjeta"}
            </button>
          </div>
        </DialogoTienda>
      )}
    </section>
  );
}
