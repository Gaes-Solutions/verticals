"use client";

import { Check, Lock } from "lucide-react";
import { useState } from "react";

interface Props {
  token: string;
  concepto: string;
  monto: string;
  status: string;
}

export function PagarCobro({ token, concepto, monto, status }: Props) {
  const [estado, setEstado] = useState(status);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setEstado(data.status === "pagado" ? "pagado" : (data.status ?? "pendiente"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }

  if (estado === "pagado") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
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
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-slate-500 text-sm">Pago solicitado</p>
        <p className="mb-1 font-medium text-slate-800">{concepto}</p>
        <p className="mb-6 font-bold text-4xl text-marca">{montoFmt}</p>
        {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
        <button
          type="button"
          onClick={pagar}
          disabled={cargando}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-marca py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Lock size={16} />
          {cargando ? "Procesando…" : `Pagar ${montoFmt} (demo)`}
        </button>
        <p className="mt-3 text-center text-slate-400 text-xs">
          Pago simulado (proveedor mock). Configura Conekta para cobro real.
        </p>
      </div>
    </div>
  );
}
