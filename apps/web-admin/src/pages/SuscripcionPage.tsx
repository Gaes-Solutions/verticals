import { CreditCard, Landmark } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AgregarTarjeta } from "../components/AgregarTarjeta.js";
import { ConectarStripe } from "../components/ConectarStripe.js";
import { ApiError, api } from "../lib/api.js";
import { loadStripe } from "../lib/stripe.js";

interface BillingPlan {
  tierOrder: number;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  prices: Array<{ currency: string; interval: string; unitAmount: number }>;
}
interface BillingContext {
  tenant: {
    slug: string;
    name: string;
    status: string;
    plan: BillingPlan | null;
  };
  subscription: {
    id: string;
    status: string;
    interval: string;
    trialEnd: string | null;
    currency: string;
    plan: BillingPlan;
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
  invoiceNumber: string;
  status: string;
  total: number;
  currency: string;
  dueDate: string | null;
  createdAt: string;
}

interface Plan extends BillingPlan {
  tierOrder: number;
}
function priceFor(plan: BillingPlan, interval: string, currency: string): number | undefined {
  return (
    plan.prices.find((p) => p.interval === interval && p.currency === currency)?.unitAmount ??
    (interval === "monthly" && plan.currency === currency ? plan.priceCents : undefined)
  );
}
function money(cents: number | undefined, currency = "MXN"): string {
  if (cents === undefined) return "Precio no disponible";
  return (cents / 100).toLocaleString("es-MX", { style: "currency", currency });
}

function fecha(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "En prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  suspended: "Suspendida",
  canceled: "Cancelada",
  paid: "Pagada",
  open: "Pendiente",
  void: "Anulada",
  uncollectible: "No cobrable",
  paused: "Pausada",
  unpaid: "Impagada",
  draft: "Borrador",
};

const STATUS_BADGE: Record<string, string> = {
  trialing: "bg-info-light text-info",
  active: "bg-ok-light text-ok",
  past_due: "bg-warn-light text-warn",
  suspended: "bg-danger-light text-danger",
  canceled: "bg-slate-100 text-slate-500",
  paid: "bg-ok-light text-ok",
  open: "bg-warn-light text-warn",
  void: "bg-slate-100 text-slate-500",
  uncollectible: "bg-danger-light text-danger",
};

function CambiarPlanModal({
  planActual,
  currentTier,
  interval,
  currency,
  onCerrar,
  onCambiado,
}: {
  planActual: string;
  currentTier: number;
  interval: string;
  currency: string;
  onCerrar: () => void;
  onCambiado: () => void;
}) {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [elegido, setElegido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Plan[]>("/auth/plans", { auth: false })
      .then((ps) =>
        setPlanes(
          ps.filter(
            (p) =>
              p.code !== planActual &&
              p.tierOrder > currentTier &&
              priceFor(p, interval, currency) !== undefined,
          ),
        ),
      )
      .catch(() => setPlanes([]));
  }, [planActual, currentTier, interval, currency]);

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
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-w-md">
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
              <span className="text-slate-600 text-sm">
                {money(priceFor(p, interval, currency), currency)}/
                {interval === "yearly" ? "año" : "mes"}
              </span>
            </label>
          ))}
        </div>
        {error && <p className="mb-3 text-danger text-sm">{error}</p>}
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
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);

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

  async function completarPago(invoiceId: string) {
    if (!stripePk || payingInvoice) return;
    setPayingInvoice(invoiceId);
    setMsg(null);
    type Recovery = { status: string; clientSecret?: string; paymentMethodId?: string };
    const recover = () =>
      api<Recovery>(`/billing/invoices/${invoiceId}/recover-payment`, { method: "POST" });
    try {
      let result = await recover();
      if (result.clientSecret && result.paymentMethodId) {
        const stripe = await loadStripe(stripePk);
        if (!stripe)
          throw new Error("No se pudo cargar Stripe. Revisa tu conexión e inténtalo de nuevo.");
        const confirmed = await stripe.confirmCardPayment(result.clientSecret, {
          payment_method: result.paymentMethodId,
        });
        if (confirmed.error)
          throw new Error(confirmed.error.message ?? "El banco no pudo completar el pago");
        result = await recover();
      }
      setMsg(
        result.status === "succeeded"
          ? "Pago confirmado. Tu suscripción está actualizada."
          : "El banco está procesando el pago. Vuelve a comprobarlo en unos momentos.",
      );
      cargar();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No se pudo completar el pago");
    } finally {
      setPayingInvoice(null);
    }
  }

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
  const plan = sub?.plan ?? ctx.tenant.plan;
  const currency = sub?.currency ?? plan?.currency ?? "MXN";
  const interval = sub?.interval ?? "monthly";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-bold text-2xl text-slate-800">Mi suscripción</h1>
        <p className="text-slate-500 text-sm">
          Plan, facturas y método de pago de {ctx.tenant.name}
        </p>
      </div>
      {msg && (
        <output className="rounded-xl bg-white p-3 text-slate-700 text-sm shadow-sm">{msg}</output>
      )}

      <div className="gx-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-lg text-slate-800">{plan?.name ?? "Sin plan"}</p>
            {sub && (
              <p className="text-slate-500 text-sm">
                <span
                  className={`mr-2 rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[sub.status] ?? ""}`}
                >
                  {STATUS_LABEL[sub.status] ?? sub.status}
                </span>
                {sub.status === "trialing" && sub.trialEnd
                  ? `Prueba gratis hasta ${fecha(sub.trialEnd)}`
                  : sub.currentPeriodEnd
                    ? `${sub.status === "active" ? "Siguiente renovación" : "Periodo hasta"}: ${fecha(sub.currentPeriodEnd)}`
                    : ""}
                {sub.discountCoupon ? ` · Cupón ${sub.discountCoupon.code}` : ""}
              </p>
            )}
          </div>
          <div className="text-right">
            {plan && (
              <p className="font-bold text-brand text-xl">
                {money(priceFor(plan, interval, currency), currency)}
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
              data-tour="tarjeta-agregar"
              onClick={() => setAgregandoTarjeta(true)}
              className="gx-btn-primary"
            >
              {ctx.paymentMethods.length === 0 ? "+ Agregar tarjeta" : "Cambiar tarjeta"}
            </button>
          )}
        </div>
        {ctx.paymentMethods.length === 0 ? (
          <p className="text-slate-400 text-sm">
            Agrega una tarjeta para los cobros de tu suscripción. Sin tarjeta, los pagos pueden
            quedar pendientes.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {ctx.paymentMethods.map((pm) => (
              <li key={pm.id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-1.5 text-slate-700">
                  {pm.type === "card" ? <CreditCard size={16} /> : <Landmark size={16} />}{" "}
                  {pm.brand ?? pm.type}
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

      {stripePk && <ConectarStripe modoPrueba={stripePk.startsWith("pk_test_")} />}

      <div className="gx-card p-5">
        <h2 className="mb-2 font-semibold text-slate-800">Facturas ({invoices.length})</h2>
        {invoices.length === 0 ? (
          <p className="text-slate-400 text-sm">Aún no hay facturas.</p>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th className="gx-th">Folio</th>
                  <th className="gx-th">Fecha</th>
                  <th className="gx-th">Total</th>
                  <th className="gx-th">Estado</th>
                  {stripePk && <th className="gx-th">Pago</th>}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="gx-td font-mono text-slate-600">{inv.invoiceNumber}</td>
                    <td className="gx-td text-slate-500">{fecha(inv.createdAt)}</td>
                    <td className="gx-td font-medium">{money(inv.total, inv.currency)}</td>
                    <td className="gx-td">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[inv.status] ?? ""}`}
                      >
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                    </td>
                    {stripePk && (
                      <td className="gx-td">
                        {inv.status === "open" && (
                          <button
                            type="button"
                            className="gx-btn-primary whitespace-nowrap"
                            disabled={payingInvoice !== null}
                            onClick={() => completarPago(inv.id)}
                          >
                            {payingInvoice === inv.id ? "Verificando…" : "Completar pago"}
                          </button>
                        )}
                      </td>
                    )}
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
          currentTier={plan.tierOrder}
          interval={interval}
          currency={currency}
          onCerrar={() => setCambiando(false)}
          onCambiado={() => {
            setCambiando(false);
            setMsg("Plan actualizado.");
            cargar();
          }}
        />
      )}
    </div>
  );
}
