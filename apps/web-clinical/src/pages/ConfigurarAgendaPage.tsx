import { useCallback, useEffect, useState } from "react";
import { ApiError, api, getUsuario, puede } from "../lib/api.js";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const BLOQUEO_TIPOS = [
  ["vacaciones", "Vacaciones"],
  ["congreso", "Congreso"],
  ["personal", "Personal"],
  ["incapacidad", "Incapacidad"],
  ["cerrado_sucursal", "Cerrado (sucursal)"],
] as const;

interface Agenda {
  id: string;
  diaSemana?: number | null;
  fechaEspecifica?: string | null;
  horaInicio: string;
  horaFin: string;
  duracionSlotMinutos: number;
  isActive: boolean;
}
interface Bloqueo {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  tipo: string;
  motivoPublico?: string | null;
}
interface Slot {
  hora: string;
  disponible: boolean;
  motivo?: string;
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function primeraSucursal(): Promise<string | null> {
  const s = await api<{ id: string }[]>("/t/sucursales").catch(() => []);
  return s[0]?.id ?? null;
}

export function ConfigurarAgendaPage() {
  const medicoUsuarioId = getUsuario()?.id ?? "";
  const gestiona = puede("agenda.gestionar");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-bold text-2xl text-slate-800">Configurar agenda</h1>
        <p className="text-slate-500 text-sm">
          Tus horarios de atención, bloqueos y disponibilidad.
        </p>
      </div>
      {puede("agenda.leer") && <RecordatoriosConfig gestiona={gestiona} />}
      <Horarios medicoUsuarioId={medicoUsuarioId} gestiona={gestiona} />
      <Bloqueos medicoUsuarioId={medicoUsuarioId} />
      <Disponibilidad medicoUsuarioId={medicoUsuarioId} />
    </div>
  );
}

interface RecordatoriosCfg {
  citasActivo: boolean;
  citasHorasAntes: number;
  citasCanal: "whatsapp" | "sms" | "email";
  citasPlantilla: string;
}
const CANAL_LABEL: Record<RecordatoriosCfg["citasCanal"], string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Correo",
};

function RecordatoriosConfig({ gestiona }: { gestiona: boolean }) {
  const [cfg, setCfg] = useState<RecordatoriosCfg | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<RecordatoriosCfg>("/t/recordatorios/config")
      .then(setCfg)
      .catch(() => setCfg(null));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function guardar() {
    if (!cfg) return;
    setGuardando(true);
    setMsg(null);
    try {
      const upd = await api<RecordatoriosCfg>("/t/recordatorios/config", {
        method: "PATCH",
        body: {
          citasActivo: cfg.citasActivo,
          citasHorasAntes: cfg.citasHorasAntes,
          citasCanal: cfg.citasCanal,
          citasPlantilla: cfg.citasPlantilla,
        },
      });
      setCfg(upd);
      setMsg("Guardado.");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function enviarAhora() {
    setMsg(null);
    try {
      const r = await api<{ evaluadas: number; enviadas: number; omitidasSinContacto: number }>(
        "/t/recordatorios/enviar",
        { method: "POST" },
      );
      setMsg(
        `Barrido: ${r.enviadas} enviado(s), ${r.omitidasSinContacto} sin contacto, de ${r.evaluadas} cita(s) próximas.`,
      );
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "No se pudo enviar");
    }
  }

  if (!cfg) {
    return (
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold text-slate-800">Recordatorios de citas</h2>
        <p className="text-slate-400 text-sm">Cargando…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-800">Recordatorios de citas</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cfg.citasActivo}
            disabled={!gestiona}
            onChange={(e) => setCfg({ ...cfg, citasActivo: e.target.checked })}
            className="h-4 w-4 accent-brand"
          />
          <span className="text-slate-600">{cfg.citasActivo ? "Activos" : "Apagados"}</span>
        </label>
      </div>
      <p className="mb-4 text-slate-500 text-sm">
        Avisamos al tutor antes de su cita con un link para confirmar o reagendar. Reduce las
        inasistencias.{" "}
        <span className="text-slate-400">Recomendado: activo, 24 h antes, por WhatsApp.</span>
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="gx-label">Anticipación (horas antes)</span>
          <input
            type="number"
            min={1}
            max={168}
            value={cfg.citasHorasAntes}
            disabled={!gestiona}
            onChange={(e) =>
              setCfg({ ...cfg, citasHorasAntes: Number.parseInt(e.target.value, 10) || 24 })
            }
            className="gx-input"
          />
        </label>
        <label className="block">
          <span className="gx-label">Canal de envío</span>
          <select
            value={cfg.citasCanal}
            disabled={!gestiona}
            onChange={(e) =>
              setCfg({ ...cfg, citasCanal: e.target.value as RecordatoriosCfg["citasCanal"] })
            }
            className="gx-input"
          >
            {(["whatsapp", "sms", "email"] as const).map((c) => (
              <option key={c} value={c}>
                {CANAL_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block">
        <span className="gx-label">Mensaje</span>
        <textarea
          value={cfg.citasPlantilla}
          disabled={!gestiona}
          onChange={(e) => setCfg({ ...cfg, citasPlantilla: e.target.value })}
          rows={3}
          className="gx-input"
        />
        <span className="mt-1 block text-slate-400 text-xs">
          Variables: {"{{sujeto}}"} {"{{clinica}}"} {"{{fecha}}"} {"{{hora}}"} {"{{link}}"}
        </span>
      </label>

      {msg && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-slate-600 text-sm">{msg}</p>}

      {gestiona && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={enviarAhora} className="gx-btn-secondary">
            Enviar ahora
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="gx-btn-primary">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
    </section>
  );
}

function Horarios({
  medicoUsuarioId,
  gestiona,
}: {
  medicoUsuarioId: string;
  gestiona: boolean;
}) {
  const [items, setItems] = useState<Agenda[]>([]);
  const [recurrente, setRecurrente] = useState(true);
  const [diaSemana, setDiaSemana] = useState("1");
  const [fecha, setFecha] = useState(hoyISO);
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFin, setHoraFin] = useState("14:00");
  const [slot, setSlot] = useState("30");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<Agenda[]>(`/t/agenda?medicoUsuarioId=${medicoUsuarioId}`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [medicoUsuarioId]);
  useEffect(() => cargar(), [cargar]);

  async function crear() {
    setError(null);
    const sucursalId = await primeraSucursal();
    if (!sucursalId) {
      setError("No hay sucursal configurada.");
      return;
    }
    try {
      await api("/t/agenda", {
        body: {
          medicoUsuarioId,
          sucursalId,
          horaInicio,
          horaFin,
          duracionSlotMinutos: Number.parseInt(slot, 10),
          ...(recurrente
            ? { diaSemana: Number.parseInt(diaSemana, 10) }
            : { fechaEspecifica: new Date(`${fecha}T00:00:00`).toISOString() }),
        },
      });
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el horario");
    }
  }

  async function archivar(id: string) {
    await api(`/t/agenda/${id}/archivar`, { method: "POST" }).catch(() => undefined);
    cargar();
  }

  const activos = items.filter((a) => a.isActive);

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-800">Horarios de atención</h2>
      {activos.length > 0 ? (
        <ul className="mb-4 flex flex-col gap-2">
          {activos.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="text-slate-700">
                {a.diaSemana != null
                  ? `Cada ${DIAS[a.diaSemana]}`
                  : a.fechaEspecifica
                    ? new Date(a.fechaEspecifica).toLocaleDateString("es-MX")
                    : "—"}{" "}
                · {a.horaInicio}–{a.horaFin} · slots de {a.duracionSlotMinutos} min
              </span>
              {gestiona && (
                <button
                  type="button"
                  onClick={() => archivar(a.id)}
                  className="text-slate-400 text-xs hover:text-danger"
                >
                  eliminar
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-slate-400 text-sm">Aún no tienes horarios configurados.</p>
      )}

      {gestiona && (
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setRecurrente(true)}
              className={`rounded-lg px-3 py-1 ${recurrente ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Recurrente
            </button>
            <button
              type="button"
              onClick={() => setRecurrente(false)}
              className={`rounded-lg px-3 py-1 ${!recurrente ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Fecha específica
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {recurrente ? (
              <select
                value={diaSemana}
                onChange={(e) => setDiaSemana(e.target.value)}
                className="gx-input"
              >
                {DIAS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="gx-input"
              />
            )}
            <input
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              className="gx-input"
            />
            <input
              type="time"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
              className="gx-input"
            />
            <select value={slot} onChange={(e) => setSlot(e.target.value)} className="gx-input">
              {["15", "20", "30", "45", "60"].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
          {error && <p className="mt-2 text-danger text-sm">{error}</p>}
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={crear} className="gx-btn-primary">
              Agregar horario
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Bloqueos({ medicoUsuarioId }: { medicoUsuarioId: string }) {
  const [items, setItems] = useState<Bloqueo[]>([]);
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [tipo, setTipo] = useState("vacaciones");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const puedeBloquear = puede("agenda.bloquear");

  const cargar = useCallback(() => {
    api<Bloqueo[]>("/t/agenda/bloqueos")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function crear() {
    setError(null);
    if (!inicio || !fin) {
      setError("Indica inicio y fin.");
      return;
    }
    try {
      await api("/t/agenda/bloqueos", {
        body: {
          medicoUsuarioId,
          fechaInicio: new Date(inicio).toISOString(),
          fechaFin: new Date(fin).toISOString(),
          tipo,
          ...(motivo ? { motivoPublico: motivo } : {}),
        },
      });
      setInicio("");
      setFin("");
      setMotivo("");
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el bloqueo");
    }
  }

  async function borrar(id: string) {
    await api(`/t/agenda/bloqueos/${id}`, { method: "DELETE" }).catch(() => undefined);
    cargar();
  }

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-800">Bloqueos</h2>
      {items.length > 0 ? (
        <ul className="mb-4 flex flex-col gap-2">
          {items.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="text-slate-700">
                <span className="gx-badge-info">{b.tipo.replace(/_/g, " ")}</span>{" "}
                {new Date(b.fechaInicio).toLocaleDateString("es-MX")} –{" "}
                {new Date(b.fechaFin).toLocaleDateString("es-MX")}
                {b.motivoPublico ? ` · ${b.motivoPublico}` : ""}
              </span>
              {puedeBloquear && (
                <button
                  type="button"
                  onClick={() => borrar(b.id)}
                  className="text-slate-400 text-xs hover:text-danger"
                >
                  quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-slate-400 text-sm">Sin bloqueos.</p>
      )}

      {puedeBloquear && (
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="gx-label">Inicio</span>
              <input
                type="datetime-local"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="gx-input"
              />
            </label>
            <label className="block">
              <span className="gx-label">Fin</span>
              <input
                type="datetime-local"
                value={fin}
                onChange={(e) => setFin(e.target.value)}
                className="gx-input"
              />
            </label>
            <label className="block">
              <span className="gx-label">Tipo</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="gx-input">
                {BLOQUEO_TIPOS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="gx-label">Motivo (público)</span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="gx-input"
              />
            </label>
          </div>
          {error && <p className="mt-2 text-danger text-sm">{error}</p>}
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={crear} className="gx-btn-primary">
              Agregar bloqueo
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Disponibilidad({ medicoUsuarioId }: { medicoUsuarioId: string }) {
  const [fecha, setFecha] = useState(hoyISO);
  const [slots, setSlots] = useState<Slot[] | null>(null);

  function consultar() {
    api<{ slots: Slot[] }>(
      `/t/agenda/disponibilidad?medicoUsuarioId=${medicoUsuarioId}&fecha=${fecha}`,
    )
      .then((r) => setSlots(r.slots ?? []))
      .catch(() => setSlots([]));
  }

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-800">Vista previa de disponibilidad</h2>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="gx-input max-w-[180px]"
        />
        <button type="button" onClick={consultar} className="gx-btn-secondary">
          Ver slots
        </button>
      </div>
      {slots != null &&
        (slots.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin horario para ese día.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <span
                key={s.hora}
                className={`rounded-lg px-2 py-1 text-xs ${
                  s.disponible
                    ? "bg-emerald-50 text-emerald-700"
                    : s.motivo === "bloqueo"
                      ? "bg-slate-100 text-slate-400 line-through"
                      : "bg-amber-50 text-amber-700"
                }`}
                title={s.motivo ?? "disponible"}
              >
                {s.hora}
              </span>
            ))}
          </div>
        ))}
    </section>
  );
}
