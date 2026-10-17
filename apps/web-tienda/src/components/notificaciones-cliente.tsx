"use client";
import {
  type HistorialNotificaciones,
  enlaceNotificacion,
  errorNotificacion,
  esHistorialNotificaciones,
  esLecturaNotificacion,
  esLecturaTodas,
} from "@/lib/notificaciones-contract";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DialogoTienda } from "./dialogo-tienda";
class FalloNotificacion extends Error {
  constructor(readonly status: number) {
    super(errorNotificacion(status));
  }
}
async function obtenerHistorial(signal: AbortSignal): Promise<HistorialNotificaciones> {
  const res = await fetch("/api/cuenta/notificaciones", { cache: "no-store", signal });
  if (!res.ok) throw new FalloNotificacion(res.status);
  const data: unknown = await res.json();
  if (!esHistorialNotificaciones(data)) throw new FalloNotificacion(502);
  signal.throwIfAborted();
  return data;
}
/** Counts change only after a verified snapshot, including after mark-as-read. */
export function NotificacionesCliente() {
  const [historial, setHistorial] = useState<HistorialNotificaciones | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<"cargando" | "marcando" | null>("cargando");
  const [valido, setValido] = useState(false);
  const [incierto, setIncierto] = useState(false);
  const [conSesion, setConSesion] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const control = useRef<AbortController | null>(null);
  const vivo = useRef(false);
  const escribiendo = useRef(false);
  const actualizarButton = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);
  const activo = useCallback(
    (c: AbortController) => vivo.current && control.current === c && !c.signal.aborted,
    [],
  );
  const aplicar = useCallback((data: HistorialNotificaciones) => {
    setHistorial(data);
    setValido(true);
    setIncierto(false);
    setConSesion(true);
    setError(null);
  }, []);
  const fallar = useCallback((e: unknown) => {
    setValido(false);
    setIncierto(true);
    setError(e instanceof FalloNotificacion ? e.message : errorNotificacion(503));
    if (e instanceof FalloNotificacion && [401, 403].includes(e.status)) {
      setHistorial(null);
      setConSesion(false);
    }
  }, []);
  const cargar = useCallback(async () => {
    if (escribiendo.current) return;
    control.current?.abort();
    const c = new AbortController();
    control.current = c;
    setOcupado("cargando");
    try {
      const data = await obtenerHistorial(AbortSignal.any([c.signal, AbortSignal.timeout(20000)]));
      if (activo(c)) aplicar(data);
    } catch (e) {
      if (activo(c)) fallar(e);
    } finally {
      if (activo(c)) setOcupado(null);
    }
  }, [activo, aplicar, fallar]);
  useEffect(() => {
    vivo.current = true;
    void cargar();
    const refrescar = () => {
      if (document.visibilityState === "visible") void cargar();
    };
    const timer = window.setInterval(refrescar, 45000);
    window.addEventListener("online", refrescar);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      vivo.current = false;
      control.current?.abort();
      escribiendo.current = false;
      window.clearInterval(timer);
      window.removeEventListener("online", refrescar);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [cargar]);
  useEffect(() => {
    if (!conSesion) return;
    const es = new EventSource("/api/cuenta/realtime");
    es.onmessage = () => {
      void cargar();
    };
    return () => es.close();
  }, [cargar, conSesion]);
  async function marcar(id?: string) {
    if (escribiendo.current || !valido || incierto || !historial?.noLeidas) return;
    if (id && !historial.items.some((n) => n.id === id && !n.leida)) return;
    escribiendo.current = true;
    control.current?.abort();
    const c = new AbortController();
    control.current = c;
    setOcupado("marcando");
    setError(null);
    const signal = AbortSignal.any([c.signal, AbortSignal.timeout(20000)]);
    try {
      const res = await fetch(
        `/api/cuenta/notificaciones/${id ? `${encodeURIComponent(id)}/leer` : "leer-todas"}`,
        { method: "POST", cache: "no-store", signal },
      );
      if (!res.ok) throw new FalloNotificacion(res.status);
      const data: unknown = await res.json().catch(() => null);
      if (!(id ? esLecturaNotificacion(data) : esLecturaTodas(data)))
        throw new FalloNotificacion(502);
      // ok:false can mean already read or unavailable. Always reconcile, never decrement blindly.
      const actual = await obtenerHistorial(signal);
      if (activo(c)) aplicar(actual);
    } catch (e) {
      if (activo(c)) fallar(e);
    } finally {
      escribiendo.current = false;
      if (activo(c)) {
        devolverFoco.current = true;
        setOcupado(null);
      }
    }
  }
  useEffect(() => {
    if (!ocupado && abierto && devolverFoco.current) {
      devolverFoco.current = false;
      actualizarButton.current?.focus();
    }
  }, [ocupado, abierto]);
  const noLeidas = historial?.noLeidas ?? 0;
  const bloquear = !!ocupado || !valido || incierto;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={noLeidas ? `Notificaciones, ${noLeidas} sin leer` : "Notificaciones"}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
      >
        <Bell size={20} strokeWidth={1.75} />
        {noLeidas > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white"
          >
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>
      {abierto && (
        <DialogoTienda
          titulo="Notificaciones"
          onCerrar={() => setAbierto(false)}
          className="open:flex open:flex-col open:overflow-hidden"
        >
          <div aria-busy={!!ocupado} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                {historial ? `${noLeidas} sin leer` : "Consulta tus avisos de la tienda."}
              </p>
              <button
                type="button"
                ref={actualizarButton}
                onClick={() => void cargar()}
                disabled={!!ocupado}
                className="gx-btn-secondary min-h-11"
              >
                Actualizar avisos
              </button>
            </div>
            {ocupado && (
              <output className="mb-2 block text-sm text-slate-600">
                {ocupado === "marcando" ? "Guardando y actualizando…" : "Cargando notificaciones…"}
              </output>
            )}
            {error && (
              <p role="alert" className="mb-3 text-sm text-danger">
                {error}
              </p>
            )}
            {!conSesion && (
              <Link href="/cuenta/login" className="gx-btn-secondary mb-3 min-h-11">
                Iniciar sesión
              </Link>
            )}
            {historial && historial.noLeidas > 0 && (
              <button
                type="button"
                onClick={() => void marcar()}
                disabled={bloquear}
                className="gx-btn-secondary mb-3 min-h-11 w-full shrink-0"
              >
                Marcar todas como leídas
              </button>
            )}
            {valido && historial?.items.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">Sin notificaciones</p>
            )}
            <ul
              aria-label="Avisos recientes"
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain"
            >
              {historial?.items.map((n) => {
                const href = enlaceNotificacion(n.link);
                return (
                  <li
                    key={n.id}
                    className={`rounded-xl border p-3 ${n.leida ? "bg-white" : "bg-marca/5"}`}
                  >
                    <p className="break-words text-sm font-semibold text-slate-800">{n.titulo}</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-600">
                      {n.cuerpo}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(n.createdAt).toLocaleString("es-MX")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {href && (
                        <Link href={href} className="gx-btn-secondary min-h-11">
                          Ver detalle<span className="sr-only"> de {n.titulo}</span>
                        </Link>
                      )}
                      {n.leida ? (
                        <span className="text-xs text-slate-500">Leída</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void marcar(n.id)}
                          disabled={bloquear}
                          aria-label={`Marcar como leída: ${n.titulo}`}
                          className="gx-btn-ghost min-h-11 text-marca"
                        >
                          Marcar leída
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {!!historial?.items.length && (
              <p className="mt-3 shrink-0 text-xs text-slate-500">
                Se muestran los avisos más recientes.
              </p>
            )}
          </div>
        </DialogoTienda>
      )}
    </>
  );
}
