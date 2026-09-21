import { Download, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import type { Paged, VentaDetalle, VentaListItem } from "../lib/types.js";

const ESTADO_COLOR: Record<string, string> = {
  cobrada: "text-ok",
  cancelada: "text-danger",
  borrador: "text-slate-400",
};

export function VentasPage() {
  const [items, setItems] = useState<VentaListItem[]>([]);
  const [canal, setCanal] = useState("");
  const [estado, setEstado] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<VentaDetalle | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ pageSize: "50" });
      if (canal) qs.set("canal", canal);
      if (estado) qs.set("estado", estado);
      const res = await api<Paged<VentaListItem>>(`/t/ventas?${qs.toString()}`);
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar las ventas");
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

  const [exportando, setExportando] = useState(false);
  async function exportarCsv() {
    setExportando(true);
    try {
      const CAP = 5000;
      const filas: VentaListItem[] = [];
      for (let page = 1; filas.length < CAP; page++) {
        const qs = new URLSearchParams({ pageSize: "200", page: String(page) });
        if (canal) qs.set("canal", canal);
        if (estado) qs.set("estado", estado);
        const res = await api<Paged<VentaListItem>>(`/t/ventas?${qs.toString()}`);
        filas.push(...res.items);
        if (res.items.length < 200) break;
      }
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const encabezado = ["Folio", "Fecha", "Canal", "Estado", "Total", "Vendedor"];
      const lineas = filas.map((v) =>
        [
          v.folio,
          new Date(v.createdAt).toLocaleString("es-MX"),
          v.canal,
          v.estado,
          v.total,
          v.usuario?.nombre ?? "",
        ]
          .map((c) => esc(String(c)))
          .join(","),
      );
      const csv = `﻿${[encabezado.map(esc).join(","), ...lineas].join("\r\n")}`;
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `ventas-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Ventas</h1>

      <div data-tour="ven-filtros" className="mb-4 flex flex-wrap gap-2">
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className="gx-input">
          <option value="">Todos los canales</option>
          <option value="pos">POS</option>
          <option value="ecommerce">Ecommerce</option>
          <option value="mayoreo">Mayoreo</option>
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="gx-input">
          <option value="">Todos los estados</option>
          <option value="cobrada">Cobrada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <button
          type="button"
          onClick={exportarCsv}
          disabled={exportando || items.length === 0}
          className="gx-btn-secondary ml-auto disabled:opacity-50"
        >
          <Download size={16} />
          {exportando ? "Exportando…" : "Exportar CSV"}
        </button>
      </div>

      {error && !cargando && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-light p-3 text-danger text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => void cargar()} className="gx-btn-danger">
            Reintentar
          </button>
        </div>
      )}

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Folio</th>
              <th className="gx-th">Fecha</th>
              <th className="gx-th">Canal</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th text-right">Total</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td className="gx-td text-slate-400" colSpan={6}>
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && !error && items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={6}>
                  Sin ventas con esos filtros.
                </td>
              </tr>
            )}
            {!cargando &&
              items.map((v) => (
                <tr key={v.id}>
                  <td className="gx-td font-medium">{v.folio}</td>
                  <td className="gx-td text-slate-500">
                    {new Date(v.createdAt).toLocaleString("es-MX", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="gx-td text-slate-500">{v.canal}</td>
                  <td className={`gx-td font-medium ${ESTADO_COLOR[v.estado] ?? "text-slate-600"}`}>
                    {v.estado}
                  </td>
                  <td className="gx-td text-right font-semibold">
                    ${Number.parseFloat(v.total).toFixed(2)}
                  </td>
                  <td className="gx-td text-right">
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
        <div className="gx-modal-overlay">
          <div className="gx-modal-panel max-w-md">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{detalle.folio}</h2>
              <button type="button" onClick={() => setDetalle(null)} className="text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="gx-table-wrap mb-3">
              <table className="gx-table min-w-0">
                <tbody>
                  {detalle.lineas.map((l) => (
                    <tr key={l.id}>
                      <td className="gx-td text-slate-700">
                        {l.cantidad}× {l.descripcion}
                      </td>
                      <td className="gx-td text-right text-slate-700">
                        ${Number.parseFloat(l.total).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
