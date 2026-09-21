"use client";

import { Lock } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

/** Tipado mínimo del SDK Conekta.js cargado por <script>. */
interface ConektaSDK {
  setPublicKey(key: string): void;
  Token: {
    create(
      params: { card: Record<string, string> },
      success: (t: { id: string }) => void,
      error: (e: { message_to_purchase?: string; message?: string }) => void,
    ): void;
  };
}
declare global {
  interface Window {
    Conekta?: ConektaSDK;
  }
}

const SDK_URL = "https://cdn.conekta.io/js/latest/conekta.js";

/**
 * Formulario de tarjeta con tokenización Conekta.js (PCI: los datos de la
 * tarjeta van directo a Conekta, nunca a nuestro backend). Devuelve el token +
 * los meses sin intereses elegidos vía onPagar.
 */
export function PagoTarjetaConekta({
  publicKey,
  montoTotal,
  msiMeses,
  procesando,
  onPagar,
}: {
  publicKey: string;
  montoTotal: number;
  msiMeses: number[];
  procesando: boolean;
  onPagar: (cardTokenId: string, meses: number | null) => void;
}) {
  const [numero, setNumero] = useState("");
  const [nombre, setNombre] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [meses, setMeses] = useState(0);
  const [tokenizando, setTokenizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkListo, setSdkListo] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const [sdkIntento, setSdkIntento] = useState(0);

  useEffect(() => {
    if (window.Conekta) {
      window.Conekta.setPublicKey(publicKey);
      setSdkListo(true);
      setSdkError(false);
      return;
    }
    let cancelado = false;
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => {
      if (cancelado) return;
      window.Conekta?.setPublicKey(publicKey);
      setSdkListo(true);
      setSdkError(false);
    };
    s.onerror = () => {
      if (cancelado) return;
      setSdkError(true);
    };
    document.body.appendChild(s);
    return () => {
      cancelado = true;
    };
  }, [publicKey, sdkIntento]);

  function formatearExp(v: string): string {
    const digitos = v.replace(/\D/g, "").slice(0, 4);
    return digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
  }

  function tokenizar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const sdk = window.Conekta;
    if (!sdk) {
      setError("No se pudo cargar el pago seguro. Reintenta.");
      return;
    }
    const [mm, aa] = exp.split("/");
    if (!mm || !aa) {
      setError("Vencimiento inválido (usa MM/AA)");
      return;
    }
    setTokenizando(true);
    sdk.Token.create(
      {
        card: { number: numero.replace(/\s/g, ""), name: nombre, exp_year: aa, exp_month: mm, cvc },
      },
      (token) => {
        setTokenizando(false);
        onPagar(token.id, meses >= 3 ? meses : null);
      },
      (err) => {
        setTokenizando(false);
        setError(err.message_to_purchase ?? err.message ?? "Tarjeta inválida");
      },
    );
  }

  const cargando = tokenizando || procesando;

  return (
    <form onSubmit={tokenizar} className="space-y-3">
      <label className="block">
        <span className="gx-label">Número de tarjeta</span>
        <input
          inputMode="numeric"
          autoComplete="cc-number"
          maxLength={19}
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="4242 4242 4242 4242"
          required
          className="gx-input"
        />
      </label>
      <label className="block">
        <span className="gx-label">Nombre en la tarjeta</span>
        <input
          autoComplete="cc-name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          className="gx-input"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="gx-label">Vence (MM/AA)</span>
          <input
            inputMode="numeric"
            autoComplete="cc-exp"
            maxLength={5}
            value={exp}
            onChange={(e) => setExp(formatearExp(e.target.value))}
            placeholder="12/28"
            required
            className="gx-input"
          />
        </label>
        <label className="block">
          <span className="gx-label">CVC</span>
          <input
            inputMode="numeric"
            autoComplete="cc-csc"
            maxLength={4}
            value={cvc}
            onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="123"
            required
            className="gx-input"
          />
        </label>
      </div>

      {msiMeses.length > 0 && (
        <label className="block">
          <span className="gx-label">Meses sin intereses</span>
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="gx-input"
          >
            <option value={0}>Un solo pago de ${montoTotal.toFixed(2)}</option>
            {[...msiMeses]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {m} meses sin intereses de ${(montoTotal / m).toFixed(2)}
                </option>
              ))}
          </select>
        </label>
      )}

      {error && <p className="rounded bg-danger-light p-2 text-danger text-sm">{error}</p>}
      {sdkError ? (
        <div className="space-y-2">
          <p role="alert" className="rounded bg-danger-light p-2 text-danger text-sm">
            No se pudo cargar el pago seguro. Verifica tu conexión e inténtalo de nuevo.
          </p>
          <button
            type="button"
            onClick={() => setSdkIntento((n) => n + 1)}
            className="gx-btn-secondary w-full"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <button
          type="submit"
          disabled={cargando || !sdkListo}
          className="gx-btn-primary w-full py-3"
        >
          {cargando
            ? "Procesando pago…"
            : !sdkListo
              ? "Cargando pago seguro…"
              : `Pagar $${montoTotal.toFixed(2)}`}
        </button>
      )}
      <p className="flex items-center justify-center gap-1.5 text-center text-slate-400 text-xs">
        <Lock size={12} strokeWidth={2} /> Pago seguro con Conekta · tus datos de tarjeta no pasan
        por la tienda
      </p>
    </form>
  );
}
