import { useCallback, useEffect, useState } from "react";
import { ApiError, api, getUsuario } from "../lib/api.js";

const TIPOS = [
  ["veterinario", "Veterinario"],
  ["medico_humano", "Médico"],
  ["dentista", "Dentista"],
  ["nutriologo", "Nutriólogo"],
  ["psicologo", "Psicólogo"],
] as const;

const STATUS_BADGE: Record<string, string> = {
  borrador: "gx-badge-info",
  en_revision: "gx-badge-warn",
  publicado: "gx-badge-ok",
  suspendido: "gx-badge-danger",
  desactivado: "gx-badge-danger",
};
const STATUS_LABEL: Record<string, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  publicado: "Publicado",
  suspendido: "Suspendido",
  desactivado: "Desactivado",
};

interface Ubicacion {
  id: string;
  nombreLugar: string;
  ciudad: string;
  estado: string;
  esPrincipal: boolean;
}
interface Perfil {
  id: string;
  tipo: string;
  nombrePublico: string;
  slugSeo: string;
  cedulaProfesional?: string | null;
  especialidades: string[];
  bioCorta?: string | null;
  bioLarga?: string | null;
  anosExperiencia?: number | null;
  aceptaTelemedicina: boolean;
  status: string;
  ubicaciones: Ubicacion[];
}
interface Resena {
  id: string;
  ratingGeneral: number;
  comentario?: string | null;
  respuestaMedico?: string | null;
  moderacionStatus: string;
}

export function MarketplacePerfilPage() {
  const [medicoLocalId, setMedicoLocalId] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarPerfil = useCallback((medId: string) => {
    api<Perfil>(`/t/marketplace/perfil/by-medico/${medId}`)
      .then(setPerfil)
      .catch(() => setPerfil(null))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    const userId = getUsuario()?.id;
    if (!userId) {
      setCargando(false);
      return;
    }
    // El perfil de marketplace se liga al registro Medico (no al Usuario).
    api<{ id: string }>(`/t/medicos/${userId}`)
      .then((m) => {
        setMedicoLocalId(m.id);
        cargarPerfil(m.id);
      })
      .catch(async () => {
        // Aún no hay ficha médica: la creamos vacía para poder publicar perfil.
        try {
          const m = await api<{ id: string }>(`/t/medicos/${userId}`, { method: "PUT", body: {} });
          setMedicoLocalId(m.id);
          cargarPerfil(m.id);
        } catch {
          setError("No se pudo cargar tu ficha médica.");
          setCargando(false);
        }
      });
  }, [cargarPerfil]);

  if (cargando) return <p className="text-slate-400">Cargando…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-bold text-2xl text-slate-800">Mi perfil público</h1>
        <p className="text-slate-500 text-sm">
          Publícate en el directorio para recibir citas de pacientes nuevos.
        </p>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-600 text-sm">{error}</p>}
      {medicoLocalId && (
        <PerfilForm
          medicoLocalId={medicoLocalId}
          perfil={perfil}
          onGuardado={() => cargarPerfil(medicoLocalId)}
        />
      )}
      {perfil && (
        <>
          <UbicacionesSeccion perfil={perfil} onChange={() => cargarPerfil(perfil.id)} />
          <ResenasSeccion perfilId={perfil.id} />
        </>
      )}
    </div>
  );
}

function PerfilForm({
  medicoLocalId,
  perfil,
  onGuardado,
}: {
  medicoLocalId: string;
  perfil: Perfil | null;
  onGuardado: () => void;
}) {
  const [tipo, setTipo] = useState(perfil?.tipo ?? "veterinario");
  const [nombre, setNombre] = useState(perfil?.nombrePublico ?? getUsuario()?.nombre ?? "");
  const [cedula, setCedula] = useState(perfil?.cedulaProfesional ?? "");
  const [especialidades, setEspecialidades] = useState((perfil?.especialidades ?? []).join(", "));
  const [bioCorta, setBioCorta] = useState(perfil?.bioCorta ?? "");
  const [anos, setAnos] = useState(perfil?.anosExperiencia?.toString() ?? "");
  const [tele, setTele] = useState(perfil?.aceptaTelemedicina ?? false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function construirBody(): Record<string, unknown> {
    const esp = especialidades
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const body: Record<string, unknown> = {
      medicoIdLocal: medicoLocalId,
      tipo,
      nombrePublico: nombre,
      aceptaTelemedicina: tele,
    };
    if (cedula) body.cedulaProfesional = cedula;
    if (esp.length) body.especialidades = esp;
    if (bioCorta) body.bioCorta = bioCorta;
    if (anos) body.anosExperiencia = Number.parseInt(anos, 10);
    return body;
  }

  async function guardar() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/t/marketplace/perfil", { method: "POST", body: construirBody() });
      setMsg("Guardado.");
      onGuardado();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function enviarRevision() {
    if (!perfil) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/t/marketplace/perfil/${perfil.id}/enviar-revision`, { method: "POST", body: {} });
      setMsg("Enviado a revisión. GaesSoft validará tu cédula.");
      onGuardado();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "No se pudo enviar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-800">Datos del perfil</h2>
        {perfil && (
          <span className={STATUS_BADGE[perfil.status] ?? "gx-badge-info"}>
            {STATUS_LABEL[perfil.status] ?? perfil.status}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <span className="gx-label">Nombre público</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="gx-input" />
        </label>
        <label className="block">
          <span className="gx-label">Cédula profesional</span>
          <input value={cedula} onChange={(e) => setCedula(e.target.value)} className="gx-input" />
        </label>
        <label className="block">
          <span className="gx-label">Años de experiencia</span>
          <input
            type="number"
            value={anos}
            onChange={(e) => setAnos(e.target.value)}
            className="gx-input"
          />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="gx-label">Especialidades (separadas por coma)</span>
        <input
          value={especialidades}
          onChange={(e) => setEspecialidades(e.target.value)}
          className="gx-input"
        />
      </label>
      <label className="mt-3 block">
        <span className="gx-label">Presentación (bio corta)</span>
        <textarea
          value={bioCorta}
          onChange={(e) => setBioCorta(e.target.value)}
          rows={3}
          className="gx-input"
        />
      </label>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={tele}
          onChange={(e) => setTele(e.target.checked)}
          className="h-4 w-4 accent-brand"
        />
        <span className="text-slate-600">Ofrezco telemedicina (videoconsulta)</span>
      </label>

      {msg && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-slate-600 text-sm">{msg}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {perfil?.status === "borrador" && (
          <button
            type="button"
            onClick={enviarRevision}
            disabled={busy || !perfil.cedulaProfesional}
            className="gx-btn-secondary"
            title={perfil.cedulaProfesional ? "" : "Agrega tu cédula antes de enviar"}
          >
            Enviar a revisión
          </button>
        )}
        <button
          type="button"
          onClick={guardar}
          disabled={busy || !nombre}
          className="gx-btn-primary"
        >
          {busy ? "Guardando…" : perfil ? "Guardar cambios" : "Crear perfil"}
        </button>
      </div>
    </section>
  );
}

function UbicacionesSeccion({ perfil, onChange }: { perfil: Perfil; onChange: () => void }) {
  const [nombreLugar, setNombreLugar] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [estado, setEstado] = useState("");
  const [busy, setBusy] = useState(false);

  async function agregar() {
    if (!nombreLugar || !ciudad || !estado) return;
    setBusy(true);
    await api(`/t/marketplace/perfil/${perfil.id}/ubicaciones`, {
      method: "POST",
      body: { nombreLugar, ciudad, estado, esPrincipal: perfil.ubicaciones.length === 0 },
    }).catch(() => undefined);
    setNombreLugar("");
    setCiudad("");
    setEstado("");
    setBusy(false);
    onChange();
  }

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-800">Consultorios</h2>
      {perfil.ubicaciones.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-1">
          {perfil.ubicaciones.map((u) => (
            <li key={u.id} className="text-slate-600 text-sm">
              <span className="font-medium">{u.nombreLugar}</span> · {u.ciudad}, {u.estado}
              {u.esPrincipal && <span className="ml-2 gx-badge-info">principal</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-slate-400 text-sm">Agrega al menos un consultorio.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={nombreLugar}
          onChange={(e) => setNombreLugar(e.target.value)}
          placeholder="Nombre del consultorio"
          className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          value={ciudad}
          onChange={(e) => setCiudad(e.target.value)}
          placeholder="Ciudad"
          className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <input
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          placeholder="Estado"
          className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button type="button" onClick={agregar} disabled={busy} className="gx-btn-secondary">
          Agregar
        </button>
      </div>
    </section>
  );
}

function ResenasSeccion({ perfilId }: { perfilId: string }) {
  const [items, setItems] = useState<Resena[]>([]);
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  const cargar = useCallback(() => {
    api<Resena[]>(`/t/marketplace/perfil/${perfilId}/resenas`)
      .then((r) => setItems(r ?? []))
      .catch(() => setItems([]));
  }, [perfilId]);
  useEffect(() => cargar(), [cargar]);

  async function responder(reviewId: string) {
    if (texto.trim().length < 1) return;
    await api(`/t/marketplace/perfil/${perfilId}/resenas/${reviewId}/responder`, {
      method: "POST",
      body: { respuesta: texto.trim() },
    }).catch(() => undefined);
    setRespondiendo(null);
    setTexto("");
    cargar();
  }

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-800">Reseñas recibidas</h2>
      {items.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no tienes reseñas.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((r) => (
            <li key={r.id} className="border-slate-100 border-b pb-3 last:border-0">
              <p className="text-amber-500 text-sm">{"★".repeat(r.ratingGeneral)}</p>
              {r.comentario && <p className="text-slate-600 text-sm">{r.comentario}</p>}
              {r.respuestaMedico ? (
                <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-slate-500 text-xs">
                  Tu respuesta: {r.respuestaMedico}
                </p>
              ) : respondiendo === r.id ? (
                <div className="mt-2">
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={2}
                    placeholder="Responde con profesionalismo…"
                    className="gx-input"
                  />
                  <div className="mt-1 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRespondiendo(null)}
                      className="text-slate-400 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => responder(r.id)}
                      className="text-brand text-xs"
                    >
                      Publicar respuesta
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRespondiendo(r.id)}
                  className="mt-1 text-brand text-xs hover:underline"
                >
                  Responder
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
