import { ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    (async () => {
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar el resumen");
      }
    })();
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
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
          color={data.bajoStock.length > 0 ? "text-red-600" : "text-emerald-600"}
        />
      </div>

      <h2 className="mb-3 text-lg font-bold text-slate-800">Alertas de inventario</h2>
      {data.bajoStock.length === 0 ? (
        <p className="flex items-center gap-1.5 text-slate-400 text-sm">
          <ThumbsUp size={15} /> Todo el inventario está por encima del mínimo.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2">Sucursal</th>
                <th className="px-4 py-2 text-right">Stock</th>
                <th className="px-4 py-2 text-right">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {data.bajoStock.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {i.variante.producto.nombre}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{i.sucursal.codigo}</td>
                  <td className="px-4 py-2 text-right font-semibold text-red-600">
                    {i.stockActual}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500">{i.stockMinimo}</td>
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
