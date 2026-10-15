"use client";
import { destinoTrasLogin } from "@/lib/auth-return";
import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

async function call<T>(action: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`/api/cuenta/passkey/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "No pudimos verificar la llave de acceso.");
  return data as T;
}
function message(e: unknown) {
  if (e instanceof Error && ["NotAllowedError", "AbortError"].includes(e.name))
    return "No se completó la verificación. Puedes volver a intentarlo.";
  return e instanceof Error && e.name === "Error"
    ? e.message
    : "No se completó la operación. Revisa tu conexión o vuelve a intentarlo.";
}
export function PasskeyLogin({
  destino,
  disabled,
  onBusyChange,
}: { destino?: string; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const router = useRouter();
  useEffect(() => setSupported(window.isSecureContext && browserSupportsWebAuthn()), []);
  async function enter() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const { options, challengeToken } = await call<{
        options: PublicKeyCredentialRequestOptionsJSON;
        challengeToken: string;
      }>("login-options");
      const response = await startAuthentication({ optionsJSON: options });
      await call("login-verify", { response, challengeToken });
      router.push(destinoTrasLogin(destino));
      router.refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  if (!supported) return null;
  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        disabled={busy || disabled}
        onClick={enter}
        className="gx-btn-secondary flex w-full items-center justify-center gap-2"
      >
        <Fingerprint size={20} />
        {busy ? "Verificando…" : "Entrar con huella o llave de acceso"}
      </button>
      <p className="text-center text-xs text-slate-500">
        Configúrala primero en Mi cuenta. Tu dispositivo puede usar huella, rostro o PIN.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
interface Key {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
}
export function CustomerPasskeys() {
  const [supported, setSupported] = useState(false);
  const [keys, setKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("Mi dispositivo");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    setSupported(window.isSecureContext && browserSupportsWebAuthn());
    let cancelled = false;
    call<Key[]>("list")
      .then((data) => {
        if (!cancelled) setKeys(data);
      })
      .catch((e) => {
        if (!cancelled) setStatus({ ok: false, text: message(e) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setStatus(null);
    try {
      const { options, challengeToken } = await call<{
        options: PublicKeyCredentialCreationOptionsJSON;
        challengeToken: string;
      }>("register-options", { password });
      setPassword("");
      const response = await startRegistration({ optionsJSON: options });
      await call("register-verify", { response, challengeToken, deviceName: name.trim() });
      setStatus({
        ok: true,
        text: "Llave de acceso guardada. Ya puedes usarla para entrar en esta tienda.",
      });
      setKeys(await call<Key[]>("list"));
    } catch (e) {
      setPassword("");
      setStatus({ ok: false, text: message(e) });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function remove(key: Key) {
    if (
      pending.current ||
      !window.confirm(
        `¿Eliminar la llave “${key.deviceName}”? Puedes seguir entrando con tu contraseña.`,
      )
    )
      return;
    pending.current = true;
    setBusy(true);
    setStatus(null);
    try {
      await call("remove", { id: key.id });
      setKeys((previous) => previous.filter((item) => item.id !== key.id));
      setStatus({ ok: true, text: "Llave eliminada de esta cuenta." });
    } catch (e) {
      setStatus({ ok: false, text: message(e) });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="passkey-title" className="gx-card mb-8 p-5">
      <div className="flex items-start gap-3">
        <Fingerprint className="shrink-0 text-marca" size={26} />
        <div>
          <h2 id="passkey-title" className="font-bold">
            Huella y llaves de acceso
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Entra usando la verificación de tu dispositivo. La huella y el rostro permanecen en tu
            dispositivo.
          </p>
        </div>
      </div>
      {loading ? (
        <output className="mt-3 block text-sm">Cargando tus llaves…</output>
      ) : (
        <ul className="mt-4 space-y-2">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center gap-3 rounded-xl border p-3">
              <KeyRound size={20} className="shrink-0 text-marca" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold">{key.deviceName}</p>
                <p className="text-xs text-slate-500">
                  {key.lastUsedAt
                    ? `Último uso: ${new Date(key.lastUsedAt).toLocaleDateString("es-MX")}`
                    : "Lista para tu próximo acceso"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(key)}
                aria-label={`Eliminar llave ${key.deviceName}`}
                className="rounded-lg p-3 text-danger"
              >
                <Trash2 size={19} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {supported ? (
        <form onSubmit={register} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="gx-label">Nombre del dispositivo</span>
            <input
              className="gx-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              disabled={busy}
            />
          </label>
          <label className="block">
            <span className="gx-label">Confirma tu contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              className="gx-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <button
            type="submit"
            disabled={busy || loading || keys.length >= 10}
            className="gx-btn-primary sm:col-span-2"
          >
            {busy ? "Verificando…" : "Configurar huella o llave de acceso"}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          Este navegador no permite configurar llaves de acceso. Puedes seguir entrando con tu
          contraseña.
        </p>
      )}
      {status && (
        <p
          role={status.ok ? "status" : "alert"}
          className={`mt-3 text-sm ${status.ok ? "text-ok" : "text-danger"}`}
        >
          {status.text}
        </p>
      )}
    </section>
  );
}
