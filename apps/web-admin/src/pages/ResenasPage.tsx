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
  pendiente: "gx-badge-warn",
  aprobada: "gx-badge-ok",
  rechazada: "gx-badge-danger",
};

export function ResenasPage() {
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [filtro, setFiltro] = useState("pendiente");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(null);
    const qs = filtro ? `?estado=${filtro}` : "";
    api<Resena[]>(`/t/resenas${qs}`)
      .then((r) => {
        setResenas(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar las reseñas"))
      .finally(() => setCargando(false));
  }, [filtro]);

  useEffect(() => cargar(), [cargar]);

  async function moderar(id: string, estado: "aprobada" | "rechazada") {
    setError(null);
    try {
      await api(`/t/resenas/${id}/moderar`, { body: { estado } });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo moderar la reseña");
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Reseñas</h1>
        <select
          data-tour="res-filtro"
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

      {cargando && (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          Cargando…
        </p>
      )}
      {error && !cargando && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-light p-3 text-danger text-sm">
          <span>{error}</span>
          <button type="button" onClick={cargar} className="gx-btn-danger">
            Reintentar
          </button>
        </div>
      )}
      {!cargando &&
        !error &&
        resenas.map((r) => (
          <ResenaCard key={r.id} resena={r} onModerar={moderar} onChanged={cargar} />
        ))}
      {!cargando && !error && resenas.length === 0 && (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          Sin reseñas {filtro ? `en estado "${filtro}"` : ""}.
        </p>
      )}
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
  const [error, setError] = useState<string | null>(null);

  async function responder() {
    if (!respuesta.trim()) return;
    setError(null);
    setRespondiendo(true);
    try {
      await api(`/t/resenas/${resena.id}/responder`, { body: { respuesta: respuesta.trim() } });
      setRespuesta("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo publicar la respuesta");
    } finally {
      setRespondiendo(false);
    }
  }

  return (
    <div className="mb-3 rounded-xl bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-warn">
            {"★".repeat(resena.rating)}
            {"☆".repeat(5 - resena.rating)}
          </span>
          <span className="text-sm font-medium text-slate-800">
            {resena.productoPublicado.tituloPublico}
          </span>
        </div>
        <span className={ESTADO_BADGE[resena.estado]}>{resena.estado}</span>
      </div>
      <p className="mb-1 text-xs text-slate-400">
        {resena.cliente?.nombre ?? "Cliente"} · {resena.pedido.folioPublico} ·{" "}
        {new Date(resena.createdAt).toLocaleDateString("es-MX")}
      </p>
      {resena.titulo && <p className="text-sm font-medium text-slate-700">{resena.titulo}</p>}
      {resena.comentario && <p className="mb-2 text-sm text-slate-600">{resena.comentario}</p>}

      {resena.estado === "pendiente" && (
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onModerar(resena.id, "aprobada")}
            className="gx-btn-primary"
          >
            Aprobar
          </button>
          <button
            type="button"
            onClick={() => onModerar(resena.id, "rechazada")}
            className="gx-btn-danger"
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
          <div className="flex flex-wrap gap-2">
            <input
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              placeholder="Responder al cliente…"
              className="gx-input min-w-52 flex-1"
            />
            <button
              type="button"
              onClick={responder}
              disabled={respondiendo}
              className="gx-btn-secondary disabled:opacity-50"
            >
              Responder
            </button>
          </div>
        )
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
