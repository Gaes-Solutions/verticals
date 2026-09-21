import { useCallback, useEffect, useState } from "react";
import { EstadoError } from "../components/Estados.js";
import { Skeleton } from "../components/Skeleton.js";
import { api } from "../lib/api.js";
import type { CotizacionRow, Me, PedidoRow } from "../lib/types.js";

const ESTADO_PEDIDO: Record<string, string> = {
  creado: "Creado",
  preparando: "Preparando",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const BADGE_PEDIDO: Record<string, string> = {
  entregado: "gx-badge-ok",
  cancelado: "gx-badge-danger",
};

export function DashboardPage({
  irA,
}: { irA: (s: "catalogo" | "pedidos" | "cotizaciones") => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [cotizaciones, setCotizaciones] = useState<CotizacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api<Me>("/b2b-portal/me"),
      api<PedidoRow[]>("/b2b-portal/pedidos"),
      api<CotizacionRow[]>("/b2b-portal/cotizaciones"),
    ])
      .then(([meRes, pedidosRes, cotizacionesRes]) => {
        setMe(meRes);
        setPedidos(pedidosRes.slice(0, 5));
        setCotizaciones(cotizacionesRes);
      })
      .catch(() => setError("No se pudo cargar tu panel."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => cargar(), [cargar]);

  if (loading) {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="max-w-4xl">
        <h1 className="mb-6 text-2xl font-bold text-slate-800">Inicio</h1>
        <EstadoError mensaje={error ?? "No se pudo cargar tu panel."} onRetry={cargar} />
      </div>
    );
  }

  const porAceptar = cotizaciones.filter((c) => c.estado === "enviada");

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Hola, {me.empresa.razonSocial}</h1>
      <p className="mb-6 text-sm text-slate-500">
        Condiciones: {me.empresa.condicionesPago ?? "—"}
        {me.empresa.requiereOrdenCompra ? " · requiere orden de compra" : ""}
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Tarjeta
          titulo="Crédito disponible"
          valor={me.credito ? `$${Number(me.credito.disponible).toFixed(2)}` : "Contado"}
          sub={
            me.credito
              ? `de $${Number(me.credito.lineaAutorizada).toFixed(0)} · ${me.credito.diasCredito} días`
              : "Sin línea de crédito"
          }
        />
        <Tarjeta
          titulo="Cotizaciones por aceptar"
          valor={String(porAceptar.length)}
          sub={porAceptar.length > 0 ? "Requieren tu firma" : "Nada pendiente"}
          onClick={() => irA("cotizaciones")}
        />
        <Tarjeta
          titulo="Pedidos activos"
          valor={String(
            pedidos.filter((p) => !["entregado", "cancelado"].includes(p.estado)).length,
          )}
          sub="En curso"
          onClick={() => irA("pedidos")}
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-bold text-slate-800">Últimos pedidos</h2>
        <button type="button" onClick={() => irA("catalogo")} className="gx-btn-primary">
          + Nuevo pedido
        </button>
      </div>
      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Folio</th>
              <th className="gx-th">Fecha</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id}>
                <td className="gx-td font-medium">{p.folio}</td>
                <td className="gx-td text-slate-500">
                  {new Date(p.createdAt).toLocaleDateString("es-MX")}
                </td>
                <td className="gx-td">
                  <span className={BADGE_PEDIDO[p.estado] ?? "gx-badge-info"}>
                    {ESTADO_PEDIDO[p.estado] ?? p.estado}
                  </span>
                </td>
                <td className="gx-td text-right font-semibold">${Number(p.total).toFixed(2)}</td>
              </tr>
            ))}
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={4} className="gx-td py-8 text-center text-slate-500">
                  Aún no tienes pedidos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  sub,
  onClick,
}: {
  titulo: string;
  valor: string;
  sub: string;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </>
  );

  if (!onClick) {
    return <div className="gx-card">{contenido}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="gx-card text-left hover:ring-2 hover:ring-brand/30"
    >
      {contenido}
    </button>
  );
}
