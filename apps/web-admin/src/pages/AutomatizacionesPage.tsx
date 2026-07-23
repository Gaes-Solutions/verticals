import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface EventoFlow {
  evento: string;
  label: string;
  usaDias: boolean;
}
interface Flow {
  id: string;
  evento: string;
  campanaNombre: string;
  canal: string;
  dias: number | null;
  frecuenciaMax: number;
  isActive: boolean;
}
interface Campana {
  id: string;
  nombre: string;
}

export function AutomatizacionesPage() {
  const [eventos, setEventos] = useState<EventoFlow[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<Flow[]>("/t/campanas/flows")
      .then(setFlows)
      .catch(() => setFlows([]));
  }, []);

  useEffect(() => {
    api<EventoFlow[]>("/t/campanas/flows/eventos")
      .then(setEventos)
      .catch(() => setEventos([]));
    api<{ items?: Campana[] } | Campana[]>("/t/campanas")
      .then((r) => setCampanas(Array.isArray(r) ? r : (r.items ?? [])))
      .catch(() => setCampanas([]));
    cargar();
  }, [cargar]);

  const labelEvento = (ev: string) => eventos.find((e) => e.evento === ev)?.label ?? ev;

  async function toggle(f: Flow) {
    await api(`/t/campanas/flows/${f.id}`, {
      method: "PATCH",
      body: { isActive: !f.isActive },
    }).catch(() => undefined);
    cargar();
  }
  async function eliminar(f: Flow) {
    if (!window.confirm("¿Eliminar esta automatización?")) return;
    await api(`/t/campanas/flows/${f.id}`, { method: "DELETE" }).catch(() => undefined);
    cargar();
  }
  async function ejecutar() {
    setMsg(null);
    try {
      const r = await api<{ encolados: number }>("/t/campanas/flows/run", { method: "POST" });
      setMsg(`Listo: ${r.encolados} envío(s) encolado(s).`);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Error");
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-bold text-2xl text-slate-800">Automatizaciones</h1>
        <div className="flex gap-2">
          <button type="button" onClick={ejecutar} className="gx-btn-secondary">
            Ejecutar ahora
          </button>
          <button
            type="button"
            data-tour="auto-nuevo"
            onClick={() => setNuevo(true)}
            className="gx-btn-primary"
          >
            + Nueva automatización
          </button>
        </div>
      </div>
      <p className="mb-4 text-slate-500 text-sm">
        Manda mensajes solos: bienvenida, cumpleaños, recuperación y recompra. Se disparan al
        ejecutar (o por cron).
      </p>
      {msg && <p className="mb-3 rounded-lg bg-green-50 p-2 text-green-700 text-sm">{msg}</p>}

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Disparador</th>
              <th className="gx-th">Campaña</th>
              <th className="gx-th">Canal</th>
              <th className="gx-th">Activo</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {flows.length === 0 ? (
              <tr>
                <td className="gx-td text-slate-400" colSpan={5}>
                  Sin automatizaciones. Crea la primera.
                </td>
              </tr>
            ) : (
              flows.map((f) => (
                <tr key={f.id} className={f.isActive ? "" : "opacity-50"}>
                  <td className="gx-td font-medium">
                    {labelEvento(f.evento)}
                    {f.dias ? <span className="text-slate-400"> · {f.dias} días</span> : null}
                  </td>
                  <td className="gx-td text-slate-600">{f.campanaNombre}</td>
                  <td className="gx-td">{f.canal}</td>
                  <td className="gx-td">
                    <button
                      type="button"
                      onClick={() => toggle(f)}
                      className={f.isActive ? "gx-badge-ok" : "gx-badge-info"}
                    >
                      {f.isActive ? "Activo" : "Pausado"}
                    </button>
                  </td>
                  <td className="gx-td text-right">
                    <button
                      type="button"
                      onClick={() => eliminar(f)}
                      className="text-red-500 text-sm hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nuevo && (
        <NuevoFlowModal
          eventos={eventos}
          campanas={campanas}
          onClose={() => setNuevo(false)}
          onDone={() => {
            setNuevo(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function NuevoFlowModal({
  eventos,
  campanas,
  onClose,
  onDone,
}: {
  eventos: EventoFlow[];
  campanas: Campana[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [evento, setEvento] = useState(eventos[0]?.evento ?? "cliente_nuevo");
  const [campanaId, setCampanaId] = useState(campanas[0]?.id ?? "");
  const [dias, setDias] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const usaDias = eventos.find((e) => e.evento === evento)?.usaDias ?? false;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/t/campanas/flows", {
        body: { evento, campanaId, ...(usaDias ? { dias: Number(dias) } : {}) },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear");
    }
  }

  return (
    <div className="gx-modal-overlay">
      <form onSubmit={guardar} className="gx-modal-panel">
        <h2 className="mb-4 font-bold text-lg text-slate-800">Nueva automatización</h2>
        {campanas.length === 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 p-2 text-amber-700 text-sm">
            Primero crea una campaña (con su mensaje) en Marketing/Campañas.
          </p>
        )}
        <label className="mb-3 block">
          <span className="gx-label">Cuándo (disparador)</span>
          <select value={evento} onChange={(e) => setEvento(e.target.value)} className="gx-input">
            {eventos.map((ev) => (
              <option key={ev.evento} value={ev.evento}>
                {ev.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Qué manda (campaña)</span>
          <select
            value={campanaId}
            onChange={(e) => setCampanaId(e.target.value)}
            className="gx-input"
            required
          >
            {campanas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {usaDias && (
          <label className="mb-3 block">
            <span className="gx-label">Días sin comprar</span>
            <input
              type="number"
              min="1"
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              className="gx-input"
            />
          </label>
        )}
        {error && <p className="mb-3 text-danger text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={!campanaId} className="gx-btn-primary">
            Crear
          </button>
        </div>
      </form>
    </div>
  );
}
