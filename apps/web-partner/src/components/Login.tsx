import { type FormEvent, useState } from "react";
import { ApiError, type PerfilPartner, api, setToken } from "../lib/api.js";

interface SesionPartner {
  accessToken: string;
  partner: PerfilPartner;
}
interface RetoMfa {
  mfaRequired?: boolean;
  mfaToken?: string;
}

type Paso = "password" | "verify" | "invitacion";

/** ?token=… en la URL = invitación pendiente: primero se fija la password. */
function tokenInvitacion(): string | null {
  return new URLSearchParams(window.location.search).get("token");
}

export function Login({ onLogin }: { onLogin: (p: PerfilPartner) => void }) {
  const invToken = tokenInvitacion();
  const [paso, setPaso] = useState<Paso>(invToken ? "invitacion" : "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [code, setCode] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function entrar(ses: SesionPartner) {
    setToken(ses.accessToken);
    onLogin(ses.partner);
  }

  async function submitInvitacion(e: FormEvent) {
    e.preventDefault();
    if (password !== password2) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ email: string }>("/partner/auth/aceptar-invitacion", {
        auth: false,
        body: { token: invToken, password },
      });
      setEmail(res.email);
      setAviso("¡Listo! Tu cuenta quedó activa. Entra con tu correo y contraseña.");
      window.history.replaceState(null, "", window.location.pathname);
      setPaso("password");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aceptar la invitación");
    } finally {
      setLoading(false);
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<SesionPartner & RetoMfa>("/partner/auth/login", {
        auth: false,
        body: { email, password },
      });
      if (res.accessToken) {
        entrar(res);
      } else if (res.mfaToken) {
        setMfaToken(res.mfaToken);
        setPaso("verify");
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Credenciales inválidas"
          : err instanceof Error
            ? err.message
            : "Error",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const ses = await api<SesionPartner>("/partner/auth/mfa/verify", {
        token: mfaToken,
        body: { code },
      });
      entrar(ses);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código incorrecto");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none";
  const btnCls =
    "w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50";

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 font-bold text-2xl text-brand">GaesSoft Partners</h1>
        <p className="mb-6 text-slate-500 text-sm">Tu programa de referidos, comisiones y pagos</p>

        {paso === "invitacion" && (
          <form onSubmit={submitInvitacion}>
            <p className="mb-4 rounded-lg bg-brand/5 px-3 py-2 text-slate-600 text-sm">
              Bienvenido al programa de partners. Define tu contraseña para activar tu cuenta.
            </p>
            <label className="mb-3 block">
              <span className="mb-1 block font-medium text-slate-700 text-sm">
                Contraseña (mín. 8)
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                className={inputCls}
                required
              />
            </label>
            <label className="mb-5 block">
              <span className="mb-1 block font-medium text-slate-700 text-sm">
                Confirmar contraseña
              </span>
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                minLength={8}
                className={inputCls}
                required
              />
            </label>
            {error && <p className="mb-4 text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className={btnCls}>
              {loading ? "Activando…" : "Activar mi cuenta"}
            </button>
          </form>
        )}

        {paso === "password" && (
          <form onSubmit={submitPassword}>
            {aviso && (
              <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700 text-sm">
                {aviso}
              </p>
            )}
            <label className="mb-3 block">
              <span className="mb-1 block font-medium text-slate-700 text-sm">Correo</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                required
              />
            </label>
            <label className="mb-5 block">
              <span className="mb-1 block font-medium text-slate-700 text-sm">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                required
              />
            </label>
            {error && <p className="mb-4 text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className={btnCls}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}

        {paso === "verify" && (
          <form onSubmit={submitCode}>
            <p className="mb-4 text-slate-600 text-sm">
              Escribe el código de 6 dígitos de tu app autenticadora (o un código de respaldo).
            </p>
            <input
              inputMode="text"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.slice(0, 14))}
              placeholder="123456"
              className={`${inputCls} mb-3 text-center font-mono text-lg tracking-widest`}
              required
            />
            {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className={btnCls}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
