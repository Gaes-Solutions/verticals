import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";
import type { AdminSession } from "../App.js";
import {
  ApiError,
  type SesionAdmin,
  login,
  mfaActivate,
  mfaSetup,
  mfaVerify,
  setRole,
  setToken,
} from "../lib/api.js";
import { BackupCodes } from "./BackupCodes.js";

type Paso = "password" | "setup" | "verify" | "codes";

export function Login({ onLogin }: { onLogin: (s: AdminSession) => void }) {
  const [paso, setPaso] = useState<Paso>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [usarRespaldo, setUsarRespaldo] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [pendiente, setPendiente] = useState<SesionAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function fail(err: unknown, fallback: string) {
    setError(
      err instanceof ApiError && err.status === 401
        ? fallback
        : err instanceof Error
          ? err.message
          : fallback,
    );
  }

  function entrar(ses: SesionAdmin) {
    setToken(ses.accessToken);
    setRole(ses.user.role);
    onLogin({ nombre: ses.user.name, email: ses.user.email, role: ses.user.role });
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const reto = await login(email, password);
      setMfaToken(reto.mfaToken);
      if (reto.mfaSetupRequired) {
        const s = await mfaSetup(reto.mfaToken);
        setOtpauthUrl(s.otpauthUrl);
        setSecret(s.secret);
        setPaso("setup");
      } else {
        setPaso("verify");
      }
    } catch (err) {
      fail(err, "Credenciales inválidas");
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (paso === "setup") {
        const ses = await mfaActivate(mfaToken, code);
        if (ses.backupCodes?.length) {
          setBackupCodes(ses.backupCodes);
          setPendiente(ses);
          setPaso("codes");
        } else {
          entrar(ses);
        }
      } else {
        entrar(await mfaVerify(mfaToken, code));
      }
    } catch (err) {
      fail(err, "Código incorrecto");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 font-bold text-2xl text-brand">GaesSoft · Plataforma</h1>
        <p className="mb-6 text-slate-500 text-sm">Panel de super-administración</p>

        {paso === "password" && (
          <form onSubmit={submitPassword}>
            <label className="mb-3 block">
              <span className="mb-1 block font-medium text-slate-700 text-sm">Correo</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="gx-input"
                required
              />
            </label>
            <label className="mb-5 block">
              <span className="mb-1 block font-medium text-slate-700 text-sm">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="gx-input"
                required
              />
            </label>
            {error && <p className="mb-4 text-danger text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="gx-btn-primary w-full">
              {loading ? "Verificando…" : "Continuar"}
            </button>
          </form>
        )}

        {paso === "setup" && (
          <form onSubmit={submitCode}>
            <p className="mb-3 text-slate-600 text-sm">
              Escanea este código con Google Authenticator (o Authy) y escribe el código de 6
              dígitos para activar tu 2FA.
            </p>
            <div className="mb-3 flex justify-center rounded-lg bg-white p-3">
              <QRCodeSVG value={otpauthUrl} size={168} />
            </div>
            <p className="mb-4 break-all text-center text-slate-400 text-xs">
              ¿No puedes escanear? Clave manual: <span className="font-mono">{secret}</span>
            </p>
            <CodeInput code={code} setCode={setCode} respaldo={false} />
            {error && <p className="mb-4 text-danger text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="gx-btn-primary w-full">
              {loading ? "Activando…" : "Activar y entrar"}
            </button>
          </form>
        )}

        {paso === "verify" && (
          <form onSubmit={submitCode}>
            <p className="mb-4 text-slate-600 text-sm">
              {usarRespaldo
                ? "Escribe uno de tus códigos de respaldo (xxxx-xxxx)."
                : "Escribe el código de 6 dígitos de tu app autenticadora."}
            </p>
            <CodeInput code={code} setCode={setCode} respaldo={usarRespaldo} />
            {error && <p className="mb-4 text-danger text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="gx-btn-primary w-full">
              {loading ? "Entrando…" : "Entrar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setUsarRespaldo((v) => !v);
                setCode("");
                setError(null);
              }}
              className="mt-3 w-full text-center text-brand text-sm hover:underline"
            >
              {usarRespaldo
                ? "Usar código de la app"
                : "Perdí mi teléfono · usar código de respaldo"}
            </button>
          </form>
        )}

        {paso === "codes" && pendiente && (
          <div>
            <BackupCodes codes={backupCodes} />
            <button
              type="button"
              onClick={() => entrar(pendiente)}
              className="gx-btn-primary mt-4 w-full"
            >
              Ya los guardé, entrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CodeInput({
  code,
  setCode,
  respaldo,
}: {
  code: string;
  setCode: (v: string) => void;
  respaldo: boolean;
}) {
  return (
    <label className="mb-5 block">
      <span className="mb-1 block font-medium text-slate-700 text-sm">
        {respaldo ? "Código de respaldo" : "Código 2FA"}
      </span>
      <input
        inputMode={respaldo ? "text" : "numeric"}
        autoComplete="one-time-code"
        value={code}
        onChange={(e) =>
          setCode(
            respaldo
              ? e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "")
                  .slice(0, 14)
              : e.target.value.replace(/\D/g, "").slice(0, 6),
          )
        }
        placeholder={respaldo ? "xxxx-xxxx" : "123456"}
        className="gx-input text-center font-mono text-lg tracking-widest"
        required
      />
    </label>
  );
}
