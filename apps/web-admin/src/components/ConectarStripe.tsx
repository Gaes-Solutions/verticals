import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface ConnectStatus {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  status: string | null;
}

/**
 * Onboarding de Stripe Connect: el dueño conecta su cuenta para cobrar con
 * tarjeta a SUS clientes y recibir el dinero directo. Stripe hospeda el KYC.
 */
export function ConectarStripe() {
  const [estado, setEstado] = useState<ConnectStatus | null>(null);
  const [cargando, setCargando] = useState(true);
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api<ConnectStatus>("/billing/connect/status")
      .then(setEstado)
      .catch(() => setEstado(null))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => cargar(), [cargar]);

  async function conectar() {
    setError(null);
    setYendo(true);
    try {
      const { url } = await api<{ url: string }>("/billing/connect/onboard", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar la conexión con Stripe");
      setYendo(false);
    }
  }

  if (cargando) {
    return <p className="text-slate-400 text-sm">Cargando estado de cobros…</p>;
  }

  const habilitado = estado?.chargesEnabled === true;
  const enProceso = !!estado?.accountId && !habilitado;

  return (
    <div className="gx-card p-5">
      <h2 className="mb-1 font-semibold text-slate-800">Cobros a tus clientes (Stripe)</h2>
      <p className="mb-3 text-slate-500 text-sm">
        Conecta tu cuenta de Stripe para aceptar tarjetas y que el dinero llegue directo a tu banco.
      </p>

      {habilitado ? (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700 text-sm">
          <span>✅</span>
          <span>Conectado. Ya puedes cobrar con tarjeta.</span>
        </div>
      ) : (
        <>
          {enProceso && (
            <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-700 text-sm">
              Tu registro está incompleto. Continúa para poder cobrar.
            </p>
          )}
          <button
            type="button"
            onClick={conectar}
            disabled={yendo}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {yendo ? "Redirigiendo…" : enProceso ? "Continuar registro" : "Conectar con Stripe"}
          </button>
          {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
        </>
      )}
    </div>
  );
}
