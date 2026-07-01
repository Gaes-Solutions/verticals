import { Star, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { navegar } from "../App.js";
import { ApiError, type PacienteSesion, api } from "../lib/api.js";

type BookingStatus = "pendiente" | "confirmada" | "rechazada" | "cancelada" | "completada";

interface Reserva {
  id: string;
  professionalId: string;
  fechaHora: string;
  modalidad: "presencial" | "telemedicina";
  motivo?: string | null;
  status: BookingStatus;
  motivoRechazo?: string | null;
  salaVideoUrl?: string | null;
  professional?: { nombrePublico: string; slugSeo: string } | null;
}

const STATUS: Record<BookingStatus, { label: string; badge: string }> = {
  pendiente: { label: "Pendiente de confirmación", badge: "gx-badge-warn" },
  confirmada: { label: "Confirmada", badge: "gx-badge-ok" },
  rechazada: { label: "Rechazada", badge: "gx-badge-danger" },
  cancelada: { label: "Cancelada", badge: "gx-badge-danger" },
  completada: { label: "Completada", badge: "gx-badge-info" },
};

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MisReservasPage({
  paciente,
  onPedirIdentidad,
}: {
  paciente: PacienteSesion | null;
  onPedirIdentidad: () => void;
}) {
  const [items, setItems] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [resenar, setResenar] = useState<Reserva | null>(null);

  const cargar = useCallback(() => {
    if (!paciente) {
      setCargando(false);
      return;
    }
    setCargando(true);
    api<Reserva[]>(`/marketplace/pacientes/${paciente.id}/reservas`)
      .then((r) => setItems(r ?? []))
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  }, [paciente]);
  useEffect(() => cargar(), [cargar]);

  if (!paciente) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">
        <p className="mb-3 text-slate-500">Identifícate para ver tus reservas.</p>
        <button type="button" onClick={onPedirIdentidad} className="gx-btn-primary">
          Identificarme
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 font-bold text-2xl text-slate-800">Mis reservas</h1>
      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm">
          Aún no tienes reservas.{" "}
          <button type="button" onClick={() => navegar("/")} className="text-brand">
            Buscar profesional
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((r) => (
            <div key={r.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-800">
                    {r.professional?.nombrePublico ?? "Profesional"}
                  </p>
                  <p className="text-slate-500 text-sm capitalize">{fecha(r.fechaHora)}</p>
                  <p className="mt-0.5 text-slate-400 text-xs">
                    {r.modalidad === "telemedicina" ? "🎥 Telemedicina" : "🏥 Presencial"}
                    {r.motivo ? ` · ${r.motivo}` : ""}
                  </p>
                  {r.status === "rechazada" && r.motivoRechazo && (
                    <p className="mt-0.5 text-red-500 text-xs">Motivo: {r.motivoRechazo}</p>
                  )}
                </div>
                <span className={STATUS[r.status].badge}>{STATUS[r.status].label}</span>
              </div>
              {(r.status === "confirmada" || r.status === "completada") && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  {r.status === "confirmada" && r.salaVideoUrl ? (
                    <a
                      href={r.salaVideoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-medium text-sm text-white"
                    >
                      <Video size={15} /> Entrar a la videollamada
                    </a>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => setResenar(r)}
                    className="flex items-center gap-1 text-brand text-sm hover:underline"
                  >
                    <Star size={14} /> Dejar reseña
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {resenar && (
        <ResenaModal
          reserva={resenar}
          email={paciente.email}
          onClose={() => setResenar(null)}
          onListo={() => {
            setResenar(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function ResenaModal({
  reserva,
  email,
  onClose,
  onListo,
}: {
  reserva: Reserva;
  email: string;
  onClose: () => void;
  onListo: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enviar() {
    setBusy(true);
    setError(null);
    try {
      await api(`/marketplace/profesionales/${reserva.professionalId}/resenas`, {
        body: {
          pacienteEmail: email,
          ratingGeneral: rating,
          ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
        },
      });
      onListo();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar la reseña");
      setBusy(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">
          Reseña para {reserva.professional?.nombrePublico ?? "el profesional"}
        </h2>
        <p className="mb-3 text-slate-500 text-sm">Tu opinión ayuda a otros pacientes.</p>
        <div className="mb-3 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} className="text-amber-500">
              <Star size={28} fill={n <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={3}
          placeholder="¿Cómo fue tu experiencia? (opcional)"
          className="gx-input"
        />
        {error && <p className="mt-2 text-danger text-sm">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={enviar} disabled={busy} className="gx-btn-primary">
            {busy ? "Enviando…" : "Publicar reseña"}
          </button>
        </div>
      </div>
    </div>
  );
}
