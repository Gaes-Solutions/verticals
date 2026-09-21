import { ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import type { InventarioItem, Paged, VentaListItem } from "../lib/types.js";

interface Resumen {
  ventasHoyTotal: number;
  ventasHoyCount: number;
  bajoStock: InventarioItem[];
}

export function DashboardPage() {
  const [data, setData] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const inicioHoy = new Date();
      inicioHoy.setHours(0, 0, 0, 0);
      const [ventas, inv] = await Promise.all([
        api<Paged<VentaListItem>>(
          `/t/ventas?estado=cobrada&desde=${inicioHoy.toISOString()}&pageSize=200`,
        ),
        api<Paged<InventarioItem>>("/t/inventario?stockBajoMinimo=true&pageSize=50"),
      ]);
      const ventasHoyTotal = ventas.items.reduce((s, v) => s + Number.parseFloat(v.total), 0);
      setData({
        ventasHoyTotal,
        ventasHoyCount: ventas.items.length,
        bajoStock: inv.items,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el resumen");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-slate-800">Resumen</h1>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-light p-3 text-danger text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => void cargar()} className="gx-btn-danger">
            Reintentar
          </button>
        </div>
      </div>
    );
  }
  if (!data) return <p className="text-slate-400">Cargando…</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Resumen</h1>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card
          titulo="Ventas de hoy"
          valor={`$${data.ventasHoyTotal.toFixed(2)}`}
          color="text-brand"
        />
        <Card titulo="Tickets de hoy" valor={String(data.ventasHoyCount)} color="text-slate-800" />
        <Card
          titulo="Productos bajo stock"
          valor={String(data.bajoStock.length)}
          color={data.bajoStock.length > 0 ? "text-danger" : "text-ok"}
        />
      </div>

      <h2 className="mb-3 text-lg font-bold text-slate-800">Alertas de inventario</h2>
      {data.bajoStock.length === 0 ? (
        <p className="flex items-center gap-1.5 text-slate-400 text-sm">
          <ThumbsUp size={15} /> Todo el inventario está por encima del mínimo.
        </p>
      ) : (
        <div className="gx-table-wrap">
          <table className="gx-table">
            <thead>
              <tr>
                <th className="gx-th">Producto</th>
                <th className="gx-th">Sucursal</th>
                <th className="gx-th text-right">Stock</th>
                <th className="gx-th text-right">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {data.bajoStock.map((i) => (
                <tr key={i.id}>
                  <td className="gx-td font-medium">{i.variante.producto.nombre}</td>
                  <td className="gx-td text-slate-500">{i.sucursal.codigo}</td>
                  <td className="gx-td text-right font-semibold text-danger">{i.stockActual}</td>
                  <td className="gx-td text-right text-slate-500">{i.stockMinimo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Card({ titulo, valor, color }: { titulo: string; valor: string; color: string }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="mb-1 text-sm text-slate-500">{titulo}</p>
      <p className={`text-3xl font-bold ${color}`}>{valor}</p>
    </div>
  );
}
