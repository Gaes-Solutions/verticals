import { type FormEvent, useState } from "react";
import { ApiError, type PacienteSesion, api, setPaciente } from "../lib/api.js";

/**
 * Identificación del paciente en 2 pasos: (1) datos + solicitar código,
 * (2) verificar el código (OTP) enviado por correo. En dev el backend devuelve
 * `otpDev` para poder probar sin correo real.
 */
export function IdentidadModal({
  onClose,
  onListo,
}: {
  onClose: () => void;
  onListo: (p: PacienteSesion) => void;
}) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [codigo, setCodigo] = useState("");
  const [pacienteId, setPacienteId] = useState("");
  const [otpDev, setOtpDev] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function solicitar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: string; otpDev?: string }>("/marketplace/pacientes/registro", {
        body: {
          email: email.trim().toLowerCase(),
          nombre: nombre.trim(),
          ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
        },
      });
      setPacienteId(r.id);
      setOtpDev(r.otpDev ?? null);
      setPaso(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar");
    } finally {
      setBusy(false);
    }
  }

  async function verificar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: string; verificado: boolean }>("/marketplace/pacientes/confirmar", {
        body: { email: email.trim().toLowerCase(), codigo: codigo.trim() },
      });
      const sesion: PacienteSesion = {
        id: r.id || pacienteId,
        email: email.trim().toLowerCase(),
        nombre: nombre.trim(),
        verificado: r.verificado,
      };
      setPaciente(sesion);
      onListo(sesion);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código incorrecto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">
          {paso === 1 ? "Identifícate para reservar" : "Verifica tu correo"}
        </h2>
        {paso === 1 ? (
          <form onSubmit={solicitar}>
            <p className="mb-3 text-slate-500 text-sm">
              Te enviaremos un código a tu correo para confirmar tu identidad.
            </p>
            <label className="mb-3 block">
              <span className="gx-label">Correo</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="gx-input"
                required
              />
            </label>
            <label className="mb-3 block">
              <span className="gx-label">Nombre</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="gx-input"
                required
              />
            </label>
            <label className="mb-3 block">
              <span className="gx-label">Teléfono (opcional)</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="gx-input"
              />
            </label>
            {error && <p className="mb-3 text-danger text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="gx-btn-secondary">
                Cancelar
              </button>
              <button type="submit" disabled={busy || !email || !nombre} className="gx-btn-primary">
                {busy ? "Enviando…" : "Enviar código"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={verificar}>
            <p className="mb-3 text-slate-500 text-sm">
              Escribe el código de 6 dígitos que enviamos a <strong>{email}</strong>.
            </p>
            {otpDev && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-700 text-xs">
                Modo demo · tu código es <strong>{otpDev}</strong>
              </p>
            )}
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              className="gx-input mb-3 text-center tracking-[0.4em]"
              required
            />
            {error && <p className="mb-3 text-danger text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPaso(1)} className="gx-btn-secondary">
                Atrás
              </button>
              <button
                type="submit"
                disabled={busy || codigo.trim().length < 4}
                className="gx-btn-primary"
              >
                {busy ? "Verificando…" : "Verificar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
