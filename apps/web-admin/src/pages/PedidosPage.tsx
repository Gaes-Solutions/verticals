import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface PedidoRow {
  id: string;
  folioPublico: string;
  emailComprador: string;
  cliente: { nombre: string } | null;
  metodoEnvio: string;
  statusPedido: string;
  statusPago: string;
  total: string;
  createdAt: string;
}

interface PedidoDetalle extends PedidoRow {
  items: Array<{ nombre: string; cantidad: string; precioUnitario: string; subtotal: string }>;
  subtotal: string;
  costoEnvio: string;
  direccionEnvio: Record<string, string> | null;
  guiaTracking: string | null;
  paqueteria: string | null;
  canceladoMotivo: string | null;
  eventos: Array<{ id: string; tipo: string; descripcion: string; createdAt: string }>;
  ventaGenerada: { folio: string } | null;
}

const ESTADOS: Record<string, string> = {
  recibido: "Recibido",
  pago_confirmado: "Pago confirmado",
  preparando: "Preparando",
  listo_pickup: "Listo para recoger",
  enviado: "Enviado",
  en_camino: "En camino",
  entregado: "Entregado",
  recogido: "Recogido",
  cancelado: "Cancelado",
};

const PAQUETERIAS = ["estafeta", "fedex", "paquete_express", "huipix", "propio"] as const;

/** Estados siguientes sugeridos según el flujo (paquetería vs pickup). */
function estadosSiguientes(p: { statusPedido: string; metodoEnvio: string }): string[] {
  const flujo =
    p.metodoEnvio === "click_collect"
      ? ["preparando", "listo_pickup", "recogido"]
      : ["preparando", "enviado", "en_camino", "entregado"];
  const idx = flujo.indexOf(p.statusPedido);
  const siguientes = idx >= 0 ? flujo.slice(idx + 1) : flujo;
  return [...siguientes, "cancelado"];
}

function badgeColor(estado: string): string {
  if (estado === "cancelado") return "bg-red-100 text-red-700";
  if (["entregado", "recogido"].includes(estado)) return "bg-emerald-100 text-emerald-700";
  if (["enviado", "en_camino", "listo_pickup"].includes(estado)) return "bg-blue-100 text-blue-700";
  return "bg-amber-100 text-amber-700";
}

export function PedidosPage() {
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [filtro, setFiltro] = useState("");
  const [detalle, setDetalle] = useState<PedidoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    const qs = filtro ? `?statusPedido=${filtro}` : "";
    api<{ items: PedidoRow[] }>(`/t/pedidos-ecommerce${qs}`)
      .then((r) => setPedidos(r.items))
      .catch(() => setPedidos([]));
  }, [filtro]);

  useEffect(() => cargar(), [cargar]);

  async function abrir(id: string) {
    setError(null);
    try {
      setDetalle(await api<PedidoDetalle>(`/t/pedidos-ecommerce/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar pedido");
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Pedidos online</h1>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Folio</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Comprador</th>
              <th className="px-4 py-2">Entrega</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{p.folioPublico}</td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(p.createdAt).toLocaleDateString("es-MX")}
                </td>
                <td className="px-4 py-2">{p.cliente?.nombre ?? p.emailComprador}</td>
                <td className="px-4 py-2">
                  {p.metodoEnvio === "click_collect" ? "🏬 Pickup" : "🚚 Envío"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${badgeColor(p.statusPedido)}`}
                  >
                    {ESTADOS[p.statusPedido] ?? p.statusPedido}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-semibold">
                  ${Number(p.total).toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => abrir(p.id)}
                    className="font-semibold text-brand hover:underline"
                  >
                    Gestionar
                  </button>
                </td>
              </tr>
            ))}
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Sin pedidos {filtro ? `en estado "${ESTADOS[filtro]}"` : "todavía"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {detalle && (
        <DetalleModal
          pedido={detalle}
          onClose={() => setDetalle(null)}
          onChanged={() => {
            setDetalle(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function DetalleModal({
  pedido,
  onClose,
  onChanged,
}: {
  pedido: PedidoDetalle;
  onClose: () => void;
  onChanged: () => void;
}) {
  const opciones = estadosSiguientes(pedido);
  const [nuevoEstado, setNuevoEstado] = useState(opciones[0] ?? "");
  const [guia, setGuia] = useState(pedido.guiaTracking ?? "");
  const [paqueteria, setPaqueteria] = useState(pedido.paqueteria ?? "estafeta");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esFinal = ["cancelado", "recogido"].includes(pedido.statusPedido);
  const pideGuia = ["enviado", "en_camino"].includes(nuevoEstado);

  async function transicionar() {
    setGuardando(true);
    setError(null);
    try {
      await api(`/t/pedidos-ecommerce/${pedido.id}/transicionar`, {
        body: {
          nuevoEstado,
          ...(pideGuia && guia ? { guiaTracking: guia, paqueteria } : {}),
          ...(nuevoEstado === "cancelado" && motivo ? { motivo } : {}),
        },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al actualizar");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{pedido.folioPublico}</h2>
            <p className="text-sm text-slate-500">{pedido.emailComprador}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
          {pedido.items.map((i, idx) => (
            <div key={`${idx}-${i.nombre}`} className="flex justify-between py-0.5">
              <span>
                {i.cantidad} × {i.nombre}
              </span>
              <span>${Number(i.subtotal).toFixed(2)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-slate-500">
            <span>Envío</span>
            <span>${Number(pedido.costoEnvio).toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>${Number(pedido.total).toFixed(2)}</span>
          </div>
        </div>

        {pedido.direccionEnvio && (
          <p className="mb-4 text-sm text-slate-600">
            📍 {pedido.direccionEnvio.calle}, {pedido.direccionEnvio.ciudad},{" "}
            {pedido.direccionEnvio.estado} CP {pedido.direccionEnvio.cp}
          </p>
        )}
        {pedido.ventaGenerada && (
          <p className="mb-4 text-sm text-slate-500">
            Venta generada: {pedido.ventaGenerada.folio}
          </p>
        )}

        <div className="mb-4">
          <h3 className="mb-2 text-sm font-bold text-slate-700">Historial</h3>
          <ol className="space-y-1 text-sm text-slate-600">
            {pedido.eventos.map((e) => (
              <li key={e.id}>
                <span className="text-slate-400">
                  {new Date(e.createdAt).toLocaleString("es-MX")} —{" "}
                </span>
                {e.descripcion}
              </li>
            ))}
          </ol>
        </div>

        {esFinal ? (
          <p className="text-sm text-slate-500">
            Pedido en estado final ({ESTADOS[pedido.statusPedido]}).
            {pedido.canceladoMotivo && ` Motivo: ${pedido.canceladoMotivo}`}
          </p>
        ) : (
          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="mb-2 text-sm font-bold text-slate-700">Avanzar pedido</h3>
            <div className="mb-2 flex gap-2">
              <select
                value={nuevoEstado}
                onChange={(e) => setNuevoEstado(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {opciones.map((o) => (
                  <option key={o} value={o}>
                    {ESTADOS[o] ?? o}
                  </option>
                ))}
              </select>
            </div>
            {pideGuia && (
              <div className="mb-2 flex gap-2">
                <select
                  value={paqueteria}
                  onChange={(e) => setPaqueteria(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                >
                  {PAQUETERIAS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  value={guia}
                  onChange={(e) => setGuia(e.target.value)}
                  placeholder="Guía de rastreo"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            )}
            {nuevoEstado === "cancelado" && (
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo de cancelación"
                className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            )}
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={transicionar}
              disabled={guardando}
              className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {guardando ? "Guardando…" : `Marcar como ${ESTADOS[nuevoEstado] ?? nuevoEstado}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
