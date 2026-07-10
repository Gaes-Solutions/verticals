import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";

const ESPECIES = ["perro", "gato", "ave", "conejo", "huron", "reptil", "pez", "roedor", "otro"];
const SEXOS = ["macho", "hembra", "desconocido"];

interface Tutor {
  id: string;
  nombre: string;
  apellidos?: string | null;
}
interface Mascota {
  id: string;
  numeroExpediente: string;
  nombre: string;
  especie: string;
  raza?: string | null;
  sexo: string;
  microchip?: string | null;
  pesoActualKg?: string | null;
  fechaNacimiento?: string | null;
  tutor?: Tutor | null;
  alergias?: string[];
  antecedentesPatologicos?: string[];
  _count?: { consultas: number; citas: number; recetas: number; vacunaciones: number };
}

function edad(fecha?: string | null): string {
  if (!fecha) return "edad n/d";
  const meses = Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 2.628e9));
  if (meses < 12) return `${meses} m`;
  const anos = Math.floor(meses / 12);
  return `${anos} año${anos > 1 ? "s" : ""}`;
}

export function ExpedientesPage() {
  const [q, setQ] = useState("");
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nueva, setNueva] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    const qs = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
    api<{ items: Mascota[] }>(`/t/mascotas?pageSize=50${qs}`)
      .then((r) => setMascotas(r.items ?? []))
      .catch(() => setMascotas([]))
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
          <h1 className="font-bold text-2xl text-slate-800">Expedientes</h1>
          <p className="text-slate-500 text-sm">Pacientes veterinarios (mascotas)</p>
        </div>
        {puede("mascotas.crear") && (
          <button type="button" onClick={() => setNueva(true)} className="gx-btn-primary">
            + Nueva mascota
          </button>
        )}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, microchip o raza…"
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
      />

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : mascotas.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
          {q.trim() ? "Sin resultados." : "Aún no hay mascotas registradas."}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {mascotas.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setDetalleId(m.id)}
              className="rounded-xl bg-white p-4 text-left shadow-sm hover:ring-1 hover:ring-brand"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{m.nombre}</span>
                <span className="text-slate-400 text-xs">{m.numeroExpediente}</span>
              </div>
              <p className="text-slate-500 text-sm capitalize">
                {m.especie}
                {m.raza ? ` · ${m.raza}` : ""} · {edad(m.fechaNacimiento)}
              </p>
              {m.tutor && (
                <p className="mt-0.5 text-slate-400 text-xs">
                  Tutor: {m.tutor.nombre} {m.tutor.apellidos ?? ""}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {nueva && (
        <NuevaMascotaModal
          onClose={() => setNueva(false)}
          onDone={() => {
            setNueva(false);
            cargar();
          }}
        />
      )}
      {detalleId && <DetalleMascota id={detalleId} onClose={() => setDetalleId(null)} />}
    </div>
  );
}

function TutorSelector({
  tutor,
  onChange,
}: {
  tutor: Tutor | null;
  onChange: (t: Tutor | null) => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Tutor[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ items: Tutor[] }>(`/t/clientes?pageSize=6&q=${encodeURIComponent(q.trim())}`)
        .then((r) => setResultados(r.items ?? []))
        .catch(() => setResultados([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (tutor) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <span>
          {tutor.nombre} {tutor.apellidos ?? ""}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-slate-400 hover:text-danger"
        >
          quitar
        </button>
      </div>
    );
  }
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar tutor (cliente)…"
        className="gx-input"
      />
      {resultados.length > 0 && (
        <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200">
          {resultados.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onChange(r);
                setQ("");
                setResultados([]);
              }}
              className="block w-full px-3 py-2 text-left text-slate-700 text-sm hover:bg-slate-50"
            >
              {r.nombre} {r.apellidos ?? ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NuevaMascotaModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [nombre, setNombre] = useState("");
  const [especie, setEspecie] = useState("perro");
  const [sexo, setSexo] = useState("desconocido");
  const [raza, setRaza] = useState("");
  const [peso, setPeso] = useState("");
  const [microchip, setMicrochip] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api("/t/mascotas", {
        body: {
          nombre,
          especie,
          sexo,
          ...(raza ? { raza } : {}),
          ...(peso ? { pesoActualKg: peso } : {}),
          ...(microchip ? { microchip } : {}),
          ...(fechaNacimiento ? { fechaNacimiento: new Date(fechaNacimiento).toISOString() } : {}),
          ...(tutor ? { tutorClienteId: tutor.id } : {}),
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <form onSubmit={guardar} className="gx-modal-panel">
        <h2 className="mb-3 font-bold text-lg text-slate-800">Nueva mascota</h2>
        <label className="mb-3 block">
          <span className="gx-label">Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="gx-input"
            required
          />
        </label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="gx-label">Especie</span>
            <select
              value={especie}
              onChange={(e) => setEspecie(e.target.value)}
              className="gx-input capitalize"
            >
              {ESPECIES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="gx-label">Sexo</span>
            <select
              value={sexo}
              onChange={(e) => setSexo(e.target.value)}
              className="gx-input capitalize"
            >
              {SEXOS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="gx-label">Raza</span>
            <input value={raza} onChange={(e) => setRaza(e.target.value)} className="gx-input" />
          </label>
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
            <span className="gx-label">Microchip</span>
            <input
              value={microchip}
              onChange={(e) => setMicrochip(e.target.value)}
              className="gx-input"
            />
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
        </div>
        <div className="mb-3">
          <span className="gx-label">Tutor (opcional)</span>
          <TutorSelector tutor={tutor} onChange={setTutor} />
        </div>

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

function DetalleMascota({ id, onClose }: { id: string; onClose: () => void }) {
  const [m, setM] = useState<Mascota | null>(null);
  useEffect(() => {
    api<Mascota>(`/t/mascotas/${id}`)
      .then(setM)
      .catch(() => setM(null));
  }, [id]);

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        {!m ? (
          <p className="text-slate-400">Cargando…</p>
        ) : (
          <>
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-lg text-slate-800">{m.nombre}</h2>
                <p className="text-slate-500 text-sm capitalize">
                  {m.especie}
                  {m.raza ? ` · ${m.raza}` : ""} · {m.sexo} · {edad(m.fechaNacimiento)}
                </p>
                <p className="text-slate-400 text-xs">{m.numeroExpediente}</p>
              </div>
              {m.pesoActualKg && (
                <span className="rounded-lg bg-slate-100 px-3 py-1 text-slate-600 text-sm">
                  {Number(m.pesoActualKg)} kg
                </span>
              )}
            </div>

            {m.tutor && (
              <p className="mb-2 text-slate-600 text-sm">
                Tutor: {m.tutor.nombre} {m.tutor.apellidos ?? ""}
              </p>
            )}
            {m.microchip && <p className="mb-2 text-slate-500 text-xs">Microchip: {m.microchip}</p>}
            {m.alergias && m.alergias.length > 0 && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-red-600 text-sm">
                Alergias: {m.alergias.join(", ")}
              </p>
            )}

            <div className="my-3 grid grid-cols-4 gap-2 text-center">
              {(
                [
                  ["Consultas", m._count?.consultas],
                  ["Citas", m._count?.citas],
                  ["Recetas", m._count?.recetas],
                  ["Vacunas", m._count?.vacunaciones],
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
