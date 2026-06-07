import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import type { CotizacionRow, Me, PedidoRow } from "../lib/types.js";

const ESTADO_PEDIDO: Record<string, string> = {
  creado: "Creado",
  preparando: "Preparando",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export function DashboardPage({
  irA,
}: { irA: (s: "catalogo" | "pedidos" | "cotizaciones") => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [cotizaciones, setCotizaciones] = useState<CotizacionRow[]>([]);

  useEffect(() => {
    api<Me>("/b2b-portal/me")
      .then(setMe)
      .catch(() => setMe(null));
    api<PedidoRow[]>("/b2b-portal/pedidos")
      .then((p) => setPedidos(p.slice(0, 5)))
      .catch(() => setPedidos([]));
    api<CotizacionRow[]>("/b2b-portal/cotizaciones")
      .then(setCotizaciones)
      .catch(() => setCotizaciones([]));
  }, []);

  const porAceptar = cotizaciones.filter((c) => c.estado === "enviada");

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">
        Hola, {me?.empresa.razonSocial ?? "…"}
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Condiciones: {me?.empresa.condicionesPago ?? "—"}
        {me?.empresa.requiereOrdenCompra ? " · requiere orden de compra" : ""}
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Tarjeta
          titulo="Crédito disponible"
          valor={me?.credito ? `$${Number(me.credito.disponible).toFixed(2)}` : "Contado"}
          sub={
            me?.credito
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
        <button
          type="button"
          onClick={() => irA("catalogo")}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + Nuevo pedido
        </button>
      </div>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Folio</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{p.folio}</td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(p.createdAt).toLocaleDateString("es-MX")}
                </td>
                <td className="px-4 py-2">{ESTADO_PEDIDO[p.estado] ?? p.estado}</td>
                <td className="px-4 py-2 text-right font-semibold">
                  ${Number(p.total).toFixed(2)}
                </td>
              </tr>
            ))}
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="rounded-xl bg-white p-5 text-left shadow-sm enabled:hover:ring-2 enabled:hover:ring-brand/30"
    >
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{valor}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </button>
  );
}
