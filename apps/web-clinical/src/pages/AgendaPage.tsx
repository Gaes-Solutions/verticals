import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";

type CitaEstado =
  | "programada"
  | "confirmada"
  | "checkin"
  | "en_consulta"
  | "completada"
  | "cancelada"
  | "no_asistio";

interface Cita {
  id: string;
  folio: string;
  estado: CitaEstado;
  fechaProgramada: string;
  motivoTexto?: string | null;
  consultorioRoom?: string | null;
  tiempoEsperaMinutos?: number | null;
  paciente?: { nombre: string; apellidoPaterno?: string | null; numeroExpediente: string } | null;
  mascota?: { nombre: string; especie: string; numeroExpediente: string } | null;
  medico?: { nombre: string } | null;
  motivoCita?: { nombre: string } | null;
}

const ESTADO_LABEL: Record<CitaEstado, string> = {
  programada: "Programada",
  confirmada: "Confirmada",
  checkin: "En sala",
  en_consulta: "En consulta",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const ESTADO_BADGE: Record<CitaEstado, string> = {
  programada: "gx-badge-info",
  confirmada: "gx-badge-info",
  checkin: "gx-badge-warn",
  en_consulta: "gx-badge-ok",
  completada: "gx-badge-ok",
  cancelada: "gx-badge-danger",
  no_asistio: "gx-badge-danger",
};

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rangoDelDia(fecha: string): { desde: string; hasta: string } {
  return {
    desde: new Date(`${fecha}T00:00:00`).toISOString(),
    hasta: new Date(`${fecha}T23:59:59`).toISOString(),
  };
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function sujeto(c: Cita): { nombre: string; expediente: string; tipo: string } {
  if (c.mascota) {
    return {
      nombre: c.mascota.nombre,
      expediente: c.mascota.numeroExpediente,
      tipo: c.mascota.especie,
    };
  }
  if (c.paciente) {
    return {
      nombre: `${c.paciente.nombre} ${c.paciente.apellidoPaterno ?? ""}`.trim(),
      expediente: c.paciente.numeroExpediente,
      tipo: "Paciente",
    };
  }
  return { nombre: "—", expediente: "", tipo: "" };
}

export function AgendaPage() {
  const [fecha, setFecha] = useState(hoyISO);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);
  const [checkinCita, setCheckinCita] = useState<Cita | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(null);
    const { desde, hasta } = rangoDelDia(fecha);
    api<{ items: Cita[] }>(
      `/t/citas?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&pageSize=200`,
    )
      .then((r) => setCitas(r.items ?? []))
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar la agenda"))
      .finally(() => setCargando(false));
  }, [fecha]);
  useEffect(() => cargar(), [cargar]);

  async function transicion(id: string, accion: string, body?: unknown) {
    setAccionando(id);
    try {
      await api(`/t/citas/${id}/${accion}`, { method: "POST", ...(body ? { body } : {}) });
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar la cita");
    } finally {
      setAccionando(null);
    }
  }

  function cancelar(id: string) {
    const motivo = window.prompt("Motivo de la cancelación:");
    if (!motivo || motivo.trim().length < 3) return;
    transicion(id, "cancelar", { motivo: motivo.trim() });
  }

  const pendientes = citas.filter(
    (c) => !["completada", "cancelada", "no_asistio"].includes(c.estado),
  ).length;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Agenda del día</h1>
          <p className="text-slate-500 text-sm">
            {citas.length} citas · {pendientes} pendientes
          </p>
        </div>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value || hoyISO())}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-600 text-sm">{error}</p>}

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : citas.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
          No hay citas para este día.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {citas.map((c) => (
            <CitaCard
              key={c.id}
              cita={c}
              ocupada={accionando === c.id}
              onConfirmar={() => transicion(c.id, "confirmar")}
              onCheckin={() => setCheckinCita(c)}
              onIniciar={() => transicion(c.id, "iniciar-consulta")}
              onNoAsistio={() => transicion(c.id, "no-asistio")}
              onCancelar={() => cancelar(c.id)}
            />
          ))}
        </div>
      )}

      {checkinCita && (
        <CheckinModal
          cita={checkinCita}
          onClose={() => setCheckinCita(null)}
          onConfirm={(body) => {
            const id = checkinCita.id;
            setCheckinCita(null);
            transicion(id, "checkin", body);
          }}
        />
      )}
    </div>
  );
}

function CitaCard({
  cita,
  ocupada,
  onConfirmar,
  onCheckin,
  onIniciar,
  onNoAsistio,
  onCancelar,
}: {
  cita: Cita;
  ocupada: boolean;
  onConfirmar: () => void;
  onCheckin: () => void;
  onIniciar: () => void;
  onNoAsistio: () => void;
  onCancelar: () => void;
}) {
  const s = sujeto(cita);
  const espera = cita.tiempoEsperaMinutos ?? 0;
  const esperaColor =
    espera > 30 ? "text-red-600" : espera > 10 ? "text-amber-600" : "text-slate-400";

  const btn = "rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  const acciones: ReactNode[] = [];
  if (cita.estado === "programada" && puede("citas.gestionar")) {
    acciones.push(
      <button
        key="conf"
        type="button"
        disabled={ocupada}
        onClick={onConfirmar}
        className={`${btn} border-brand text-brand hover:bg-teal-50`}
      >
        Confirmar
      </button>,
    );
  }
  if ((cita.estado === "programada" || cita.estado === "confirmada") && puede("citas.checkin")) {
    acciones.push(
      <button
        key="chk"
        type="button"
        disabled={ocupada}
        onClick={onCheckin}
        className={`${btn} border-brand bg-brand text-white hover:bg-brand-dark`}
      >
        Check-in
      </button>,
    );
  }
  if (cita.estado === "checkin" && puede("citas.gestionar")) {
    acciones.push(
      <button
        key="ini"
        type="button"
        disabled={ocupada}
        onClick={onIniciar}
        className={`${btn} border-brand bg-brand text-white hover:bg-brand-dark`}
      >
        Iniciar consulta
      </button>,
      <button
        key="na"
        type="button"
        disabled={ocupada}
        onClick={onNoAsistio}
        className={`${btn} border-slate-300 text-slate-600 hover:bg-slate-50`}
      >
        No asistió
      </button>,
    );
  }
  const terminal = ["en_consulta", "completada", "cancelada", "no_asistio"].includes(cita.estado);
  if (!terminal && puede("citas.cancelar")) {
    acciones.push(
      <button
        key="can"
        type="button"
        disabled={ocupada}
        onClick={onCancelar}
        className={`${btn} border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-red-500`}
      >
        Cancelar
      </button>,
    );
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="text-center">
            <p className="font-bold text-lg text-slate-800">{hora(cita.fechaProgramada)}</p>
            {cita.consultorioRoom && (
              <p className="text-slate-400 text-xs">{cita.consultorioRoom}</p>
            )}
          </div>
          <div>
            <p className="font-medium text-slate-800">{s.nombre}</p>
            <p className="text-slate-400 text-xs">
              {s.tipo} · {s.expediente}
            </p>
            <p className="mt-0.5 text-slate-500 text-sm">
              {cita.motivoCita?.nombre ?? cita.motivoTexto ?? "Consulta"}
              {cita.medico?.nombre ? ` · ${cita.medico.nombre}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={ESTADO_BADGE[cita.estado]}>{ESTADO_LABEL[cita.estado]}</span>
          {cita.estado === "checkin" && espera > 0 && (
            <span className={`text-xs ${esperaColor}`}>esperando {espera} min</span>
          )}
        </div>
      </div>
      {acciones.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

function CheckinModal({
  cita,
  onClose,
  onConfirm,
}: {
  cita: Cita;
  onClose: () => void;
  onConfirm: (body: Record<string, string>) => void;
}) {
  const [peso, setPeso] = useState("");
  const [temp, setTemp] = useState("");
  const [notas, setNotas] = useState("");
  const s = sujeto(cita);

  function confirmar() {
    const body: Record<string, string> = {};
    if (peso.trim()) body.pesoCheckinKg = peso.trim();
    if (temp.trim()) body.temperaturaCheckinC = temp.trim();
    if (notas.trim()) body.notasRecepcion = notas.trim();
    onConfirm(body);
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">Check-in</h2>
        <p className="mb-4 text-slate-500 text-sm">
          {s.nombre} · {hora(cita.fechaProgramada)}
        </p>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="gx-label">Peso (kg)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Temperatura (°C)</span>
            <input
              type="number"
              step="0.1"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              className="gx-input"
            />
          </label>
        </div>
        <label className="mb-4 block">
          <span className="gx-label">Notas de recepción</span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Observaciones al llegar (opcional)"
            className="gx-input"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={confirmar} className="gx-btn-primary">
            Confirmar check-in
          </button>
        </div>
      </div>
    </div>
  );
}
