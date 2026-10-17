"use client";

import { loadPaymentSdk } from "@/lib/payment-sdk";
import { Lock } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

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
  formId,
  onPagar,
}: {
  publicKey: string;
  montoTotal: number;
  msiMeses: number[];
  procesando: boolean;
  /** id del <form> para que un CTA externo (barra sticky) lo dispare. */
  formId?: string;
  onPagar: (cardTokenId: string, meses: number | null) => void;
}) {
  const cuotasLabel = useId();
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

  const pending = useRef<AbortController | null>(null);
  const sdkReady = useRef(false);
  const pay = useRef(onPagar);
  useEffect(() => {
    pay.current = onPagar;
  }, [onPagar]);
  const cuotasKey = msiMeses.join(",");
  useEffect(() => {
    let active = true;
    sdkReady.current = false;
    setSdkListo(false);
    setSdkError(false);
    loadPaymentSdk(
      SDK_URL,
      () =>
        typeof window.Conekta?.setPublicKey === "function" &&
        typeof window.Conekta?.Token?.create === "function",
    )
      .then(() => {
        if (!active) return;
        if (!window.Conekta) throw new Error("SDK unavailable");
        window.Conekta.setPublicKey(publicKey);
        sdkReady.current = true;
        setSdkListo(true);
      })
      .catch(() => {
        if (active) setSdkError(true);
      });
    return () => {
      active = false;
      sdkReady.current = false;
    };
  }, [publicKey, sdkIntento]);
  useEffect(() => {
    pending.current?.abort();
    pending.current = null;
    setTokenizando(false);
    setError(null);
    setCvc("");
    setMeses(0);
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [publicKey, montoTotal, cuotasKey]);

  function formatearExp(v: string): string {
    const digitos = v.replace(/\D/g, "").slice(0, 4);
    return digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
  }

  function tokenizar(e: FormEvent) {
    e.preventDefault();
    if (pending.current || procesando) return;
    setError(null);
    const sdk = window.Conekta;
    if (!sdkReady.current || !sdk) {
      setError("Espera a que cargue el pago seguro.");
      return;
    }
    const [mm, aa] = exp.split("/");
    const now = new Date();
    const year = 2000 + Number(aa);
    if (
      !/^\d{12,19}$/.test(numero.replace(/\s/g, "")) ||
      !nombre.trim() ||
      !/^\d{3,4}$/.test(cvc)
    ) {
      setError("Revisa el número de tarjeta, el nombre y el CVC.");
      return;
    }
    if (
      !mm ||
      !aa ||
      aa.length !== 2 ||
      Number(mm) < 1 ||
      Number(mm) > 12 ||
      year < now.getFullYear() ||
      (year === now.getFullYear() && Number(mm) < now.getMonth() + 1)
    ) {
      setError("Revisa el vencimiento: usa MM/AA y una tarjeta vigente.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setTokenizando(true);
    const current = () => pending.current === controller && !controller.signal.aborted;
    const release = () => {
      clearTimeout(timer);
      if (pending.current === controller) {
        pending.current = null;
        setTokenizando(false);
      }
    };
    const timer = setTimeout(() => {
      if (!current()) return;
      release();
      controller.abort();
      setCvc("");
      setError(
        "No pudimos validar tu tarjeta a tiempo. No se envió el pedido. Revisa tu conexión y vuelve a intentarlo.",
      );
    }, 20000);
    controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    try {
      sdk.setPublicKey(publicKey);
      sdk.Token.create(
        {
          card: {
            number: numero.replace(/\s/g, ""),
            name: nombre.trim(),
            exp_year: aa,
            exp_month: mm,
            cvc,
          },
        },
        (token) => {
          if (!current()) return;
          setCvc("");
          if (
            !token ||
            typeof token.id !== "string" ||
            token.id.length < 5 ||
            token.id.length > 200 ||
            !token.id.trim()
          ) {
            release();
            setError("No pudimos validar tu tarjeta. No se envió el pedido. Vuelve a intentarlo.");
            return;
          }
          controller.abort(); // Ignore duplicate SDK callbacks while the parent takes over.
          try {
            pay.current(token.id, msiMeses.includes(meses) && meses >= 3 ? meses : null);
          } finally {
            queueMicrotask(release);
          }
        },
        (err) => {
          if (!current()) return;
          release();
          setCvc("");
          setError(
            typeof err?.message_to_purchase === "string" && err.message_to_purchase.length <= 300
              ? err.message_to_purchase
              : "No pudimos validar tu tarjeta. Revisa los datos y vuelve a intentarlo.",
          );
        },
      );
    } catch {
      if (current()) {
        release();
        setCvc("");
        setError("No pudimos validar tu tarjeta. Revisa tu conexión y vuelve a intentarlo.");
      }
    }
  }

  const cargando = tokenizando || procesando;

  return (
    <form onSubmit={tokenizar} id={formId} className="space-y-3">
      <fieldset disabled={cargando} className="space-y-3 min-w-0">
        <label className="block">
          <span className="gx-label">Número de tarjeta</span>
          <input
            inputMode="numeric"
            autoComplete="cc-number"
            maxLength={23}
            value={numero}
            onChange={(e) =>
              setNumero(
                e.target.value
                  .replace(/\D/g, "")
                  .slice(0, 19)
                  .replace(/(.{4})/g, "$1 ")
                  .trim(),
              )
            }
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
              type="password"
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
            <span id={cuotasLabel} className="gx-label">
              Meses sin intereses
            </span>
            <select
              aria-labelledby={cuotasLabel}
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
      </fieldset>
      {error && (
        <p role="alert" className="rounded bg-danger-light p-2 text-danger text-sm">
          {error}
        </p>
      )}
      {sdkError ? (
        <div className="space-y-2">
          <p role="alert" className="rounded bg-danger-light p-2 text-danger text-sm">
            No se pudo cargar el pago seguro. Verifica tu conexión e inténtalo de nuevo.
          </p>
          <button
            type="button"
            onClick={() => setSdkIntento((n) => n + 1)}
            className="gx-btn-secondary min-h-11 w-full"
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
