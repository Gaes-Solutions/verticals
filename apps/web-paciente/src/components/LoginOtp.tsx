import { useState } from "react";
import { ApiError, type SesionPaciente, pedirOtp, verificarOtp } from "../lib/api.js";

export function LoginOtp({ onLogin }: { onLogin: (s: SesionPaciente) => void }) {
  const [paso, setPaso] = useState<"telefono" | "codigo">("telefono");
  const [telefono, setTelefono] = useState("");
  const [code, setCode] = useState("");
  const [debug, setDebug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function e164(): string {
    const digits = telefono.replace(/\D/g, "");
    return digits.startsWith("52") ? `+${digits}` : `+52${digits}`;
  }

  async function enviar() {
    setError(null);
    setLoading(true);
    try {
      const r = await pedirOtp(e164());
      setDebug(r.debugCode ?? null);
      setPaso("codigo");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el código");
    } finally {
      setLoading(false);
    }
  }

  async function verificar() {
    setError(null);
    setLoading(true);
    try {
      const ses = await verificarOtp(e164(), code);
      onLogin(ses);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código inválido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="mb-1 text-2xl font-bold text-slate-800">Mi expediente</h1>
        <p className="mb-6 text-sm text-slate-500">
          {paso === "telefono"
            ? "Entra con tu teléfono; te enviaremos un código."
            : `Escribe el código que enviamos a ${e164()}.`}
        </p>

        {paso === "telefono" ? (
          <>
            <span className="mb-1 block text-sm font-medium text-slate-700">Teléfono</span>
            <input
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="33 1234 5678"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            />
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={enviar}
              disabled={loading || telefono.replace(/\D/g, "").length < 10}
              className="mt-5 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {loading ? "Enviando…" : "Enviar código"}
            </button>
          </>
        ) : (
          <>
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Código (6 dígitos)
            </span>
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-2xl tracking-widest focus:border-brand focus:outline-none"
            />
            {debug && (
              <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-center text-xs text-amber-700">
                Código de prueba: {debug}
              </p>
            )}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={verificar}
              disabled={loading || code.length !== 6}
              className="mt-5 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
            <button
              type="button"
              onClick={() => setPaso("telefono")}
              className="mt-3 w-full text-center text-sm text-slate-500 hover:text-brand"
            >
              Cambiar teléfono
            </button>
          </>
        )}
      </div>
    </div>
  );
}
