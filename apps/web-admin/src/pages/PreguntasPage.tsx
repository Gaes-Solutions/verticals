import { useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";

interface Pregunta {
  id: string;
  pregunta: string;
  respuesta: string | null;
  estado: string;
  createdAt: string;
  productoPublicado: { tituloPublico: string; slugSeo: string } | null;
  cliente: { nombre: string } | null;
}

const ESTADOS: Record<string, string> = {
  pendiente: "Pendientes",
  publicada: "Respondidas",
  rechazada: "Rechazadas",
};

function badge(estado: string): string {
  if (estado === "publicada") return "bg-emerald-100 text-emerald-700";
  if (estado === "rechazada") return "bg-slate-100 text-slate-500";
  return "bg-amber-100 text-amber-700";
}

export function PreguntasPage() {
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const puedeModerar = puede("ecommerce.resenas_moderar");

  const cargar = useCallback(() => {
    const qs = filtro ? `?estado=${filtro}` : "";
    api<Pregunta[]>(`/t/preguntas${qs}`)
      .then(setPreguntas)
      .catch(() => setPreguntas([]));
  }, [filtro]);

  useEffect(() => cargar(), [cargar]);

  async function responder(id: string) {
    const respuesta = (respuestas[id] ?? "").trim();
    if (!respuesta) return;
    try {
      await api(`/t/preguntas/${id}/responder`, { body: { respuesta } });
      setError(null);
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al responder");
    }
  }

  async function rechazar(id: string) {
    try {
      await api(`/t/preguntas/${id}/rechazar`, { method: "POST" });
      setError(null);
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al rechazar");
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-slate-800">Preguntas de productos</h1>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todas</option>
          {Object.entries(ESTADOS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-4 text-red-600 text-sm">{error}</p>}

      <div className="space-y-3">
        {preguntas.map((p) => (
          <div key={p.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium text-slate-500 text-xs">
                {p.productoPublicado?.tituloPublico ?? "Producto"} ·{" "}
                {p.cliente?.nombre ?? "Cliente"} ·{" "}
                {new Date(p.createdAt).toLocaleDateString("es-MX")}
              </p>
              <span className={`rounded-full px-2 py-0.5 text-xs ${badge(p.estado)}`}>
                {p.estado}
              </span>
            </div>
            <p className="mt-1 text-slate-800">{p.pregunta}</p>
            {p.respuesta && (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-600 text-sm">
                <span className="font-medium">Respuesta:</span> {p.respuesta}
              </p>
            )}
            {p.estado === "pendiente" && puedeModerar && (
              <div className="mt-3">
                <textarea
                  value={respuestas[p.id] ?? ""}
                  onChange={(e) => setRespuestas((r) => ({ ...r, [p.id]: e.target.value }))}
                  placeholder="Escribe tu respuesta (se publicará en el producto)…"
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => responder(p.id)}
                    className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-sm text-white hover:bg-brand-dark"
                  >
                    Responder y publicar
                  </button>
                  <button
                    type="button"
                    onClick={() => rechazar(p.id)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 text-sm hover:bg-slate-50"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {preguntas.length === 0 && (
          <p className="rounded-xl bg-white p-8 text-center text-slate-400">Sin preguntas.</p>
        )}
      </div>
    </div>
  );
}
