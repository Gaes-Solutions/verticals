import { type FormEvent, useEffect, useState } from "react";
import { type Sujeto, SujetoBuscador } from "../components/SujetoBuscador.js";
import { ApiError, api, getUsuario, puede } from "../lib/api.js";

interface Sucursal {
  id: string;
  codigo: string;
  nombre?: string | null;
}
interface Diagnostico {
  id: string;
  codigoCie10: string;
  nombreEs: string;
}
interface ConsultaLite {
  id: string;
  fechaConsulta: string;
  estado: string;
  motivoConsulta?: string | null;
  diagnosticoPrincipalTexto?: string | null;
}

const TIPOS = [
  ["primera_vez", "Primera vez"],
  ["seguimiento", "Seguimiento"],
  ["urgencia", "Urgencia"],
  ["control_post_cirugia", "Control post-cirugía"],
  ["telemedicina", "Telemedicina"],
] as const;
const PRONOSTICOS = [
  ["desconocido", "Desconocido"],
  ["favorable", "Favorable"],
  ["reservado", "Reservado"],
  ["grave", "Grave"],
] as const;

export function ExpedienteSoapPage() {
  const [sujeto, setSujeto] = useState<Sujeto | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-bold text-2xl text-slate-800">Consulta SOAP</h1>
      <p className="mb-4 text-slate-500 text-sm">Expediente clínico del paciente</p>

      {!sujeto ? (
        <SujetoBuscador onSelect={setSujeto} />
      ) : (
        <Consulta sujeto={sujeto} onCambiar={() => setSujeto(null)} />
      )}
    </div>
  );
}

function Consulta({ sujeto, onCambiar }: { sujeto: Sujeto; onCambiar: () => void }) {
  const [previas, setPrevias] = useState<ConsultaLite[]>([]);
  const [recargar, setRecargar] = useState(0);
  const filtro = sujeto.tipo === "mascota" ? "mascotaId" : "pacienteId";

  useEffect(() => {
    api<{ items: ConsultaLite[] }>(`/t/consultas?${filtro}=${sujeto.id}&pageSize=10`)
      .then((r) => setPrevias(r.items ?? []))
      .catch(() => setPrevias([]));
  }, [sujeto.id, filtro, recargar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
        <div>
          <p className="font-bold text-slate-800">
            {sujeto.tipo === "mascota" ? "🐾" : "👤"} {sujeto.nombre}
          </p>
          <p className="text-slate-500 text-sm capitalize">
            {sujeto.subtitulo} · {sujeto.numeroExpediente}
          </p>
        </div>
        <button type="button" onClick={onCambiar} className="gx-btn-secondary">
          Cambiar paciente
        </button>
      </div>

      {previas.length > 0 && (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-slate-700 text-sm">Consultas previas</h2>
          <ul className="flex flex-col gap-1">
            {previas.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {new Date(c.fechaConsulta).toLocaleDateString("es-MX")} ·{" "}
                  {c.motivoConsulta ?? c.diagnosticoPrincipalTexto ?? "—"}
                </span>
                <span className={c.estado === "firmada" ? "gx-badge-ok" : "gx-badge-info"}>
                  {c.estado}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SoapForm sujeto={sujeto} onGuardada={() => setRecargar((n) => n + 1)} />
    </div>
  );
}

function DiagnosticoAutocomplete({
  vertical,
  onSelect,
  seleccionado,
}: {
  vertical: "vet" | "humano";
  onSelect: (d: Diagnostico | null) => void;
  seleccionado: Diagnostico | null;
}) {
  const [catalogo, setCatalogo] = useState<Diagnostico[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    api<Diagnostico[]>(`/t/consultas/diagnosticos/catalogo?vertical=${vertical}`)
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, [vertical]);

  if (seleccionado) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <span>
          <span className="font-mono text-slate-400 text-xs">{seleccionado.codigoCie10}</span>{" "}
          {seleccionado.nombreEs}
        </span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-slate-400 hover:text-danger"
        >
          quitar
        </button>
      </div>
    );
  }

  const filtro = q.trim().toLowerCase();
  const sugerencias = filtro
    ? catalogo
        .filter(
          (d) =>
            d.nombreEs.toLowerCase().includes(filtro) ||
            d.codigoCie10.toLowerCase().includes(filtro),
        )
        .slice(0, 8)
    : [];

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar diagnóstico CIE-10…"
        className="gx-input"
      />
      {sugerencias.length > 0 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
          {sugerencias.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                onSelect(d);
                setQ("");
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-mono text-slate-400 text-xs">{d.codigoCie10}</span> {d.nombreEs}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Signos {
  pesoKg: string;
  temperaturaC: string;
  frecuenciaCardiaca: string;
  frecuenciaRespiratoria: string;
  saturacionO2: string;
  glucosaMgDl: string;
}
const SIGNOS_VACIO: Signos = {
  pesoKg: "",
  temperaturaC: "",
  frecuenciaCardiaca: "",
  frecuenciaRespiratoria: "",
  saturacionO2: "",
  glucosaMgDl: "",
};
const SIGNOS_CAMPOS: { key: keyof Signos; label: string }[] = [
  { key: "pesoKg", label: "Peso (kg)" },
  { key: "temperaturaC", label: "Temp (°C)" },
  { key: "frecuenciaCardiaca", label: "FC (lpm)" },
  { key: "frecuenciaRespiratoria", label: "FR (rpm)" },
  { key: "saturacionO2", label: "SpO₂ (%)" },
  { key: "glucosaMgDl", label: "Glucosa" },
];

function signosNumericos(s: Signos): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { key } of SIGNOS_CAMPOS) {
    const n = Number.parseFloat(s[key]);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

function SoapForm({ sujeto, onGuardada }: { sujeto: Sujeto; onGuardada: () => void }) {
  const [tipo, setTipo] = useState("seguimiento");
  const [motivoConsulta, setMotivo] = useState("");
  const [sintomas, setSintomas] = useState("");
  const [signos, setSignos] = useState<Signos>(SIGNOS_VACIO);
  const [exploracion, setExploracion] = useState("");
  const [dx, setDx] = useState<Diagnostico | null>(null);
  const [dxTexto, setDxTexto] = useState("");
  const [pronostico, setPronostico] = useState("desconocido");
  const [plan, setPlan] = useState("");
  const [controlDias, setControlDias] = useState("");
  const [resumenTutor, setResumenTutor] = useState("");

  const [creadaId, setCreadaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const medicoUsuarioId = getUsuario()?.id;
    if (!medicoUsuarioId) {
      setError("No se pudo identificar al médico en sesión. Vuelve a entrar.");
      setBusy(false);
      return;
    }
    try {
      const sucursales = await api<Sucursal[]>("/t/sucursales");
      const sucursalId = sucursales[0]?.id;
      if (!sucursalId) {
        setError("No hay sucursal configurada.");
        setBusy(false);
        return;
      }
      const sv = signosNumericos(signos);
      const creada = await api<{ id: string }>("/t/consultas", {
        body: {
          [sujeto.tipo === "mascota" ? "mascotaId" : "pacienteId"]: sujeto.id,
          medicoUsuarioId,
          sucursalId,
          tipo,
          pronostico,
          ...(motivoConsulta ? { motivoConsulta } : {}),
          ...(sintomas.trim()
            ? {
                sintomas: sintomas
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }
            : {}),
          ...(Object.keys(sv).length > 0 ? { signosVitales: sv } : {}),
          ...(exploracion ? { exploracionAparatos: { general: exploracion } } : {}),
          ...(dx ? { diagnosticoPrincipalId: dx.id } : {}),
          ...(!dx && dxTexto ? { diagnosticoPrincipalTexto: dxTexto } : {}),
          ...(plan ? { planTratamiento: plan } : {}),
          ...(controlDias ? { siguienteControlDias: Number.parseInt(controlDias, 10) } : {}),
          ...(resumenTutor ? { resumenParaTutor: resumenTutor } : {}),
        },
      });
      setCreadaId(creada.id);
      onGuardada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la consulta");
    } finally {
      setBusy(false);
    }
  }

  async function firmar() {
    if (!creadaId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/t/consultas/${creadaId}/firmar`, { method: "POST", body: {} });
      setCreadaId(null);
      reset();
      onGuardada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo firmar");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMotivo("");
    setSintomas("");
    setSignos(SIGNOS_VACIO);
    setExploracion("");
    setDx(null);
    setDxTexto("");
    setPlan("");
    setControlDias("");
    setResumenTutor("");
  }

  if (creadaId) {
    return (
      <div className="rounded-xl bg-white p-5 text-center shadow-sm">
        <p className="mb-1 font-semibold text-emerald-600">Consulta guardada (borrador)</p>
        <p className="mb-4 text-slate-500 text-sm">
          Revisa y firma para hacerla parte del expediente (no se podrá editar después; se corrige
          con una enmienda).
        </p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCreadaId(null);
              reset();
            }}
            className="gx-btn-secondary"
          >
            Nueva consulta
          </button>
          {puede("consultas.firmar") && (
            <button type="button" onClick={firmar} disabled={busy} className="gx-btn-primary">
              {busy ? "Firmando…" : "Firmar consulta"}
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-danger text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="gx-label">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="gx-input">
            {TIPOS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="gx-label">Pronóstico</span>
          <select
            value={pronostico}
            onChange={(e) => setPronostico(e.target.value)}
            className="gx-input"
          >
            {PRONOSTICOS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span className="gx-label">S · Subjetivo — motivo y síntomas</span>
        <textarea
          value={motivoConsulta}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          placeholder="Motivo de la consulta"
          className="gx-input"
        />
        <input
          value={sintomas}
          onChange={(e) => setSintomas(e.target.value)}
          placeholder="Síntomas (separados por coma)"
          className="gx-input mt-2"
        />
      </div>

      <div>
        <span className="gx-label">O · Objetivo — signos vitales</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SIGNOS_CAMPOS.map((c) => (
            <input
              key={c.key}
              type="number"
              step="0.1"
              value={signos[c.key]}
              onChange={(e) => setSignos((s) => ({ ...s, [c.key]: e.target.value }))}
              placeholder={c.label}
              className="gx-input"
            />
          ))}
        </div>
        <textarea
          value={exploracion}
          onChange={(e) => setExploracion(e.target.value)}
          rows={2}
          placeholder="Exploración física"
          className="gx-input mt-2"
        />
      </div>

      <div>
        <span className="gx-label">A · Análisis — diagnóstico</span>
        <DiagnosticoAutocomplete
          vertical={sujeto.tipo === "mascota" ? "vet" : "humano"}
          onSelect={setDx}
          seleccionado={dx}
        />
        {!dx && (
          <input
            value={dxTexto}
            onChange={(e) => setDxTexto(e.target.value)}
            placeholder="…o escribe un diagnóstico libre"
            className="gx-input mt-2"
          />
        )}
      </div>

      <div>
        <span className="gx-label">P · Plan — tratamiento</span>
        <textarea
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          rows={3}
          placeholder="Plan de tratamiento e indicaciones"
          className="gx-input"
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            type="number"
            min="0"
            value={controlDias}
            onChange={(e) => setControlDias(e.target.value)}
            placeholder="Próximo control (días)"
            className="gx-input"
          />
        </div>
        <textarea
          value={resumenTutor}
          onChange={(e) => setResumenTutor(e.target.value)}
          rows={2}
          placeholder="Resumen para el tutor (lenguaje simple)"
          className="gx-input mt-2"
        />
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="gx-btn-primary">
          {busy ? "Guardando…" : "Guardar consulta"}
        </button>
      </div>
    </form>
  );
}
