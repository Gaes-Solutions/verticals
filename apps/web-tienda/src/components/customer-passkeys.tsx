"use client";
import { destinoTrasLogin } from "@/lib/auth-return";
import {
  type LlaveCliente,
  clienteLlave,
  errorLlave,
  listaLlaves,
  opcionesLogin,
  opcionesRegistro,
  reciboLlave,
} from "@/lib/passkey-contract";
import {
  WebAuthnAbortService,
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DialogoTienda } from "./dialogo-tienda";
class ErrorLlave extends Error {
  constructor(readonly status: number) {
    super(errorLlave(status));
  }
}
async function call(action: string, signal: AbortSignal, body: unknown = {}) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
  const response = await fetch(`/api/cuenta/passkey/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: deadline,
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  deadline.throwIfAborted();
  if (!response.ok) throw new ErrorLlave(response.status);
  return data;
}
function message(e: unknown) {
  if (e instanceof Error && ["NotAllowedError", "AbortError"].includes(e.name))
    return "No se completó la verificación. Puedes volver a intentarlo.";
  return e instanceof ErrorLlave ? e.message : errorLlave(503);
}
/** One ceremony at a time; leaving the screen cancels HTTP and the native prompt. */
function useCeremonia() {
  const current = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      if (current.current) {
        current.current.abort();
        WebAuthnAbortService.cancelCeremony();
        current.current = null;
      }
    },
    [],
  );
  function begin() {
    if (current.current) return null;
    const c = new AbortController();
    current.current = c;
    setBusy(true);
    return c;
  }
  function end(c: AbortController) {
    if (current.current === c) {
      current.current = null;
      setBusy(false);
    }
  }
  function cancel() {
    current.current?.abort();
    WebAuthnAbortService.cancelCeremony();
  }
  return { busy, begin, end, cancel, isCurrent: (c: AbortController) => current.current === c };
}
export function PasskeyLogin({
  destino,
  disabled,
  onBusyChange,
}: { destino?: string; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flow = useCeremonia();
  const router = useRouter();
  useEffect(() => setSupported(window.isSecureContext && browserSupportsWebAuthn()), []);
  async function enter() {
    if (disabled) return;
    const c = flow.begin();
    if (!c) return;
    onBusyChange?.(true);
    setError(null);
    try {
      const data = await call("login-options", c.signal);
      if (!opcionesLogin(data, window.location.hostname)) throw new ErrorLlave(502);
      c.signal.throwIfAborted();
      const response = await startAuthentication({ optionsJSON: data.options });
      c.signal.throwIfAborted();
      const result = await call("login-verify", c.signal, {
        response,
        challengeToken: data.challengeToken,
      });
      if (
        !result ||
        typeof result !== "object" ||
        !("cliente" in result) ||
        !clienteLlave(result.cliente)
      )
        throw new ErrorLlave(502);
      c.signal.throwIfAborted();
      router.push(destinoTrasLogin(destino));
      router.refresh();
    } catch (e) {
      if (!c.signal.aborted) setError(message(e));
    } finally {
      flow.end(c);
      onBusyChange?.(false);
    }
  }
  if (!supported) return null;
  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        disabled={flow.busy || disabled}
        onClick={enter}
        className="gx-btn-secondary flex min-h-11 w-full items-center justify-center gap-2"
      >
        <Fingerprint size={20} />
        {flow.busy ? "Verificando…" : "Entrar con huella o llave de acceso"}
      </button>
      {flow.busy && (
        <button type="button" onClick={flow.cancel} className="gx-btn-ghost min-h-11 w-full">
          Cancelar verificación
        </button>
      )}
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
export function CustomerPasskeys() {
  const [supported, setSupported] = useState(false);
  const [keys, setKeys] = useState<LlaveCliente[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("Mi dispositivo");
  const [selected, setSelected] = useState<LlaveCliente | null>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const focusAfterWrite = useRef(false);
  useEffect(() => {
    if (!selected && focusAfterWrite.current) {
      focusAfterWrite.current = false;
      refreshButton.current?.focus();
    }
  }, [selected]);
  const [mustRefresh, setMustRefresh] = useState(false);
  const refreshLock = useRef(false);
  const read = useRef<AbortController | null>(null);
  const flow = useCeremonia();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async (parent?: AbortSignal) => {
    read.current?.abort();
    const c = new AbortController();
    read.current = c;
    refreshLock.current = true;
    setLoading(true);
    setLoadError(null);
    const signal = parent ? AbortSignal.any([parent, c.signal]) : c.signal;
    try {
      const data = await call("list", signal);
      if (!listaLlaves(data)) throw new ErrorLlave(502);
      signal.throwIfAborted();
      setKeys(data);
      setMustRefresh(false);
      return data;
    } catch (e) {
      if (!signal.aborted) {
        setLoadError(message(e));
        setMustRefresh(true);
        if (e instanceof ErrorLlave && [401, 403].includes(e.status)) setKeys(null);
      }
      return null;
    } finally {
      if (read.current === c) {
        read.current = null;
        refreshLock.current = false;
        if (!c.signal.aborted) setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    setSupported(window.isSecureContext && browserSupportsWebAuthn());
    void load();
    return () => {
      read.current?.abort();
      read.current = null;
      refreshLock.current = false;
    };
  }, [load]);
  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (refreshLock.current || mustRefresh || !keys || keys.length >= 10 || !name.trim()) return;
    const c = flow.begin();
    if (!c) return;
    setStatus(null);
    let sent = false;
    try {
      const data = await call("register-options", c.signal, { password });
      if (!opcionesRegistro(data, window.location.hostname)) throw new ErrorLlave(502);
      c.signal.throwIfAborted();
      setPassword("");
      const response = await startRegistration({ optionsJSON: data.options });
      c.signal.throwIfAborted();
      sent = true;
      setMustRefresh(true);
      const receipt = await call("register-verify", c.signal, {
        response,
        challengeToken: data.challengeToken,
        deviceName: name.trim(),
      });
      if (!reciboLlave(receipt)) throw new ErrorLlave(502);
      setStatus({
        ok: true,
        text: "Llave de acceso guardada. Ya puedes usarla para entrar en esta tienda.",
      });
      await load(c.signal);
    } catch (e) {
      if (flow.isCurrent(c)) {
        setStatus({ ok: false, text: message(e) });
        if (sent) setMustRefresh(true);
        if (e instanceof ErrorLlave && [401, 403].includes(e.status)) {
          setKeys(null);
          setMustRefresh(true);
        }
      }
    } finally {
      if (flow.isCurrent(c)) setPassword("");
      flow.end(c);
    }
  }
  async function remove() {
    if (!selected || refreshLock.current || mustRefresh) return;
    const c = flow.begin();
    if (!c) return;
    const key = selected;
    setMustRefresh(true);
    setStatus(null);
    try {
      const receipt = await call("remove", c.signal, { id: key.id });
      if (!reciboLlave(receipt)) throw new ErrorLlave(502);
      const updated = await load(c.signal);
      if (updated && !updated.some((k) => k.id === key.id))
        setStatus({ ok: true, text: "Llave eliminada de esta cuenta." });
      else if (updated) {
        setMustRefresh(true);
        setStatus({ ok: false, text: "La llave sigue en la lista. Actualiza antes de continuar." });
      }
    } catch (e) {
      if (!c.signal.aborted) {
        setStatus({ ok: false, text: message(e) });
        setMustRefresh(true);
        if (e instanceof ErrorLlave && [401, 403].includes(e.status)) setKeys(null);
      }
    } finally {
      if (!c.signal.aborted) {
        focusAfterWrite.current = true;
        setSelected(null);
      }
      flow.end(c);
    }
  }
  const blocked = flow.busy || loading || mustRefresh || keys === null;
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
      <button
        type="button"
        disabled={flow.busy || loading}
        ref={refreshButton}
        onClick={() => {
          if (!refreshLock.current) void load();
        }}
        className="gx-btn-ghost mt-3 min-h-11"
      >
        Actualizar llaves
      </button>
      {loading && <output className="mt-3 block text-sm">Cargando tus llaves…</output>}
      {loadError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {loadError}
        </p>
      )}
      {mustRefresh && (
        <p className="mt-2 text-sm">
          Actualiza las llaves para comprobar su estado antes de hacer otro cambio.
        </p>
      )}
      {!loading && keys?.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">
          Todavía no tienes llaves de acceso en esta tienda.
        </p>
      )}
      {keys && keys.length > 0 && (
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
                disabled={blocked}
                onClick={() => setSelected(key)}
                aria-label={`Eliminar llave ${key.deviceName}`}
                className="min-h-11 min-w-11 rounded-lg p-3 text-danger"
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
              onChange={(e) => {
                setName(e.target.value);
                e.target.setCustomValidity(
                  e.target.value.trim() ? "" : "Escribe un nombre para el dispositivo.",
                );
              }}
              required
              maxLength={60}
              disabled={blocked}
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
              maxLength={120}
              disabled={blocked}
            />
          </label>
          <button
            type="submit"
            disabled={blocked || (keys?.length ?? 0) >= 10}
            className="gx-btn-primary min-h-11 sm:col-span-2"
          >
            {flow.busy ? "Verificando…" : "Configurar huella o llave de acceso"}
          </button>
          {flow.busy && (
            <button
              type="button"
              onClick={flow.cancel}
              className="gx-btn-ghost min-h-11 sm:col-span-2"
            >
              Cancelar verificación
            </button>
          )}
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
      {selected && (
        <DialogoTienda
          titulo="Eliminar llave de acceso"
          bloqueado={flow.busy}
          onCerrar={() => setSelected(null)}
        >
          <p className="break-words text-sm">
            ¿Eliminar la llave “{selected.deviceName}”? Puedes seguir entrando con tu contraseña.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={flow.busy}
              onClick={() => setSelected(null)}
              className="gx-btn-secondary min-h-11"
            >
              Conservar llave
            </button>
            <button
              type="button"
              disabled={flow.busy}
              onClick={() => void remove()}
              className="gx-btn-primary min-h-11"
            >
              {flow.busy ? "Eliminando…" : "Eliminar llave"}
            </button>
          </div>
        </DialogoTienda>
      )}
    </section>
  );
}
