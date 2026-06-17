import { Lock, LockOpen, Stethoscope } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { BackupCodes } from "../components/BackupCodes.js";
import {
  ApiError,
  type MfaEstado,
  type Politica2fa,
  api,
  getPolitica2fa,
  mfaDisable,
  mfaEnroll,
  mfaEnrollConfirm,
  mfaEstado,
  mfaRegenerate,
  puede,
  putPolitica2fa,
} from "../lib/api.js";

interface Rol {
  id: string;
  codigo: string;
  nombre: string;
}

export function SeguridadPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-bold text-2xl text-slate-800">Seguridad</h1>
        <p className="text-slate-500 text-sm">Verificación en dos pasos (2FA) de tu cuenta.</p>
      </div>
      <Mi2fa />
      {puede("configuracion.actualizar") && <PoliticaEquipo />}
    </div>
  );
}

function Mi2fa() {
  const [estado, setEstado] = useState<MfaEstado | null>(null);
  const [fase, setFase] = useState<"idle" | "enroll" | "codes">("idle");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(() => {
    mfaEstado()
      .then(setEstado)
      .catch(() => setEstado(null));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function iniciarEnroll() {
    setError(null);
    setBusy(true);
    try {
      const s = await mfaEnroll();
      setSecret(s.secret);
      setOtpauthUrl(s.otpauthUrl);
      setFase("enroll");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmar() {
    setError(null);
    setBusy(true);
    try {
      const { backupCodes: bc } = await mfaEnrollConfirm(code);
      setBackupCodes(bc);
      setFase("codes");
      setCode("");
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Código incorrecto");
    } finally {
      setBusy(false);
    }
  }

  async function regenerar() {
    const c = window.prompt("Para regenerar tus códigos, escribe el código actual de tu app 2FA:");
    if (!c) return;
    try {
      const { backupCodes: bc } = await mfaRegenerate(c);
      setBackupCodes(bc);
      setFase("codes");
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "No se pudo regenerar");
    }
  }

  async function desactivar() {
    const p = window.prompt("Para desactivar tu 2FA, escribe tu contraseña:");
    if (!p) return;
    try {
      await mfaDisable(p);
      setFase("idle");
      cargar();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "No se pudo desactivar");
    }
  }

  if (fase === "codes") {
    return (
      <section className="rounded-xl border bg-white p-6">
        <BackupCodes codes={backupCodes} />
        <button
          type="button"
          onClick={() => setFase("idle")}
          className="mt-4 rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark"
        >
          Listo
        </button>
      </section>
    );
  }

  if (fase === "enroll") {
    return (
      <section className="rounded-xl border bg-white p-6">
        <h2 className="mb-2 font-bold text-lg text-slate-800">Activar 2FA</h2>
        <p className="mb-3 text-slate-600 text-sm">
          Escanea el código con Google Authenticator (o Authy) y escribe el código de 6 dígitos.
        </p>
        <div className="mb-3 flex justify-center">
          <QRCodeSVG value={otpauthUrl} size={168} />
        </div>
        <p className="mb-3 break-all text-center text-slate-400 text-xs">
          Clave manual: <span className="font-mono">{secret}</span>
        </p>
        <input
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-lg tracking-widest focus:border-brand focus:outline-none"
        />
        {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFase("idle")}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={busy || code.length < 6}
            className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "Activando…" : "Activar"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg text-slate-800">Mi verificación en dos pasos</h2>
          <p className="text-slate-500 text-sm">
            {estado?.enabled
              ? `Activa · ${estado.backupCodesRestantes} códigos de respaldo disponibles`
              : "Desactivada"}
            {estado?.requerido && (
              <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-700 text-xs">
                Requerida por tu negocio
              </span>
            )}
          </p>
        </div>
        <span className={estado?.enabled ? "text-marca" : "text-slate-300"}>
          {estado?.enabled ? <Lock size={28} /> : <LockOpen size={28} />}
        </span>
      </div>

      {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {!estado?.enabled && (
          <button
            type="button"
            onClick={iniciarEnroll}
            disabled={busy}
            className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            Activar 2FA
          </button>
        )}
        {estado?.enabled && (
          <>
            <button
              type="button"
              onClick={regenerar}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Regenerar códigos de respaldo
            </button>
            <button
              type="button"
              onClick={desactivar}
              disabled={estado.requerido}
              title={estado.requerido ? "Tu negocio exige 2FA para tu rol" : undefined}
              className="rounded-lg border border-red-200 px-4 py-2 text-red-600 text-sm hover:bg-red-50 disabled:opacity-40"
            >
              Desactivar
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function PoliticaEquipo() {
  const [pol, setPol] = useState<Politica2fa | null>(null);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPolitica2fa()
      .then(setPol)
      .catch(() => setPol(null));
    api<Rol[]>("/t/roles")
      .then(setRoles)
      .catch(() => setRoles([]));
  }, []);

  if (!pol) return null;

  function toggleRol(codigo: string) {
    setPol((p) => {
      if (!p) return p;
      const tiene = p.require2faRoles.includes(codigo);
      return {
        ...p,
        require2faRoles: tiene
          ? p.require2faRoles.filter((r) => r !== codigo)
          : [...p.require2faRoles, codigo],
      };
    });
  }

  async function guardar() {
    if (!pol) return;
    setError(null);
    try {
      const saved = await putPolitica2fa({
        require2faTodos: pol.require2faTodos,
        require2faRoles: pol.require2faRoles,
      });
      setPol({ ...saved, forzadoPorVertical: pol.forzadoPorVertical ?? false });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 1500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  }

  return (
    <section className="rounded-xl border bg-white p-6">
      <h2 className="font-bold text-lg text-slate-800">Política 2FA del equipo</h2>
      <p className="mb-4 text-slate-500 text-sm">
        El 2FA es opcional por usuario; aquí puedes exigirlo a todo el equipo o a roles específicos.
      </p>

      {pol.forzadoPorVertical && (
        <p className="mb-4 flex items-start gap-1.5 rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
          <Stethoscope size={16} className="mt-0.5 shrink-0" />
          <span>
            Por ser un negocio de salud, el 2FA es <strong>obligatorio para todos</strong> por
            compliance (no se puede desactivar).
          </span>
        </p>
      )}

      <label className="mb-4 flex items-center gap-3">
        <input
          type="checkbox"
          checked={pol.require2faTodos}
          onChange={(e) => setPol({ ...pol, require2faTodos: e.target.checked })}
          className="h-4 w-4"
        />
        <span className="text-slate-700 text-sm">Exigir 2FA a todo el equipo</span>
      </label>

      {!pol.require2faTodos && (
        <div className="mb-4">
          <p className="mb-2 font-medium text-slate-700 text-sm">O solo a estos roles:</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {roles.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={pol.require2faRoles.includes(r.codigo)}
                  onChange={() => toggleRol(r.codigo)}
                  className="h-4 w-4"
                />
                <span className="text-slate-700 text-sm">{r.nombre}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
      <button
        type="button"
        onClick={guardar}
        className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark"
      >
        {guardado ? "Guardado" : "Guardar política"}
      </button>
    </section>
  );
}
