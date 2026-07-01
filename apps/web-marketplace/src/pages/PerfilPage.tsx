import { ArrowLeft, BadgeCheck, MapPin, Star, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { navegar } from "../App.js";
import { ApiError, type PacienteSesion, api } from "../lib/api.js";
import { Estrellas, TIPO_LABEL } from "./SearchPage.js";

interface Ubicacion {
  id: string;
  nombreLugar: string;
  direccion?: string | null;
  ciudad: string;
  estado: string;
  telefonoPublico?: string | null;
}
interface Resena {
  id: string;
  verificada: boolean;
  ratingGeneral: number;
  comentario?: string | null;
  respuestaMedico?: string | null;
  publicadaAt?: string | null;
}
interface Perfil {
  id: string;
  slugSeo: string;
  nombrePublico: string;
  tipo: string;
  especialidades: string[];
  bioLarga?: string | null;
  bioCorta?: string | null;
  fotoPerfilUrl?: string | null;
  anosExperiencia?: number | null;
  scorePromedio: string;
  totalResenas: number;
  validadaSsaAt?: string | null;
  aceptaTelemedicina: boolean;
  ubicaciones: Ubicacion[];
  reviews: Resena[];
}

export function PerfilPage({
  slug,
  paciente,
  onPedirIdentidad,
}: {
  slug: string;
  paciente: PacienteSesion | null;
  onPedirIdentidad: () => void;
}) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [reservando, setReservando] = useState(false);

  useEffect(() => {
    api<Perfil>(`/marketplace/profesionales/${encodeURIComponent(slug)}`)
      .then(setPerfil)
      .catch(() => setNoEncontrado(true));
  }, [slug]);

  if (noEncontrado) {
    return (
      <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm">
        Profesional no encontrado.{" "}
        <button type="button" onClick={() => navegar("/")} className="text-brand">
          Volver
        </button>
      </div>
    );
  }
  if (!perfil) return <p className="text-slate-400">Cargando…</p>;

  return (
    <div>
      <button
        type="button"
        onClick={() => navegar("/")}
        className="mb-3 flex items-center gap-1 text-slate-500 text-sm hover:text-brand"
      >
        <ArrowLeft size={16} /> Volver a la búsqueda
      </button>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 font-bold text-3xl text-slate-400">
            {perfil.fotoPerfilUrl ? (
              <img
                src={perfil.fotoPerfilUrl}
                alt={perfil.nombrePublico}
                className="h-full w-full object-cover"
              />
            ) : (
              perfil.nombrePublico.slice(0, 1)
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-2xl text-slate-800">{perfil.nombrePublico}</h1>
              {perfil.validadaSsaAt && <BadgeCheck size={20} className="text-brand" />}
            </div>
            <p className="text-slate-500">
              {TIPO_LABEL[perfil.tipo] ?? perfil.tipo}
              {perfil.especialidades?.length ? ` · ${perfil.especialidades.join(", ")}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              {perfil.totalResenas > 0 ? (
                <span className="flex items-center gap-1">
                  <Estrellas score={Number(perfil.scorePromedio)} />
                  <span className="text-slate-400">({perfil.totalResenas} reseñas)</span>
                </span>
              ) : (
                <span className="text-slate-400">Sin reseñas aún</span>
              )}
              {perfil.anosExperiencia ? (
                <span className="text-slate-500">{perfil.anosExperiencia} años de experiencia</span>
              ) : null}
              {perfil.aceptaTelemedicina && (
                <span className="flex items-center gap-1 text-brand">
                  <Video size={15} /> Telemedicina
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={() => setReservando(true)} className="gx-btn-primary">
            Reservar cita
          </button>
        </div>

        {(perfil.bioLarga || perfil.bioCorta) && (
          <p className="mt-4 whitespace-pre-line text-slate-600 text-sm">
            {perfil.bioLarga ?? perfil.bioCorta}
          </p>
        )}
      </div>

      {perfil.ubicaciones.length > 0 && (
        <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-800">Consultorios</h2>
          <ul className="flex flex-col gap-2">
            {perfil.ubicaciones.map((u) => (
              <li key={u.id} className="flex items-start gap-2 text-sm">
                <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                <span className="text-slate-600">
                  <span className="font-medium text-slate-800">{u.nombreLugar}</span> ·{" "}
                  {u.direccion ? `${u.direccion}, ` : ""}
                  {u.ciudad}, {u.estado}
                  {u.telefonoPublico ? ` · ${u.telefonoPublico}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-800">Reseñas de pacientes</h2>
        {perfil.reviews.length === 0 ? (
          <p className="text-slate-400 text-sm">Aún no hay reseñas publicadas.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {perfil.reviews.map((r) => (
              <li key={r.id} className="border-slate-100 border-b pb-3 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5 text-amber-500">
                    {Array.from({ length: r.ratingGeneral }).map((_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: estrellas fijas
                      <Star key={i} size={13} fill="currentColor" />
                    ))}
                  </span>
                  {r.verificada && (
                    <span className="flex items-center gap-0.5 text-brand text-xs">
                      <BadgeCheck size={12} /> Cita verificada
                    </span>
                  )}
                </div>
                {r.comentario && <p className="mt-1 text-slate-600 text-sm">{r.comentario}</p>}
                {r.respuestaMedico && (
                  <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-slate-500 text-xs">
                    <span className="font-medium">Respuesta del profesional:</span>{" "}
                    {r.respuestaMedico}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {reservando && (
        <ReservarModal
          perfil={perfil}
          paciente={paciente}
          onPedirIdentidad={() => {
            setReservando(false);
            onPedirIdentidad();
          }}
          onClose={() => setReservando(false)}
        />
      )}
    </div>
  );
}

function ReservarModal({
  perfil,
  paciente,
  onPedirIdentidad,
  onClose,
}: {
  perfil: Perfil;
  paciente: PacienteSesion | null;
  onPedirIdentidad: () => void;
  onClose: () => void;
}) {
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("10:00");
  const [modalidad, setModalidad] = useState<"presencial" | "telemedicina">("presencial");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listo, setListo] = useState(false);

  async function reservar() {
    if (!paciente) {
      onPedirIdentidad();
      return;
    }
    if (!fecha) {
      setError("Elige una fecha.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/marketplace/profesionales/${perfil.id}/reservar`, {
        body: {
          pacienteMasterId: paciente.id,
          fechaHora: new Date(`${fecha}T${hora}:00`).toISOString(),
          modalidad,
          ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
        },
      });
      setListo(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo reservar");
      setBusy(false);
    }
  }

  if (listo) {
    return (
      <div className="gx-modal-overlay">
        <div className="gx-modal-panel text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">
            ✓
          </div>
          <h2 className="font-bold text-lg text-slate-800">¡Solicitud enviada!</h2>
          <p className="mt-1 text-slate-500 text-sm">
            {perfil.nombrePublico} confirmará tu cita. La verás en "Mis reservas".
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => navegar("/mis-reservas")}
              className="gx-btn-secondary"
            >
              Mis reservas
            </button>
            <button type="button" onClick={onClose} className="gx-btn-primary">
              Listo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">
          Reservar con {perfil.nombrePublico}
        </h2>
        {!paciente && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-700 text-sm">
            Necesitas identificarte para reservar.
          </p>
        )}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="gx-label">Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Hora</span>
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="gx-input"
            />
          </label>
        </div>
        <label className="mb-3 block">
          <span className="gx-label">Modalidad</span>
          <select
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value as "presencial" | "telemedicina")}
            className="gx-input"
          >
            <option value="presencial">Presencial</option>
            {perfil.aceptaTelemedicina && (
              <option value="telemedicina">Telemedicina (video)</option>
            )}
          </select>
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Motivo (opcional)</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Describe brevemente el motivo de tu consulta"
            className="gx-input"
          />
        </label>
        {error && <p className="mb-3 text-danger text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={reservar} disabled={busy} className="gx-btn-primary">
            {busy ? "Reservando…" : paciente ? "Confirmar reserva" : "Identificarme y reservar"}
          </button>
        </div>
      </div>
    </div>
  );
}
