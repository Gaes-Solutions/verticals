"use client";

import { Check, Lock } from "lucide-react";
import { useState } from "react";

interface Props {
  token: string;
  concepto: string;
  monto: string;
  status: string;
}

const TERMINALES = ["pagado", "cancelado", "expirado"];

export function PagarCobro({ token, concepto, monto, status }: Props) {
  const [estado, setEstado] = useState(status);
  const [cargando, setCargando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permiteDemo = process.env.NODE_ENV !== "production";
  const montoFmt = `$${Number(monto).toFixed(2)}`;

  async function pagar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cobro/${token}/pagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo: "tarjeta" }),
      });
      const data = (await res.json()) as { status?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo procesar el pago");
      const nuevo = data.status === "pagado" ? "pagado" : (data.status ?? "pendiente");
      setEstado(nuevo);
      // Estado no terminal: el pago se está verificando, no se puede reintentar a ciegas.
      if (!TERMINALES.includes(nuevo)) setVerificando(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }

  if (estado === "pagado") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ok-light text-ok">
          <Check size={36} />
        </div>
        <h1 className="font-bold text-2xl text-slate-800">¡Pago recibido!</h1>
        <p className="mt-2 text-slate-500">
          Pagaste {montoFmt} por {concepto}. Gracias.
        </p>
      </div>
    );
  }

  if (estado === "cancelado" || estado === "expirado") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-bold text-2xl text-slate-800">Link no disponible</h1>
        <p className="mt-2 text-slate-500">Este cobro está {estado}. Pide uno nuevo al negocio.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="gx-card">
        <p className="text-slate-500 text-sm">Pago solicitado</p>
        <p className="mb-1 font-medium text-slate-800">{concepto}</p>
        <p className="mb-6 font-bold text-4xl text-marca">{montoFmt}</p>
        {error && <p className="mb-3 text-danger text-sm">{error}</p>}
        {permiteDemo ? (
          <>
            <button
              type="button"
              onClick={pagar}
              disabled={cargando || verificando}
              className="gx-btn-primary w-full py-3"
            >
              <Lock size={16} />
              {cargando
                ? "Procesando…"
                : verificando
                  ? "Verificando pago…"
                  : `Pagar ${montoFmt} (demo)`}
            </button>
            <p className="mt-3 text-center text-slate-400 text-xs">
              Pago simulado (proveedor mock). Configura Conekta para cobro real.
            </p>
          </>
        ) : (
          <p
            role="alert"
            className="rounded-lg border border-warn/40 bg-warn-light p-3 text-sm text-warn"
          >
            El pago en línea no está disponible en este momento. Contacta al negocio para
            habilitarlo o paga directamente en tienda.
          </p>
        )}
      </div>
    </div>
  );
}
