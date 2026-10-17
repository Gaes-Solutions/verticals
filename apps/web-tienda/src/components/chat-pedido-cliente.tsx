"use client";

import {
  type MensajePedido,
  esHistorialMensajes,
  esMensajePedido,
  mensajeChatError,
} from "@/lib/mensajes-contract";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

class ChatFailure extends Error {
  constructor(readonly status: number) {
    super(mensajeChatError(status));
  }
}

/** A separate thread instance prevents drafts or late responses crossing orders. */
export function ChatPedidoCliente({ folio }: { folio: string }) {
  return <HiloPedido key={folio} folio={folio} />;
}
function HiloPedido({ folio }: { folio: string }) {
  const [mensajes, setMensajes] = useState<MensajePedido[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [listo, setListo] = useState(false);
  const [incierto, setIncierto] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const vivo = useRef(false);
  const escribiendo = useRef(false);
  const lectura = useRef<AbortController | null>(null);
  const escritura = useRef<AbortController | null>(null);
  const endpoint = `/api/cuenta/pedidos/${encodeURIComponent(folio)}/mensajes`;

  const cargar = useCallback(
    async (manual = false) => {
      if (escribiendo.current) return;
      lectura.current?.abort();
      const controller = new AbortController();
      lectura.current = controller;
      setCargando(true);
      try {
        const res = await fetch(endpoint, {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        });
        if (!res.ok) throw new ChatFailure(res.status);
        const data: unknown = await res.json();
        if (!esHistorialMensajes(data))
          throw new Error("No pudimos cargar los mensajes. Vuelve a actualizar.");
        if (!vivo.current || controller.signal.aborted) return;
        setMensajes(data);
        setListo(true);
        setErrorCarga(null);
        if (manual) {
          setIncierto(false);
          setErrorEnvio(null);
        }
      } catch (error) {
        if (!vivo.current || controller.signal.aborted) return;
        setListo(false);
        if (error instanceof ChatFailure && [401, 403, 404].includes(error.status)) setMensajes([]);
        setErrorCarga(
          error instanceof ChatFailure && [401, 403, 404, 429].includes(error.status)
            ? error.message
            : "No pudimos cargar los mensajes. Revisa tu conexión y vuelve a actualizar.",
        );
      } finally {
        if (vivo.current && lectura.current === controller) setCargando(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    vivo.current = true;
    void cargar();
    const es = new EventSource("/api/cuenta/realtime");
    es.onmessage = () => {
      void cargar();
    };
    const actualizar = () => {
      if (document.visibilityState === "visible") void cargar();
    };
    window.addEventListener("online", actualizar);
    document.addEventListener("visibilitychange", actualizar);
    // A bounded fallback also works when a proxy drops SSE notifications.
    const timer = window.setInterval(actualizar, 30_000);
    return () => {
      vivo.current = false;
      lectura.current?.abort();
      escritura.current?.abort();
      es.close();
      window.clearInterval(timer);
      window.removeEventListener("online", actualizar);
      document.removeEventListener("visibilitychange", actualizar);
    };
  }, [cargar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const borrador = texto;
    const cuerpo = borrador.trim();
    if (!cuerpo || cuerpo.length > 2000 || escribiendo.current || !listo || incierto) return;
    escribiendo.current = true;
    lectura.current?.abort();
    setCargando(false);
    const controller = new AbortController();
    escritura.current = controller;
    setEnviando(true);
    setErrorEnvio(null);
    setConfirmacion("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuerpo }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      });
      if (!res.ok) throw new ChatFailure(res.status);
      const data: unknown = await res.json();
      if (!esMensajePedido(data) || data.autorTipo !== "cliente" || data.cuerpo !== cuerpo)
        throw new ChatFailure(502);
      if (!vivo.current || controller.signal.aborted) return;
      setMensajes((prev) => [...prev.filter((m) => m.id !== data.id), data]);
      setTexto((actual) => (actual === borrador ? "" : actual));
      setConfirmacion("Mensaje enviado.");
    } catch (error) {
      if (!vivo.current || controller.signal.aborted) return;
      setIncierto(true);
      if (error instanceof ChatFailure && [401, 403, 404].includes(error.status)) {
        setMensajes([]);
        setListo(false);
      }
      setErrorEnvio(error instanceof ChatFailure ? error.message : mensajeChatError(503));
    } finally {
      escribiendo.current = false;
      if (vivo.current) setEnviando(false);
    }
  }

  return (
    <section aria-label="Mensajes con la tienda">
      <h2 className="mb-2 font-bold text-lg">Mensajes con la tienda</h2>
      <div className="gx-card !p-4">
        <div className="mb-3 max-h-60 space-y-2 overflow-y-auto" aria-busy={cargando}>
          {mensajes.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.autorTipo === "cliente" ? "ml-auto bg-marca/10 text-slate-800" : "bg-slate-100 text-slate-700"}`}
            >
              <p className="whitespace-pre-wrap break-words">{m.cuerpo}</p>
              <p className="mt-0.5 break-words text-[11px] text-slate-500">
                {m.autorTipo === "cliente" ? "Tú" : (m.usuario?.nombre ?? "Tienda")} ·{" "}
                {new Date(m.createdAt).toLocaleString("es-MX")}
              </p>
            </div>
          ))}
          {listo && mensajes.length === 0 && (
            <p className="text-slate-500 text-sm">
              ¿Dudas sobre tu pedido? Escríbenos y te respondemos aquí.
            </p>
          )}
        </div>
        <output className="mb-2 block text-sm text-slate-500">
          {cargando ? "Cargando mensajes…" : confirmacion}
        </output>
        {errorCarga && (
          <p role="alert" className="mb-2 text-danger text-sm">
            {errorCarga}
          </p>
        )}
        {errorEnvio && (
          <p role="alert" className="mb-2 text-danger text-sm">
            {errorEnvio}
          </p>
        )}
        <button
          type="button"
          onClick={() => void cargar(true)}
          disabled={cargando || enviando}
          className="gx-btn-secondary mb-3 min-h-11"
        >
          Actualizar mensajes
        </button>
        <form onSubmit={enviar} className="flex flex-wrap gap-2">
          <input
            value={texto}
            maxLength={2000}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe un mensaje…"
            aria-label="Mensaje"
            className="gx-input min-h-11 min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={enviando || !listo || incierto || !texto.trim()}
            className="gx-btn-primary min-h-11"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </form>
      </div>
    </section>
  );
}
