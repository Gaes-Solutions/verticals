"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

interface Mensaje {
  id: string;
  autorTipo: "cliente" | "empleado";
  cuerpo: string;
  createdAt: string;
  usuario: { nombre: string } | null;
}

/** Hilo de mensajes con el negocio sobre un pedido (lado cliente). */
export function ChatPedidoCliente({ folio }: { folio: string }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/cuenta/pedidos/${folio}/mensajes`, { cache: "no-store" });
    if (res.ok) setMensajes((await res.json()) as Mensaje[]);
  }, [folio]);

  useEffect(() => {
    cargar();
    // SSE: al llegar una señal, refresca el hilo (la campana ya escucha aparte).
    const es = new EventSource("/api/cuenta/realtime");
    es.onmessage = () => cargar();
    return () => es.close();
  }, [cargar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    const res = await fetch(`/api/cuenta/pedidos/${folio}/mensajes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuerpo: texto.trim() }),
    });
    setEnviando(false);
    if (res.ok) {
      setTexto("");
      cargar();
    }
  }

  return (
    <div>
      <h2 className="mb-2 font-bold text-lg">Mensajes con la tienda</h2>
      <div className="rounded-lg border bg-white p-4">
        <div className="mb-3 max-h-60 space-y-2 overflow-y-auto">
          {mensajes.length === 0 ? (
            <p className="text-gray-400 text-sm">
              ¿Dudas sobre tu pedido? Escríbenos y te respondemos aquí.
            </p>
          ) : (
            mensajes.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.autorTipo === "cliente"
                    ? "ml-auto bg-marca/10 text-gray-800"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                <p>{m.cuerpo}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {m.autorTipo === "cliente" ? "Tú" : (m.usuario?.nombre ?? "Tienda")} ·{" "}
                  {new Date(m.createdAt).toLocaleString("es-MX")}
                </p>
              </div>
            ))
          )}
        </div>
        <form onSubmit={enviar} className="flex gap-2">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe un mensaje…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="rounded-lg bg-marca px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
