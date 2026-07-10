import { type FormEvent, useCallback, useEffect, useState } from "react";
import { nombrePaciente } from "../components/PacienteBuscador.js";
import { ApiError, api, puede } from "../lib/api.js";

const SEXOS = [
  ["no_especificado", "Sin especificar"],
  ["masculino", "Masculino"],
  ["femenino", "Femenino"],
  ["otro", "Otro"],
] as const;

interface Paciente {
  id: string;
  numeroExpediente: string;
  nombre: string;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  sexo: string;
  fechaNacimiento?: string | null;
  curp?: string | null;
  telefonoPrincipal?: string | null;
  emailPrincipal?: string | null;
  tipoSangre?: string | null;
  alergias?: string[];
  medicamentosCronicos?: string[];
  contactoEmergenciaNombre?: string | null;
  contactoEmergenciaTel?: string | null;
  medicoAsignado?: { id: string; nombre: string } | null;
  _count?: { consultas: number; citas: number; recetas: number };
}

function edad(fecha?: string | null): string {
  if (!fecha) return "edad n/d";
  const meses = Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 2.628e9));
  if (meses < 24) return `${meses} m`;
  return `${Math.floor(meses / 12)} años`;
}

export function PacientesPage() {
  const [q, setQ] = useState("");
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    const qs = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
    api<{ items: Paciente[] }>(`/t/pacientes?pageSize=50${qs}`)
      .then((r) => setPacientes(r.items ?? []))
      .catch(() => setPacientes([]))
      .finally(() => setCargando(false));
  }, [q]);
  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Pacientes</h1>
          <p className="text-slate-500 text-sm">Pacientes humanos</p>
        </div>
        {puede("pacientes.crear") && (
          <button type="button" onClick={() => setNuevo(true)} className="gx-btn-primary">
            + Nuevo paciente
          </button>
        )}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, CURP, expediente o teléfono…"
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
      />

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : pacientes.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
          {q.trim() ? "Sin resultados." : "Aún no hay pacientes registrados."}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {pacientes.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setDetalleId(p.id)}
              className="rounded-xl bg-white p-4 text-left shadow-sm hover:ring-1 hover:ring-brand"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">{nombrePaciente(p)}</span>
                <span className="text-slate-400 text-xs">{p.numeroExpediente}</span>
              </div>
              <p className="text-slate-500 text-sm">
                {edad(p.fechaNacimiento)}
                {p.telefonoPrincipal ? ` · ${p.telefonoPrincipal}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}

      {nuevo && (
        <NuevoPacienteModal
          onClose={() => setNuevo(false)}
          onDone={() => {
            setNuevo(false);
            cargar();
          }}
        />
      )}
      {detalleId && <DetallePaciente id={detalleId} onClose={() => setDetalleId(null)} />}
    </div>
  );
}

function NuevoPacienteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [nombre, setNombre] = useState("");
  const [apellidoPaterno, setApPaterno] = useState("");
  const [apellidoMaterno, setApMaterno] = useState("");
  const [sexo, setSexo] = useState("no_especificado");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [curp, setCurp] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [tipoSangre, setTipoSangre] = useState("");
  const [alergias, setAlergias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function construirBody(): Record<string, unknown> {
    const alergiasArr = alergias
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const opcionales: Record<string, unknown> = {
      apellidoPaterno,
      apellidoMaterno,
      fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento).toISOString() : "",
      curp: curp ? curp.toUpperCase() : "",
      telefonoPrincipal: telefono,
      emailPrincipal: email,
      tipoSangre,
    };
    const body: Record<string, unknown> = { nombre, sexo };
    for (const [k, v] of Object.entries(opcionales)) if (v) body[k] = v;
    if (alergiasArr.length) body.alergias = alergiasArr;
    return body;
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api("/t/pacientes", { body: construirBody() });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <form onSubmit={guardar} className="gx-modal-panel max-h-[90vh] overflow-y-auto">
        <h2 className="mb-3 font-bold text-lg text-slate-800">Nuevo paciente</h2>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="gx-label">Nombre(s)</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="gx-input"
              required
            />
          </label>
          <label className="block">
            <span className="gx-label">Apellido paterno</span>
            <input
              value={apellidoPaterno}
              onChange={(e) => setApPaterno(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Apellido materno</span>
            <input
              value={apellidoMaterno}
              onChange={(e) => setApMaterno(e.target.value)}
              className="gx-input"
            />
          </label>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="gx-label">Sexo</span>
            <select value={sexo} onChange={(e) => setSexo(e.target.value)} className="gx-input">
              {SEXOS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="gx-label">Nacimiento</span>
            <input
              type="date"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Tipo de sangre</span>
            <input
              value={tipoSangre}
              onChange={(e) => setTipoSangre(e.target.value)}
              placeholder="O+"
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">CURP</span>
            <input
              value={curp}
              onChange={(e) => setCurp(e.target.value)}
              className="gx-input uppercase"
            />
          </label>
        </div>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="gx-label">Teléfono</span>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="gx-input"
            />
          </label>
        </div>
        <label className="mb-3 block">
          <span className="gx-label">Alergias (separadas por coma)</span>
          <input
            value={alergias}
            onChange={(e) => setAlergias(e.target.value)}
            placeholder="Penicilina, mariscos…"
            className="gx-input"
          />
        </label>

        {error && <p className="mb-3 text-danger text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={guardando || !nombre} className="gx-btn-primary">
            {guardando ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DetallePaciente({ id, onClose }: { id: string; onClose: () => void }) {
  const [p, setP] = useState<Paciente | null>(null);
  useEffect(() => {
    api<Paciente>(`/t/pacientes/${id}`)
      .then(setP)
      .catch(() => setP(null));
  }, [id]);

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        {!p ? (
          <p className="text-slate-400">Cargando…</p>
        ) : (
          <>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-bold text-lg text-slate-800">{nombrePaciente(p)}</h2>
                <p className="text-slate-500 text-sm capitalize">
                  {p.sexo.replace(/_/g, " ")} · {edad(p.fechaNacimiento)}
                </p>
                <p className="text-slate-400 text-xs">
                  {p.numeroExpediente}
                  {p.curp ? ` · ${p.curp}` : ""}
                </p>
              </div>
              {p.tipoSangre && (
                <span className="rounded-lg bg-red-50 px-3 py-1 font-semibold text-red-600 text-sm">
                  {p.tipoSangre}
                </span>
              )}
            </div>

            {(p.telefonoPrincipal || p.emailPrincipal) && (
              <p className="mb-2 text-slate-600 text-sm">
                {p.telefonoPrincipal ?? ""}
                {p.telefonoPrincipal && p.emailPrincipal ? " · " : ""}
                {p.emailPrincipal ?? ""}
              </p>
            )}
            {p.alergias && p.alergias.length > 0 && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-red-600 text-sm">
                Alergias: {p.alergias.join(", ")}
              </p>
            )}
            {p.contactoEmergenciaNombre && (
              <p className="mb-2 text-slate-500 text-xs">
                Emergencia: {p.contactoEmergenciaNombre}
                {p.contactoEmergenciaTel ? ` · ${p.contactoEmergenciaTel}` : ""}
              </p>
            )}

            <div className="my-3 grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ["Consultas", p._count?.consultas],
                  ["Citas", p._count?.citas],
                  ["Recetas", p._count?.recetas],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="rounded-lg bg-slate-50 py-2">
                  <p className="font-bold text-slate-800">{n ?? 0}</p>
                  <p className="text-slate-400 text-xs">{label}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="gx-btn-secondary">
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
