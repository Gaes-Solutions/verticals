"use client";

import type { MedioPagoGuardado } from "@/lib/cliente";
import { CreditCard, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * "Mis tarjetas" en la cuenta del cliente: lista las tarjetas guardadas con su
 * máscara y permite darlas de baja. Invitado (401/[] en el BFF): no se muestra
 * la sección, igual que los demás bloques de cuenta.
 */
export function MediosPagoCuenta() {
  const [medios, setMedios] = useState<MedioPagoGuardado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    fetch("/api/cuenta/medios-pago", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("carga");
        const data = (await res.json()) as MedioPagoGuardado[];
        if (activo) setMedios(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (activo) setError("No se pudieron cargar tus tarjetas. Reintenta más tarde.");
      });
    return () => {
      activo = false;
    };
  }, []);

  async function eliminar(id: string) {
    if (eliminando) return;
    setEliminando(id);
    setError(null);
    try {
      const res = await fetch(`/api/cuenta/medios-pago/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("baja");
      setMedios((prev) => (prev ?? []).filter((m) => m.id !== id));
    } catch {
      setError("No se pudo eliminar la tarjeta. Reintenta más tarde.");
    } finally {
      setEliminando(null);
    }
  }

  if (medios === null) {
    return error ? <p className="text-danger text-sm">{error}</p> : null;
  }
  if (medios.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold">Mis tarjetas</h2>
      <div className="space-y-2">
        {medios.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm"
          >
            <CreditCard size={18} strokeWidth={2} className="flex-shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium capitalize">{m.marca}</span>
              <span className="block text-slate-500 text-xs">
                •••• {m.last4} · exp {String(m.expMes).padStart(2, "0")}/{m.expAnio}
              </span>
            </span>
            <button
              type="button"
              onClick={() => eliminar(m.id)}
              disabled={eliminando === m.id}
              className="gx-btn-ghost text-danger disabled:opacity-50"
            >
              <Trash2 size={14} strokeWidth={2} className="mr-1 inline" />
              {eliminando === m.id ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded bg-danger-light p-2 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="mt-2 text-slate-500 text-xs">
        Tus datos de tarjeta no pasan por la tienda: solo guardamos la referencia segura que nos da
        Conekta.
      </p>
    </div>
  );
}
