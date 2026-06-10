import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api, puede } from "../lib/api.js";

interface Mensaje {
  id: string;
  autorTipo: "cliente" | "empleado";
  cuerpo: string;
  createdAt: string;
  usuario: { nombre: string } | null;
}

/** Hilo de mensajes pedido↔cliente dentro del detalle del pedido (lado admin). */
export function ChatPedido({ pedidoId }: { pedidoId: string }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const puedeResponder = puede("ecommerce.pedidos_gestionar");

  const cargar = useCallback(() => {
    api<Mensaje[]>(`/t/pedidos-ecommerce/${pedidoId}/mensajes`)
      .then(setMensajes)
      .catch(() => setMensajes([]));
  }, [pedidoId]);

  useEffect(() => cargar(), [cargar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await api(`/t/pedidos-ecommerce/${pedidoId}/mensajes`, { body: { cuerpo: texto.trim() } });
      setTexto("");
      cargar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 font-bold text-slate-700 text-sm">Mensajes con el cliente</h3>
      <div className="mb-2 max-h-44 space-y-2 overflow-y-auto">
        {mensajes.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin mensajes.</p>
        ) : (
          mensajes.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                m.autorTipo === "empleado"
                  ? "ml-auto bg-brand/10 text-slate-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <p>{m.cuerpo}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {m.autorTipo === "empleado" ? (m.usuario?.nombre ?? "Equipo") : "Cliente"} ·{" "}
                {new Date(m.createdAt).toLocaleString("es-MX")}
              </p>
            </div>
          ))
        )}
      </div>
      {puedeResponder && (
        <form onSubmit={enviar} className="flex gap-2">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe una respuesta…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="rounded-lg bg-brand px-3 py-2 font-semibold text-sm text-white hover:bg-brand-dark disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
      )}
    </div>
  );
}
