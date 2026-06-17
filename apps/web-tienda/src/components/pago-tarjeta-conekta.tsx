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

  useEffect(() => {
    if (window.Conekta) {
      window.Conekta.setPublicKey(publicKey);
      setSdkListo(true);
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => {
      window.Conekta?.setPublicKey(publicKey);
      setSdkListo(true);
    };
    document.body.appendChild(s);
  }, [publicKey]);

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
        <span className="mb-1 block font-medium text-sm">Número de tarjeta</span>
        <input
          inputMode="numeric"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="4242 4242 4242 4242"
          required
          className="w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium text-sm">Nombre en la tarjeta</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          className="w-full rounded border px-3 py-2"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block font-medium text-sm">Vence (MM/AA)</span>
          <input
            value={exp}
            onChange={(e) => setExp(e.target.value)}
            placeholder="12/28"
            required
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium text-sm">CVC</span>
          <input
            inputMode="numeric"
            value={cvc}
            onChange={(e) => setCvc(e.target.value)}
            placeholder="123"
            required
            className="w-full rounded border px-3 py-2"
          />
        </label>
      </div>

      {msiMeses.length > 0 && (
        <label className="block">
          <span className="mb-1 block font-medium text-sm">Meses sin intereses</span>
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="w-full rounded border px-3 py-2"
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

      {error && <p className="rounded bg-red-50 p-2 text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={cargando || !sdkListo}
        className="w-full rounded bg-marca py-3 font-medium text-white hover:bg-marca-dark disabled:opacity-50"
      >
        {cargando ? "Procesando pago…" : `Pagar $${montoTotal.toFixed(2)}`}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-center text-gray-400 text-xs">
        <Lock size={12} strokeWidth={2} /> Pago seguro con Conekta · tus datos de tarjeta no pasan
        por la tienda
      </p>
    </form>
  );
}
