import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";
import type { Session } from "../App.js";
import { ApiError, api, setPermisos, setToken } from "../lib/api.js";
import { resolverSession } from "../lib/session.js";
import { BackupCodes } from "./BackupCodes.js";

const SLUG_KEY = "gaespos_pos_slug";

interface SesionTenant {
  accessToken: string;
  user: { id: string; nombre: string; permissions: string[]; isOwner: boolean };
  backupCodes?: string[];
}
interface RetoMfa {
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  mfaToken?: string;
}

/** En producción el slug sale del subdominio (negocio.gaessoft.mx); en localhost/IP se pide. */
function tenantDeSubdominio(): string | null {
  const qp = new URLSearchParams(window.location.search).get("negocio");
  if (qp?.trim()) return qp.trim().toLowerCase();
  const host = window.location.hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split(".");
  const sub = parts[0];
  const reservados = ["www", "admin", "app", "pos"];
  if (host.endsWith(".localhost")) {
    return sub && !reservados.includes(sub) ? sub : null;
  }
  if (host === "localhost") return null;
  if (parts.length < 3) return null;
  if (!sub || reservados.includes(sub)) return null;
  return sub;
}

type Paso = "password" | "setup" | "verify" | "codes";

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const slugFijo = tenantDeSubdominio();
  const [paso, setPaso] = useState<Paso>("password");
  const [tenantSlug, setTenantSlug] = useState(slugFijo ?? localStorage.getItem(SLUG_KEY) ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [usarRespaldo, setUsarRespaldo] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [pendiente, setPendiente] = useState<SesionTenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function fail(err: unknown, fallback: string) {
    setToken(null);
    setError(
      err instanceof ApiError && err.status === 401
        ? fallback
        : err instanceof Error
          ? err.message
          : fallback,
    );
  }

  async function entrar(ses: SesionTenant) {
    setToken(ses.accessToken);
    setPermisos(ses.user.permissions);
    localStorage.setItem(SLUG_KEY, tenantSlug);
    onLogin(await resolverSession(ses.user.nombre));
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<SesionTenant & RetoMfa>("/auth/tenant/login", {
        auth: false,
        body: { tenantSlug, email, password },
      });
      if (res.accessToken) {
        await entrar(res);
      } else if (res.mfaToken) {
        setMfaToken(res.mfaToken);
        if (res.mfaSetupRequired) {
          const s = await api<{ secret: string; otpauthUrl: string }>("/auth/tenant/mfa/setup", {
            token: res.mfaToken,
            method: "POST",
          });
          setOtpauthUrl(s.otpauthUrl);
          setSecret(s.secret);
          setPaso("setup");
        } else {
          setPaso("verify");
        }
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
        const ses = await api<SesionTenant>("/auth/tenant/mfa/activate", {
          token: mfaToken,
          body: { code },
        });
        if (ses.backupCodes?.length) {
          setBackupCodes(ses.backupCodes);
          setPendiente(ses);
          setPaso("codes");
        } else {
          await entrar(ses);
        }
      } else {
        const ses = await api<SesionTenant>("/auth/tenant/mfa/verify", {
          token: mfaToken,
          body: { code },
        });
        await entrar(ses);
      }
    } catch (err) {
      fail(err, "Código incorrecto");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none";
  const codeCls = `${inputCls} text-center font-mono text-lg tracking-widest`;
  const btnCls =
    "w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50";

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 font-bold text-2xl text-brand">GaesSoft POS</h1>
        <p className="mb-6 text-slate-500 text-sm">Inicia sesión para vender</p>

        {paso === "password" && (
          <form onSubmit={submitPassword}>
            {slugFijo ? (
              <p className="mb-4 rounded-lg bg-brand/5 px-3 py-2 text-slate-600 text-sm">
                Negocio: <span className="font-semibold text-brand">{slugFijo}</span>
              </p>
            ) : (
              <label className="mb-3 block">
                <span className="mb-1 block font-medium text-slate-700 text-sm">
                  Negocio (slug)
                </span>
                <input
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  autoCapitalize="none"
                  className={inputCls}
                  placeholder="mi-negocio"
                  required
                />
              </label>
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

        {paso === "setup" && (
          <form onSubmit={submitCode}>
            <p className="mb-3 text-slate-600 text-sm">
              Tu negocio exige verificación en dos pasos. Escanea con Google Authenticator y escribe
              el código de 6 dígitos.
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
              className={`mb-3 ${codeCls}`}
              required
            />
            {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className={btnCls}>
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
            <input
              inputMode={usarRespaldo ? "text" : "numeric"}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(
                  usarRespaldo
                    ? e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "")
                        .slice(0, 14)
                    : e.target.value.replace(/\D/g, "").slice(0, 6),
                )
              }
              placeholder={usarRespaldo ? "xxxx-xxxx" : "123456"}
              className={`mb-3 ${codeCls}`}
              required
            />
            {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className={btnCls}>
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
            <button type="button" onClick={() => entrar(pendiente)} className={`mt-4 ${btnCls}`}>
              Ya los guardé, entrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
