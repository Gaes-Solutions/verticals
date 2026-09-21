import { useCallback, useEffect, useState } from "react";
import { Modal, ModalClose } from "../components/Modal.js";
import { EstadoError } from "../components/Estados.js";
import { Skeleton } from "../components/Skeleton.js";
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

const BADGE_ESTADO: Record<string, string> = {
  entregado: "gx-badge-ok",
  cancelado: "gx-badge-danger",
};

const BADGE_APROBACION: Record<string, string> = {
  pendiente: "gx-badge-warn",
  aprobada: "gx-badge-ok",
  rechazada: "gx-badge-danger",
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<PedidoDetalle | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    api<PedidoRow[]>("/b2b-portal/pedidos")
      .then(setPedidos)
      .catch(() => setError("No se pudieron cargar tus pedidos."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => cargar(), [cargar]);

  function verDetalle(id: string) {
    setError(null);
    api<PedidoDetalle>(`/b2b-portal/pedidos/${id}`)
      .then(setDetalle)
      .catch(() => setError("No se pudo cargar el detalle."));
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Mis pedidos</h1>

      {loading ? (
        <div className="gx-table-wrap">
          <div className="space-y-4 p-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ) : error ? (
        <EstadoError mensaje={error} onRetry={cargar} />
      ) : (
        <div className="gx-table-wrap">
          <table className="gx-table">
            <thead>
              <tr>
                <th className="gx-th">Folio</th>
                <th className="gx-th">Fecha</th>
                <th className="gx-th">Estado</th>
                <th className="gx-th">Rastreo</th>
                <th className="gx-th text-right">Total</th>
                <th className="gx-th" />
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
                    <span className={BADGE_ESTADO[p.estado] ?? "gx-badge-info"}>
                      {ESTADO[p.estado] ?? p.estado}
                    </span>
                    {p.estadoAprobacion !== "no_requiere" && (
                      <span
                        className={`ml-1 ${BADGE_APROBACION[p.estadoAprobacion] ?? "gx-badge-info"}`}
                      >
                        {APROBACION[p.estadoAprobacion]}
                      </span>
                    )}
                  </td>
                  <td className="gx-td text-xs">
                    {p.trackingExterno ? (
                      p.trackingUrl ? (
                        <a
                          href={p.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-brand hover:underline"
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
                  <td className="gx-td text-right font-semibold">${Number(p.total).toFixed(2)}</td>
                  <td className="gx-td text-right">
                    <button type="button" onClick={() => verDetalle(p.id)} className="gx-btn-ghost">
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
              {pedidos.length === 0 && (
                <tr>
                  <td colSpan={6} className="gx-td py-8 text-center text-slate-500">
                    Aún no tienes pedidos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <Modal onClose={() => setDetalle(null)}>
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-800">{detalle.folio}</h2>
              {detalle.cotizacion && (
                <p className="text-xs text-slate-500">desde cotización {detalle.cotizacion.folio}</p>
              )}
            </div>
            <ModalClose onClose={() => setDetalle(null)} />
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
        </Modal>
      )}
    </div>
  );
}
