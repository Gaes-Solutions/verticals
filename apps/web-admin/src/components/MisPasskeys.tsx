import { Fingerprint } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api.js";
import {
  type PasskeyInfo,
  borrarPasskey,
  listarPasskeys,
  marcarHuellaActivadaAqui,
  passkeyDisponible,
  registrarPasskey,
} from "../lib/passkey.js";

function nombreDispositivo(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Android/i.test(ua)) return "Mi celular";
  if (/Mac/i.test(ua)) return "Mi Mac";
  if (/Windows/i.test(ua)) return "Mi PC";
  return "Mi dispositivo";
}

function fecha(v: string | null): string {
  if (!v) return "nunca";
  return new Date(v).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function MisPasskeys() {
  const [lista, setLista] = useState<PasskeyInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cargar = useCallback(() => {
    listarPasskeys()
      .then(setLista)
      .catch(() => setLista([]));
  }, []);

  useEffect(() => cargar(), [cargar]);

  async function activar() {
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      await registrarPasskey(nombreDispositivo());
      setOk("¡Huella activada en este dispositivo!");
      cargar();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo activar. Tu dispositivo pudo haber cancelado el registro.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function quitar(id: string) {
    await borrarPasskey(id).catch(() => undefined);
    const quedan = lista.filter((p) => p.id !== id);
    setLista(quedan);
    if (quedan.length === 0) marcarHuellaActivadaAqui(false);
    cargar();
  }

  if (!passkeyDisponible()) {
    return (
      <div className="gx-card p-5">
        <h2 className="mb-1 font-bold text-lg text-slate-800">Entrar con huella</h2>
        <p className="text-slate-500 text-sm">
          Este dispositivo o navegador no soporta huella/Face ID. Ábrelo desde tu celular para
          activarlo.
        </p>
      </div>
    );
  }

  return (
    <div className="gx-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Fingerprint size={20} className="text-brand" />
        <h2 className="font-bold text-lg text-slate-800">Entrar con huella</h2>
      </div>
      <p className="mb-4 text-slate-500 text-sm">
        Activa tu huella o Face ID en este dispositivo para entrar sin escribir la contraseña.
      </p>

      {lista.length > 0 && (
        <ul className="mb-4 divide-y divide-slate-100 text-sm">
          {lista.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <span className="text-slate-700">
                {p.deviceName ?? "Dispositivo"}
                <span className="block text-slate-400 text-xs">
                  Último uso: {fecha(p.lastUsedAt)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => quitar(p.id)}
                className="text-slate-400 text-sm hover:text-red-500"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mb-2 text-red-600 text-sm">{error}</p>}
      {ok && <p className="mb-2 text-emerald-600 text-sm">{ok}</p>}

      <button
        type="button"
        onClick={activar}
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white hover:bg-brand-dark disabled:opacity-50"
      >
        <Fingerprint size={18} />
        {busy ? "Activando…" : "Activar huella en este dispositivo"}
      </button>
    </div>
  );
}
