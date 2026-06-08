import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";
import { type LineaCarrito, leer, onCambio, quitar, setCantidad, vaciar } from "../lib/carrito.js";
import type { Direccion } from "../lib/types.js";

export function CarritoPage({ onPedidoCreado }: { onPedidoCreado: () => void }) {
  const [items, setItems] = useState<LineaCarrito[]>(leer());
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [direccionEnvioId, setDireccionEnvioId] = useState("");
  const [oc, setOc] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folio, setFolio] = useState<string | null>(null);

  useEffect(() => onCambio(() => setItems(leer())), []);
  useEffect(() => {
    api<Direccion[]>("/b2b-portal/direcciones")
      .then(setDirecciones)
      .catch(() => setDirecciones([]));
  }, []);

  const total = items.reduce((acc, i) => acc + Number(i.precio) * i.cantidad, 0);

  async function crearPedido() {
    setEnviando(true);
    setError(null);
    try {
      const res = await api<{ folio: string; estadoAprobacion: string }>("/b2b-portal/pedidos", {
        body: {
          lineas: items.map((i) => ({ varianteId: i.varianteId, cantidad: String(i.cantidad) })),
          ...(direccionEnvioId ? { direccionEnvioId } : {}),
          ...(oc.trim() ? { ordenCompraCliente: oc.trim() } : {}),
          ...(notas.trim() ? { notas: notas.trim() } : {}),
        },
      });
      vaciar();
      setItems([]);
      setFolio(res.folio);
      onPedidoCreado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear el pedido");
    } finally {
      setEnviando(false);
    }
  }

  if (folio) {
    return (
      <div className="max-w-xl rounded-xl bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-bold text-emerald-600">¡Pedido creado!</p>
        <p className="mt-2 text-slate-600">
          Folio <span className="font-mono font-semibold">{folio}</span>. Puedes seguirlo en la
          sección Pedidos.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm">
        Tu carrito está vacío. Agrega productos desde el catálogo.
      </p>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Mi pedido</h1>
      <div className="mb-4 overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Producto</th>
              <th className="px-4 py-2">Precio</th>
              <th className="px-4 py-2">Cantidad</th>
              <th className="px-4 py-2 text-right">Importe</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.varianteId} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <p className="font-medium">{i.nombre}</p>
                  <p className="text-xs text-slate-400">{i.sku}</p>
                </td>
                <td className="px-4 py-2">${Number(i.precio).toFixed(2)}</td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={1}
                    value={i.cantidad}
                    onChange={(e) => setCantidad(i.varianteId, Math.max(1, Number(e.target.value)))}
                    className="w-20 rounded border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="px-4 py-2 text-right font-semibold">
                  ${(Number(i.precio) * i.cantidad).toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => quitar(i.varianteId)}
                    className="text-xs text-slate-400 hover:text-red-500"
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Dirección de envío</span>
          <select
            value={direccionEnvioId}
            onChange={(e) => setDireccionEnvioId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— Por definir con el vendedor —</option>
            {direcciones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.etiqueta} · {d.ciudad ?? ""} {d.codigoPostal ?? ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Orden de compra</span>
          <input
            value={oc}
            onChange={(e) => setOc(e.target.value)}
            placeholder="OC-12345 (si tu empresa la requiere)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">Notas</span>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm text-slate-500">Total estimado (sin envío)</p>
          <p className="text-2xl font-bold text-slate-800">${total.toFixed(2)}</p>
        </div>
        <button
          type="button"
          onClick={crearPedido}
          disabled={enviando}
          className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "Confirmar pedido"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
