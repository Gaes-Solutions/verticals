import { useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";

type BookingStatus = "pendiente" | "confirmada" | "rechazada" | "cancelada" | "completada";

interface Reserva {
  id: string;
  pacienteNombre: string;
  pacienteTelefono?: string | null;
  pacienteEmail?: string | null;
  fechaHora: string;
  modalidad: "presencial" | "telemedicina";
  motivo?: string | null;
  status: BookingStatus;
  motivoRechazo?: string | null;
  salaVideoUrl?: string | null;
  professional?: { nombrePublico: string } | null;
}

const STATUS_BADGE: Record<BookingStatus, string> = {
  pendiente: "gx-badge-warn",
  confirmada: "gx-badge-ok",
  rechazada: "gx-badge-danger",
  cancelada: "gx-badge-danger",
  completada: "gx-badge-info",
};
const STATUS_LABEL: Record<BookingStatus, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  completada: "Completada",
};

const FILTROS = [
  ["pendiente", "Pendientes"],
  ["confirmada", "Confirmadas"],
  ["", "Todas"],
] as const;

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReservasPage() {
  const [filtro, setFiltro] = useState<string>("pendiente");
  const [items, setItems] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const gestiona = puede("citas.gestionar");

  const cargar = useCallback(() => {
    setCargando(true);
    const qs = filtro ? `?status=${filtro}` : "";
    api<Reserva[]>(`/t/marketplace/reservas${qs}`)
      .then((r) => setItems(r ?? []))
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  }, [filtro]);
  useEffect(() => cargar(), [cargar]);

  async function confirmar(id: string) {
    setOcupada(id);
    setMsg(null);
    try {
      const r = await api<{ folio: string }>(`/t/marketplace/reservas/${id}/confirmar`, {
        method: "POST",
        body: {},
      });
      setMsg(`Cita agendada (${r.folio}). El paciente ya es parte de tu expediente.`);
      cargar();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "No se pudo confirmar");
    } finally {
      setOcupada(null);
    }
  }

  async function rechazar(id: string) {
    const motivo = window.prompt("Motivo del rechazo:");
    if (!motivo || motivo.trim().length < 3) return;
    setOcupada(id);
    setMsg(null);
    try {
      await api(`/t/marketplace/reservas/${id}/rechazar`, {
        method: "POST",
        body: { motivo: motivo.trim() },
      });
      cargar();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "No se pudo rechazar");
    } finally {
      setOcupada(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-bold text-2xl text-slate-800">Reservas en línea</h1>
      <p className="mb-4 text-slate-500 text-sm">
        Citas solicitadas desde el portal público. Al confirmar se agendan en tu agenda.
      </p>

      <div className="mb-4 flex gap-2">
        {FILTROS.map(([v, l]) => (
          <button
            key={l}
            type="button"
            onClick={() => setFiltro(v)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
              filtro === v ? "bg-brand text-white" : "bg-white text-slate-600 shadow-sm"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {msg && (
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-slate-600 text-sm shadow-sm">
          {msg}
        </p>
      )}

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
          No hay reservas {filtro ? STATUS_LABEL[filtro as BookingStatus]?.toLowerCase() : ""}.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((r) => (
            <ReservaCard
              key={r.id}
              reserva={r}
              gestiona={gestiona}
              ocupada={ocupada === r.id}
              onConfirmar={() => confirmar(r.id)}
              onRechazar={() => rechazar(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReservaCard({
  reserva: r,
  gestiona,
  ocupada,
  onConfirmar,
  onRechazar,
}: {
  reserva: Reserva;
  gestiona: boolean;
  ocupada: boolean;
  onConfirmar: () => void;
  onRechazar: () => void;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-800">{r.pacienteNombre}</p>
          <p className="text-slate-500 text-sm capitalize">{fechaLarga(r.fechaHora)}</p>
          <p className="mt-0.5 text-slate-400 text-xs">
            {r.modalidad === "telemedicina" ? "🎥 Telemedicina" : "🏥 Presencial"}
            {r.motivo ? ` · ${r.motivo}` : ""}
            {r.pacienteTelefono ? ` · ${r.pacienteTelefono}` : ""}
          </p>
          {r.status === "rechazada" && r.motivoRechazo && (
            <p className="mt-0.5 text-red-500 text-xs">Rechazo: {r.motivoRechazo}</p>
          )}
          {r.status === "confirmada" && r.salaVideoUrl && (
            <a
              href={r.salaVideoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-brand text-xs hover:underline"
            >
              🎥 Entrar a la videollamada
            </a>
          )}
        </div>
        <span className={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</span>
      </div>
      {r.status === "pendiente" && gestiona && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            disabled={ocupada}
            onClick={onRechazar}
            className="gx-btn-secondary"
          >
            Rechazar
          </button>
          <button type="button" disabled={ocupada} onClick={onConfirmar} className="gx-btn-primary">
            {ocupada ? "Confirmando…" : "Confirmar y agendar"}
          </button>
        </div>
      )}
    </div>
  );
}
