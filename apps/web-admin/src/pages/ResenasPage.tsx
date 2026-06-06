import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface Resena {
  id: string;
  rating: number;
  titulo: string | null;
  comentario: string | null;
  estado: "pendiente" | "aprobada" | "rechazada";
  respuestaTienda: string | null;
  createdAt: string;
  productoPublicado: { tituloPublico: string };
  cliente: { nombre: string } | null;
  pedido: { folioPublico: string };
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  aprobada: "bg-emerald-100 text-emerald-700",
  rechazada: "bg-red-100 text-red-700",
};

export function ResenasPage() {
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    const qs = filtro ? `?estado=${filtro}` : "";
    api<Resena[]>(`/t/resenas${qs}`)
      .then(setResenas)
      .catch(() => setResenas([]));
  }, [filtro]);

  useEffect(() => cargar(), [cargar]);

  async function moderar(id: string, estado: "aprobada" | "rechazada") {
    setError(null);
    try {
      await api(`/t/resenas/${id}/moderar`, { body: { estado } });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al moderar");
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Reseñas</h1>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="pendiente">Pendientes</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="">Todas</option>
        </select>
      </div>

      {resenas.map((r) => (
        <ResenaCard key={r.id} resena={r} onModerar={moderar} onChanged={cargar} />
      ))}
      {resenas.length === 0 && (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          Sin reseñas {filtro ? `en estado "${filtro}"` : ""}.
        </p>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function ResenaCard({
  resena,
  onModerar,
  onChanged,
}: {
  resena: Resena;
  onModerar: (id: string, estado: "aprobada" | "rechazada") => void;
  onChanged: () => void;
}) {
  const [respuesta, setRespuesta] = useState("");
  const [respondiendo, setRespondiendo] = useState(false);

  async function responder() {
    if (!respuesta.trim()) return;
    setRespondiendo(true);
    try {
      await api(`/t/resenas/${resena.id}/responder`, { body: { respuesta: respuesta.trim() } });
      setRespuesta("");
      onChanged();
    } finally {
      setRespondiendo(false);
    }
  }

  return (
    <div className="mb-3 rounded-xl bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-500">
            {"★".repeat(resena.rating)}
            {"☆".repeat(5 - resena.rating)}
          </span>
          <span className="text-sm font-medium text-slate-800">
            {resena.productoPublicado.tituloPublico}
          </span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_BADGE[resena.estado]}`}>
          {resena.estado}
        </span>
      </div>
      <p className="mb-1 text-xs text-slate-400">
        {resena.cliente?.nombre ?? "Cliente"} · {resena.pedido.folioPublico} ·{" "}
        {new Date(resena.createdAt).toLocaleDateString("es-MX")}
      </p>
      {resena.titulo && <p className="text-sm font-medium text-slate-700">{resena.titulo}</p>}
      {resena.comentario && <p className="mb-2 text-sm text-slate-600">{resena.comentario}</p>}

      {resena.estado === "pendiente" && (
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => onModerar(resena.id, "aprobada")}
            className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Aprobar
          </button>
          <button
            type="button"
            onClick={() => onModerar(resena.id, "rechazada")}
            className="rounded-lg border border-red-300 px-3 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Rechazar
          </button>
        </div>
      )}

      {resena.respuestaTienda ? (
        <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
          <span className="font-medium">Tu respuesta:</span> {resena.respuestaTienda}
        </p>
      ) : (
        resena.estado === "aprobada" && (
          <div className="flex gap-2">
            <input
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              placeholder="Responder al cliente…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={responder}
              disabled={respondiendo}
              className="rounded-lg border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-teal-50 disabled:opacity-50"
            >
              Responder
            </button>
          </div>
        )
      )}
    </div>
  );
}
