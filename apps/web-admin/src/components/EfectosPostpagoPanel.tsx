import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";

interface PostPaymentEffect {
  id: string;
  pedidoId: string;
  tipo: "guia" | "push_pago";
  status: "pending" | "processing" | "uncertain";
  attempts: number;
  errorCode: string | null;
  updatedAt: string;
  pedido: { folioPublico: string };
}
const permission = "ecommerce.pedidos_gestionar";
const states = {
  pending: { label: "Pendiente", badge: "gx-badge-info" },
  processing: { label: "En proceso", badge: "gx-badge-warn" },
  uncertain: { label: "Revisar resultado", badge: "gx-badge-danger" },
};
const reasons: Record<string, string> = {
  WORKER_INTERRUPTED: "El proceso se interrumpió. Verifica si la operación se completó.",
  SHIPPING_RESULT_UNCERTAIN:
    "No se pudo confirmar la generación de la guía. Revisa al proveedor logístico.",
  SHIPPING_PREPARATION_FAILED: "No se pudo preparar la guía. Revisa los datos del envío.",
  PUSH_PARTIAL_OR_UNCERTAIN:
    "El aviso pudo llegar solo a algunos dispositivos. Revisa el resultado antes de repetirlo.",
  PUSH_RESULT_UNCERTAIN: "No se pudo confirmar la entrega del aviso de pago.",
  PUSH_PREPARATION_FAILED: "No se pudo preparar el aviso de pago.",
};
function updatedLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha disponible" : date.toLocaleString("es-MX");
}

export function EfectosPostpagoPanel() {
  const allowed = puede(permission);
  const [state, setState] = useState<{
    items: PostPaymentEffect[];
    busy: boolean;
    error: string | null;
  }>({ items: [], busy: true, error: null });
  const generation = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    if (!allowed || !puede(permission)) return;
    const current = ++generation.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    setState({ items: [], busy: true, error: null });
    void api<PostPaymentEffect[]>("/t/checkout/efectos-postpago", { signal: controller.signal })
      .then((items) => {
        if (!Array.isArray(items)) throw new Error("Respuesta inválida");
        if (current === generation.current) setState({ items, busy: false, error: null });
      })
      .catch((error: unknown) => {
        if (current !== generation.current) return;
        setState({
          items: [],
          busy: false,
          error:
            error instanceof ApiError && error.status === 403
              ? "Tu cuenta no tiene permiso para revisar estas tareas."
              : "No pudimos consultar las tareas posteriores al pago. Revisa tu conexión y vuelve a intentar.",
        });
      })
      .finally(() => clearTimeout(timeout));
  }, [allowed]);
  useEffect(() => {
    load();
    return () => {
      generation.current++;
      controllerRef.current?.abort();
    };
  }, [load]);
  if (!allowed) return null;
  return (
    <section className="mb-6 min-w-0" aria-labelledby="postpayment-title">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="postpayment-title" className="text-lg font-bold text-slate-800">
            Tareas posteriores al pago
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Guías y avisos que siguen pendientes de confirmar. Se muestran hasta 100 tareas, de la
            más antigua a la más reciente.
          </p>
        </div>
        <button
          type="button"
          className="gx-btn-secondary min-h-11"
          disabled={state.busy}
          onClick={load}
        >
          {state.busy ? "Consultando…" : state.error ? "Reintentar consulta" : "Actualizar"}
        </button>
      </div>
      <p className="mb-3 text-sm text-slate-600">
        Un resultado incierto requiere conciliar con el proveedor antes de repetir una operación.
        Esta vista no reenvía guías ni avisos.
      </p>
      {state.error ? (
        <div role="alert" className="gx-card text-danger">
          {state.error}
        </div>
      ) : state.busy ? (
        <output className="gx-card block text-slate-500">Consultando tareas…</output>
      ) : state.items.length === 0 ? (
        <p className="gx-card text-slate-500">
          No hay tareas pendientes reportadas en esta consulta.
        </p>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
          {state.items.map((item) => (
            <EffectCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
function EffectCard({ item }: { item: PostPaymentEffect }) {
  const status = states[item.status] ?? { label: "Requiere revisión", badge: "gx-badge-warn" };
  const reason = item.errorCode
    ? (reasons[item.errorCode] ?? "Se requiere revisar el resultado de esta operación.")
    : null;
  return (
    <article className="gx-card min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-bold text-slate-800">
          Pedido {item.pedido.folioPublico}
        </h3>
        <span className={status.badge}>{status.label}</span>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-slate-500">Tarea</dt>
        <dd className="min-w-0 break-words text-slate-800">
          {item.tipo === "guia"
            ? "Generación de guía"
            : item.tipo === "push_pago"
              ? "Aviso de pago"
              : "Operación posterior al pago"}
        </dd>
        <dt className="text-slate-500">Intentos</dt>
        <dd className="text-slate-800">{item.attempts}</dd>
        <dt className="text-slate-500">Actualización</dt>
        <dd className="min-w-0 break-words text-slate-800">{updatedLabel(item.updatedAt)}</dd>
      </dl>
      {reason ? <p className="mt-3 break-words text-sm text-slate-600">{reason}</p> : null}
    </article>
  );
}
