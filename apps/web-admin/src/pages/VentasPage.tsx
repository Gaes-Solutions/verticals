import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import type { Paged, VentaDetalle, VentaListItem } from "../lib/types.js";

const ESTADO_COLOR: Record<string, string> = {
  cobrada: "text-emerald-600",
  cancelada: "text-red-500",
  borrador: "text-slate-400",
};

export function VentasPage() {
  const [items, setItems] = useState<VentaListItem[]>([]);
  const [canal, setCanal] = useState("");
  const [estado, setEstado] = useState("");
  const [cargando, setCargando] = useState(true);
  const [detalle, setDetalle] = useState<VentaDetalle | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const qs = new URLSearchParams({ pageSize: "50" });
      if (canal) qs.set("canal", canal);
      if (estado) qs.set("estado", estado);
      const res = await api<Paged<VentaListItem>>(`/t/ventas?${qs.toString()}`);
      setItems(res.items);
    } finally {
      setCargando(false);
    }
  }, [canal, estado]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function verDetalle(id: string) {
    setDetalle(await api<VentaDetalle>(`/t/ventas/${id}`));
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Ventas</h1>

      <div data-tour="ven-filtros" className="mb-4 flex gap-2">
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        >
          <option value="">Todos los canales</option>
          <option value="pos">POS</option>
          <option value="ecommerce">Ecommerce</option>
          <option value="mayoreo">Mayoreo</option>
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        >
          <option value="">Todos los estados</option>
          <option value="cobrada">Cobrada</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Folio</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Canal</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Sin ventas con esos filtros.
                </td>
              </tr>
            )}
            {items.map((v) => (
              <tr key={v.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{v.folio}</td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(v.createdAt).toLocaleString("es-MX", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </td>
                <td className="px-4 py-2 text-slate-500">{v.canal}</td>
                <td
                  className={`px-4 py-2 font-medium ${ESTADO_COLOR[v.estado] ?? "text-slate-600"}`}
                >
                  {v.estado}
                </td>
                <td className="px-4 py-2 text-right font-semibold text-slate-800">
                  ${Number.parseFloat(v.total).toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => verDetalle(v.id)}
                    className="text-brand hover:underline"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{detalle.folio}</h2>
              <button type="button" onClick={() => setDetalle(null)} className="text-slate-400">
                <X size={20} />
              </button>
            </div>
            <table className="mb-3 w-full text-sm">
              <tbody>
                {detalle.lineas.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="py-1 text-slate-700">
                      {l.cantidad}× {l.descripcion}
                    </td>
                    <td className="py-1 text-right text-slate-700">
                      ${Number.parseFloat(l.total).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 border-t border-slate-200 pt-2 text-sm">
              <Row label="Subtotal" val={detalle.subtotal} />
              <Row label="IVA" val={detalle.impuestos} />
              <div className="flex justify-between text-lg font-bold text-slate-900">
                <span>Total</span>
                <span>${Number.parseFloat(detalle.total).toFixed(2)}</span>
              </div>
              <div className="pt-2 text-slate-500">
                Pagos:{" "}
                {detalle.pagos
                  .map((p) => `${p.metodo} $${Number.parseFloat(p.monto).toFixed(2)}`)
                  .join(", ")}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span>${Number.parseFloat(val).toFixed(2)}</span>
    </div>
  );
}
