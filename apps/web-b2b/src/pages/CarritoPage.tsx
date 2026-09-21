import { useEffect, useState, type ChangeEvent } from "react";
import { ApiError, api } from "../lib/api.js";
import { type LineaCarrito, leer, onCambio, quitar, setCantidad, vaciar } from "../lib/carrito.js";
import { PERMISOS } from "../lib/permisos.js";
import type { Direccion, Me } from "../lib/types.js";

export function CarritoPage({
  onVerPedidos,
  puedeHacer,
}: {
  onVerPedidos: () => void;
  puedeHacer: (permiso: string) => boolean;
}) {
  const [items, setItems] = useState<LineaCarrito[]>(leer());
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [requiereOc, setRequiereOc] = useState(false);
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
    api<Me>("/b2b-portal/me")
      .then((m) => setRequiereOc(m.empresa.requiereOrdenCompra))
      .catch(() => undefined);
  }, []);

  const total = items.reduce((acc, i) => acc + Number(i.precio) * i.cantidad, 0);

  async function crearPedido() {
    setError(null);
    if (requiereOc && oc.trim() === "") {
      setError("Tu empresa requiere orden de compra para crear pedidos.");
      return;
    }
    setEnviando(true);
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear el pedido");
    } finally {
      setEnviando(false);
    }
  }

  if (folio) {
    return (
      <div className="gx-card max-w-xl text-center">
        <p className="text-lg font-bold text-ok">¡Pedido creado!</p>
        <p className="mt-2 text-slate-600">
          Folio <span className="font-mono font-semibold">{folio}</span>. Puedes seguirlo en la
          sección Pedidos.
        </p>
        <button type="button" onClick={onVerPedidos} className="gx-btn-primary mt-4">
          Ver mis pedidos
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="gx-card text-center text-slate-500">
        Tu carrito está vacío. Agrega productos desde el catálogo.
      </p>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Mi pedido</h1>
      <div className="gx-table-wrap mb-4">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Producto</th>
              <th className="gx-th">Precio</th>
              <th className="gx-th">Cantidad</th>
              <th className="gx-th text-right">Importe</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.varianteId}>
                <td className="gx-td">
                  <p className="font-medium">{i.nombre}</p>
                  <p className="text-xs text-slate-500">{i.sku}</p>
                </td>
                <td className="gx-td">${Number(i.precio).toFixed(2)}</td>
                <td className="gx-td">
                  <InputCantidad varianteId={i.varianteId} cantidad={i.cantidad} />
                </td>
                <td className="gx-td text-right font-semibold">
                  ${(Number(i.precio) * i.cantidad).toFixed(2)}
                </td>
                <td className="gx-td text-right">
                  <button type="button" onClick={() => quitar(i.varianteId)} className="gx-btn-ghost">
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="gx-card grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="gx-label">Dirección de envío</span>
          <select
            value={direccionEnvioId}
            onChange={(e) => setDireccionEnvioId(e.target.value)}
            className="gx-input"
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
          <span className="gx-label">
            Orden de compra{requiereOc ? " (requerida)" : ""}
          </span>
          <input
            value={oc}
            onChange={(e) => setOc(e.target.value)}
            placeholder={requiereOc ? "Tu empresa la requiere" : "OC-12345 (si tu empresa la requiere)"}
            required={requiereOc}
            aria-required={requiereOc}
            className="gx-input"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="gx-label">Notas</span>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="gx-input"
          />
        </label>
      </div>

      <div className="gx-card mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Total estimado (sin envío)</p>
          <p className="text-2xl font-bold text-slate-800">${total.toFixed(2)}</p>
        </div>
        {puedeHacer(PERMISOS.crearPedido) ? (
          <button
            type="button"
            onClick={crearPedido}
            disabled={enviando}
            className="gx-btn-primary px-6 py-3"
          >
            {enviando ? "Enviando…" : "Confirmar pedido"}
          </button>
        ) : (
          <p className="text-sm text-slate-500">Tu usuario no tiene permiso para crear pedidos.</p>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}

/**
 * Cantidad editable libremente: permite borrar el campo mientras se teclea y
 * solo persiste valores enteros ≥ 1 (cantidades < 1 eliminan la línea).
 */
function InputCantidad({ varianteId, cantidad }: { varianteId: string; cantidad: number }) {
  const [valor, setValor] = useState(String(cantidad));

  useEffect(() => setValor(String(cantidad)), [cantidad]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValor(v);
    const n = Number(v);
    if (v !== "" && Number.isInteger(n) && n >= 1) setCantidad(varianteId, n);
  }

  return (
    <input
      type="number"
      min={1}
      value={valor}
      onChange={handleChange}
      aria-label="Cantidad"
      className="gx-input w-24"
    />
  );
}
