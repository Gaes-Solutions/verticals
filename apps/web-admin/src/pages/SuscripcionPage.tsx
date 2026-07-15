import { useCallback, useEffect, useState } from "react";
import { AgregarTarjeta } from "../components/AgregarTarjeta.js";
import { ApiError, api } from "../lib/api.js";

interface BillingContext {
  tenant: {
    slug: string;
    name: string;
    status: string;
    plan: {
      code: string;
      name: string;
      priceMonthly: string;
      priceYearly: string;
      features: Array<{ featureKey: string; limitValue: string | null }>;
    } | null;
  };
  subscription: {
    id: string;
    status: string;
    interval: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    discountCoupon: { code: string; discountValue: string } | null;
  } | null;
  paymentMethods: Array<{
    id: string;
    type: string;
    brand: string | null;
    last4: string | null;
    isDefault: boolean;
  }>;
}

interface Invoice {
  id: string;
  folio: string;
  status: string;
  total: string;
  currency: string;
  dueDate: string | null;
  createdAt: string;
}

interface Plan {
  code: string;
  name: string;
  priceMonthly: string;
  tierOrder: number;
}

function money(v: string | number | null | undefined): string {
  return Number(v ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function fecha(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_BADGE: Record<string, string> = {
  trialing: "bg-sky-100 text-sky-700",
  active: "bg-emerald-100 text-emerald-700",
  past_due: "bg-amber-100 text-amber-700",
  suspended: "bg-red-100 text-red-600",
  canceled: "bg-slate-100 text-slate-500",
  paid: "bg-emerald-100 text-emerald-700",
  open: "bg-amber-100 text-amber-700",
  void: "bg-slate-100 text-slate-500",
  uncollectible: "bg-red-100 text-red-600",
};

function CambiarPlanModal({
  planActual,
  onCerrar,
  onCambiado,
}: {
  planActual: string;
  onCerrar: () => void;
  onCambiado: () => void;
}) {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [elegido, setElegido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Plan[]>("/auth/plans", { auth: false })
      .then((ps) => setPlanes(ps.filter((p) => p.code !== planActual)))
      .catch(() => setPlanes([]));
  }, [planActual]);

  async function cambiar() {
    if (!elegido) return;
    setBusy(true);
    setError(null);
    try {
      await api("/billing/subscription/change-plan", { body: { planCode: elegido } });
      onCambiado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 font-bold text-lg text-slate-800">Cambiar de plan</h2>
        <p className="mb-4 text-slate-500 text-sm">
          El cambio a un plan superior aplica de inmediato con cargo prorrateado.
        </p>
        <div className="mb-4 space-y-2">
          {planes.map((p) => (
            <label
              key={p.code}
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                elegido === p.code ? "border-brand bg-brand/5" : "border-slate-200"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="plan"
                  checked={elegido === p.code}
                  onChange={() => setElegido(p.code)}
                />
                <span className="font-medium text-slate-800">{p.name}</span>
              </span>
              <span className="text-slate-600 text-sm">{money(p.priceMonthly)}/mes</span>
            </label>
          ))}
        </div>
        {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className="gx-btn-secondary flex-1">
            Cancelar
          </button>
          <button
            type="button"
            onClick={cambiar}
            disabled={busy || !elegido}
            className="gx-btn-primary flex-1"
          >
            {busy ? "Cambiando…" : "Cambiar plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SuscripcionPage() {
  const [ctx, setCtx] = useState<BillingContext | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [stripePk, setStripePk] = useState<string | null>(null);
  const [agregandoTarjeta, setAgregandoTarjeta] = useState(false);

  const cargar = useCallback(() => {
    Promise.all([api<BillingContext>("/billing/me"), api<Invoice[]>("/billing/invoices")])
      .then(([c, inv]) => {
        setCtx(c);
        setInvoices(inv);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "No se pudo cargar la suscripción"),
      );
  }, []);
  useEffect(() => cargar(), [cargar]);

  useEffect(() => {
    api<{ publishableKey: string | null }>("/billing/stripe-config")
      .then((c) => setStripePk(c.publishableKey))
      .catch(() => setStripePk(null));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-3 font-bold text-2xl text-slate-800">Mi suscripción</h1>
        <p className="rounded-xl bg-white p-6 text-slate-500 shadow-sm">{error}</p>
      </div>
    );
  }
  if (!ctx) return <p className="text-slate-400">Cargando suscripción…</p>;

  const sub = ctx.subscription;
  const plan = ctx.tenant.plan;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-bold text-2xl text-slate-800">Mi suscripción</h1>
        <p className="text-slate-500 text-sm">
          Plan, facturas y método de pago de {ctx.tenant.name}
        </p>
      </div>
      {msg && <p className="rounded-xl bg-white p-3 text-slate-700 text-sm shadow-sm">{msg}</p>}

      <div className="gx-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-lg text-slate-800">{plan?.name ?? "Sin plan"}</p>
            {sub && (
              <p className="text-slate-500 text-sm">
                <span
                  className={`mr-2 rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[sub.status] ?? ""}`}
                >
                  {sub.status}
                </span>
                {sub.status === "trialing" && sub.trialEndsAt
                  ? `Prueba gratis hasta ${fecha(sub.trialEndsAt)}`
                  : sub.currentPeriodEnd
                    ? `Siguiente cargo: ${fecha(sub.currentPeriodEnd)}`
                    : ""}
                {sub.discountCoupon ? ` · Cupón ${sub.discountCoupon.code}` : ""}
              </p>
            )}
          </div>
          <div className="text-right">
            {plan && (
              <p className="font-bold text-brand text-xl">
                {money(sub?.interval === "yearly" ? plan.priceYearly : plan.priceMonthly)}
                <span className="font-normal text-slate-400 text-sm">
                  /{sub?.interval === "yearly" ? "año" : "mes"}
                </span>
              </p>
            )}
            <button
              type="button"
              onClick={() => setCambiando(true)}
              className="gx-btn-secondary mt-2 text-sm"
            >
              Cambiar de plan
            </button>
          </div>
        </div>
      </div>

      <div className="gx-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Método de pago</h2>
          {stripePk && !agregandoTarjeta && (
            <button
              type="button"
              onClick={() => setAgregandoTarjeta(true)}
              className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-sm text-white hover:bg-brand-dark"
            >
              {ctx.paymentMethods.length === 0 ? "+ Agregar tarjeta" : "Cambiar tarjeta"}
            </button>
          )}
        </div>
        {ctx.paymentMethods.length === 0 ? (
          <p className="text-slate-400 text-sm">
            Sin método de pago registrado: tus facturas se cobran manualmente.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {ctx.paymentMethods.map((pm) => (
              <li key={pm.id} className="flex items-center justify-between py-2">
                <span className="text-slate-700">
                  {pm.type === "card" ? "💳" : "🏦"} {pm.brand ?? pm.type}
                  {pm.last4 ? ` •••• ${pm.last4}` : ""}
                </span>
                {pm.isDefault && (
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-brand text-xs">
                    predeterminado
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {stripePk && agregandoTarjeta && (
          <AgregarTarjeta
            publishableKey={stripePk}
            onCancelar={() => setAgregandoTarjeta(false)}
            onAgregada={() => {
              setAgregandoTarjeta(false);
              setMsg("Tarjeta guardada");
              cargar();
            }}
          />
        )}
        {stripePk === null && ctx.paymentMethods.length === 0 && (
          <p className="mt-2 text-slate-400 text-xs">
            La captura de tarjeta en línea aún no está disponible.
          </p>
        )}
      </div>

      <div className="gx-card p-5">
        <h2 className="mb-2 font-semibold text-slate-800">Facturas ({invoices.length})</h2>
        {invoices.length === 0 ? (
          <p className="text-slate-400 text-sm">Aún no hay facturas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-slate-100 border-b text-slate-500">
                  <th className="py-2 pr-4">Folio</th>
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-slate-50 border-b">
                    <td className="py-2 pr-4 font-mono text-slate-600">{inv.folio}</td>
                    <td className="py-2 pr-4 text-slate-500">{fecha(inv.createdAt)}</td>
                    <td className="py-2 pr-4 font-medium text-slate-800">{money(inv.total)}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[inv.status] ?? ""}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cambiando && plan && (
        <CambiarPlanModal
          planActual={plan.code}
          onCerrar={() => setCambiando(false)}
          onCambiado={() => {
            setCambiando(false);
            setMsg("✅ Plan actualizado.");
            cargar();
          }}
        />
      )}
    </div>
  );
}
