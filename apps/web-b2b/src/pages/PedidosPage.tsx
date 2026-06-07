import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import type { PedidoRow } from "../lib/types.js";

const ESTADO: Record<string, string> = {
  creado: "Creado",
  preparando: "Preparando",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const APROBACION: Record<string, string> = {
  no_requiere: "",
  pendiente: "Pendiente de aprobación",
  aprobada: "Aprobado",
  rechazada: "Rechazado",
};

interface PedidoDetalle extends PedidoRow {
  lineas: Array<{
    id: string;
    cantidad: string;
    precioUnitario: string;
    totalLinea: string;
    snapshotProducto: { nombreProducto?: string };
  }>;
  cotizacion: { folio: string } | null;
}

export function PedidosPage() {
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [detalle, setDetalle] = useState<PedidoDetalle | null>(null);

  useEffect(() => {
    api<PedidoRow[]>("/b2b-portal/pedidos")
      .then(setPedidos)
      .catch(() => setPedidos([]));
  }, []);

  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Mis pedidos</h1>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Folio</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Rastreo</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{p.folio}</td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(p.createdAt).toLocaleDateString("es-MX")}
                </td>
                <td className="px-4 py-2">
                  {ESTADO[p.estado] ?? p.estado}
                  {p.estadoAprobacion !== "no_requiere" && (
                    <span className="ml-1 text-xs text-amber-600">
                      ({APROBACION[p.estadoAprobacion]})
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">
                  {p.trackingExterno ? (
                    p.trackingUrl ? (
                      <a
                        href={p.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:underline"
                      >
                        {p.paqueteria}: {p.trackingExterno}
                      </a>
                    ) : (
                      `${p.paqueteria}: ${p.trackingExterno}`
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-right font-semibold">
                  ${Number(p.total).toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      api<PedidoDetalle>(`/b2b-portal/pedidos/${p.id}`).then(setDetalle)
                    }
                    className="font-semibold text-brand hover:underline"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Aún no tienes pedidos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{detalle.folio}</h2>
                {detalle.cotizacion && (
                  <p className="text-xs text-slate-400">
                    desde cotización {detalle.cotizacion.folio}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetalle(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {detalle.lineas.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="py-1">{l.snapshotProducto?.nombreProducto ?? "Producto"}</td>
                    <td className="py-1 text-slate-500">×{Number(l.cantidad)}</td>
                    <td className="py-1 text-right">${Number(l.totalLinea).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-bold">
              <span>Total</span>
              <span>${Number(detalle.total).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
