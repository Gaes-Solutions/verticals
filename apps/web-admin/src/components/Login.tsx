import { Eye, EyeOff, Fingerprint } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";
import type { AdminSession } from "../App.js";
import {
  ApiError,
  type SesionTenant,
  loginTenant,
  mfaTenantActivate,
  mfaTenantSetup,
  mfaTenantVerify,
  setPermisos,
  setToken,
  setUserId,
} from "../lib/api.js";
import { loginConPasskey, passkeyDisponible } from "../lib/passkey.js";
import { BackupCodes } from "./BackupCodes.js";

const SLUG_KEY = "gaespos_admin_slug";

/**
 * En producción cada negocio entra por su subdominio (negocio.gaessoft.mx) y el
 * slug sale de ahí: el login solo pide correo + contraseña. En localhost / IP /
 * dominio base no hay subdominio, así que se muestra el campo (prellenado con el
 * último negocio usado).
 */
function tenantDeSubdominio(): string | null {
  // Permite fijar el negocio por URL (?negocio=slug) — útil desde el celular por IP.
  const qp = new URLSearchParams(window.location.search).get("negocio");
  if (qp?.trim()) return qp.trim().toLowerCase();
  const host = window.location.hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split(".");
  const sub = parts[0];
  const reservados = ["www", "admin", "app"];
  if (host.endsWith(".localhost")) {
    return sub && !reservados.includes(sub) ? sub : null;
  }
  if (host === "localhost") return null;
  if (parts.length < 3) return null;
  if (!sub || reservados.includes(sub)) return null;
  return sub;
}

type Paso = "password" | "setup" | "verify" | "codes";

export function Login({
  onLogin,
  onCrearCuenta,
}: { onLogin: (s: AdminSession) => void; onCrearCuenta?: () => void }) {
  const slugFijo = tenantDeSubdominio();
  const [paso, setPaso] = useState<Paso>("password");
  const [tenantSlug, setTenantSlug] = useState(slugFijo ?? localStorage.getItem(SLUG_KEY) ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
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

  function entrar(ses: SesionTenant) {
    setToken(ses.accessToken);
    setPermisos(ses.user.permissions);
    setUserId(ses.user.id);
    localStorage.setItem(SLUG_KEY, tenantSlug);
    onLogin({ nombre: ses.user.nombre, tenantSlug });
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await loginTenant(tenantSlug, email, password);
      if (res.accessToken) {
        entrar(res);
      } else if (res.mfaToken) {
        setMfaToken(res.mfaToken);
        if (res.mfaSetupRequired) {
          const s = await mfaTenantSetup(res.mfaToken);
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

  async function entrarConHuella() {
    if (!tenantSlug) {
      setError("Escribe primero el negocio para entrar con huella.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      entrar(await loginConPasskey(tenantSlug));
    } catch (err) {
      fail(err, "No se pudo entrar con huella. Usa tu contraseña.");
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
        const ses = await mfaTenantActivate(mfaToken, code);
        if (ses.backupCodes?.length) {
          setBackupCodes(ses.backupCodes);
          setPendiente(ses);
          setPaso("codes");
        } else {
          entrar(ses);
        }
      } else {
        entrar(await mfaTenantVerify(mfaToken, code));
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
        <h1 className="mb-1 font-bold text-2xl text-brand">GaesSoft Admin</h1>
        <p className="mb-6 text-slate-500 text-sm">Panel de tu negocio</p>

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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
                required
              />
            </label>
            <label className="mb-5 block">
              <span className="mb-1 block font-medium text-slate-700 text-sm">Contraseña</span>
              <div className="relative">
                <input
                  type={verPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-12 focus:border-brand focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((v) => !v)}
                  aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="-translate-y-1/2 absolute top-1/2 right-2 rounded p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  {verPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && <p className="mb-4 text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
            {passkeyDisponible() && (
              <>
                <div className="my-3 flex items-center gap-3 text-slate-300 text-xs">
                  <span className="h-px flex-1 bg-slate-200" />o
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
                <button
                  type="button"
                  onClick={entrarConHuella}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand py-2.5 font-semibold text-brand hover:bg-brand/5 disabled:opacity-50"
                >
                  <Fingerprint size={18} /> Entrar con huella
                </button>
              </>
            )}
            {onCrearCuenta && (
              <button
                type="button"
                onClick={onCrearCuenta}
                className="mt-3 w-full text-center text-slate-500 text-sm hover:text-brand"
              >
                ¿Nuevo negocio? Crea tu cuenta
              </button>
            )}
          </form>
        )}

        {paso === "setup" && (
          <form onSubmit={submitCode}>
            <p className="mb-3 text-slate-600 text-sm">
              Tu negocio exige verificación en dos pasos. Escanea el código con Google Authenticator
              (o Authy) y escribe el código de 6 dígitos.
            </p>
            <div className="mb-3 flex justify-center rounded-lg bg-white p-3">
              <QRCodeSVG value={otpauthUrl} size={168} />
            </div>
            <p className="mb-4 break-all text-center text-slate-400 text-xs">
              ¿No puedes escanear? Clave manual: <span className="font-mono">{secret}</span>
            </p>
            <CodeInput code={code} setCode={setCode} respaldo={false} />
            {error && <p className="mb-4 text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
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
            {error && <p className="mb-4 text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
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
              className="mt-4 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark"
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
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-lg tracking-widest focus:border-brand focus:outline-none"
        required
      />
    </label>
  );
}
