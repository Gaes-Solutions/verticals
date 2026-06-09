import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface Sucursal {
  id: string;
  codigo: string;
  nombre: string;
}

interface OcRow {
  id: string;
  folio: string;
  proveedorRazonSocial: string;
  estado: string;
  total: string;
  fechaCreacion: string;
}

interface OcLinea {
  id: string;
  numero: number;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  cantidadRecibida: string;
}

interface OcDetalle extends OcRow {
  proveedorRfc: string;
  observaciones: string | null;
  subtotal: string;
  ivaTotal: string;
  lineas: OcLinea[];
}

const ESTADOS: Record<string, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  recibida_parcial: "Recibida parcial",
  recibida_total: "Recibida",
  cancelada: "Cancelada",
};

function badge(estado: string): string {
  if (estado === "cancelada") return "gx-badge-danger";
  if (estado === "recibida_total") return "gx-badge-ok";
  if (estado === "recibida_parcial" || estado === "enviada") return "gx-badge-info";
  return "gx-badge-warn";
}

export function ComprasPage() {
  const [ordenes, setOrdenes] = useState<OcRow[]>([]);
  const [filtro, setFiltro] = useState("");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [creando, setCreando] = useState(false);
  const [detalle, setDetalle] = useState<OcDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    const qs = filtro ? `?estado=${filtro}` : "";
    api<{ items: OcRow[] }>(`/t/ordenes-compra${qs}`)
      .then((r) => setOrdenes(r.items))
      .catch(() => setOrdenes([]));
  }, [filtro]);

  useEffect(() => cargar(), [cargar]);
  useEffect(() => {
    api<Sucursal[]>("/t/sucursales")
      .then(setSucursales)
      .catch(() => setSucursales([]));
  }, []);

  async function abrir(id: string) {
    setError(null);
    try {
      setDetalle(await api<OcDetalle>(`/t/ordenes-compra/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error");
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Órdenes de compra</h1>
        <div className="flex flex-wrap gap-2">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            {Object.entries(ESTADOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setCreando(true)} className="gx-btn-primary">
            + Nueva orden
          </button>
        </div>
      </div>

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Folio</th>
              <th className="gx-th">Proveedor</th>
              <th className="gx-th">Fecha</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th text-right">Total</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {ordenes.map((o) => (
              <tr key={o.id}>
                <td className="gx-td font-medium">{o.folio}</td>
                <td className="gx-td">{o.proveedorRazonSocial}</td>
                <td className="gx-td text-slate-500">
                  {new Date(o.fechaCreacion).toLocaleDateString("es-MX")}
                </td>
                <td className="gx-td">
                  <span className={badge(o.estado)}>{ESTADOS[o.estado] ?? o.estado}</span>
                </td>
                <td className="gx-td text-right font-semibold">${Number(o.total).toFixed(2)}</td>
                <td className="gx-td text-right">
                  <button
                    type="button"
                    onClick={() => abrir(o.id)}
                    className="font-semibold text-brand hover:underline"
                  >
                    Gestionar
                  </button>
                </td>
              </tr>
            ))}
            {ordenes.length === 0 && (
              <tr>
                <td colSpan={6} className="gx-td py-8 text-center text-slate-400">
                  Sin órdenes de compra.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {creando && (
        <NuevaOcModal
          sucursales={sucursales}
          onClose={() => setCreando(false)}
          onCreada={() => {
            setCreando(false);
            cargar();
          }}
        />
      )}
      {detalle && (
        <DetalleOcModal
          oc={detalle}
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

interface LineaNueva {
  productoId?: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
}

function NuevaOcModal({
  sucursales,
  onClose,
  onCreada,
}: {
  sucursales: Sucursal[];
  onClose: () => void;
  onCreada: () => void;
}) {
  const [proveedorRfc, setProveedorRfc] = useState("");
  const [proveedorRazonSocial, setProveedorRazonSocial] = useState("");
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id ?? "");
  const [observaciones, setObservaciones] = useState("");
  const [lineas, setLineas] = useState<LineaNueva[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<
    Array<{
      id: string;
      nombre: string;
      variantes: Array<{ costoUltimo?: string; precioBase: string }>;
    }>
  >([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ items: typeof resultados }>(`/t/productos?q=${encodeURIComponent(busqueda)}`)
        .then((r) => setResultados(r.items))
        .catch(() => setResultados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  function agregarProducto(p: (typeof resultados)[number]) {
    const v = p.variantes[0];
    setLineas((prev) => [
      ...prev,
      {
        productoId: p.id,
        descripcion: p.nombre,
        cantidad: "1",
        precioUnitario:
          v?.costoUltimo && Number(v.costoUltimo) > 0 ? v.costoUltimo : (v?.precioBase ?? "0"),
      },
    ]);
    setBusqueda("");
    setResultados([]);
  }

  function setLinea(idx: number, campo: keyof LineaNueva, valor: string) {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)));
  }

  const total = lineas.reduce((acc, l) => acc + Number(l.cantidad) * Number(l.precioUnitario), 0);

  async function crear() {
    setGuardando(true);
    setError(null);
    try {
      await api("/t/ordenes-compra", {
        body: {
          sucursalId,
          proveedorRfc,
          proveedorRazonSocial,
          ...(observaciones.trim() ? { observaciones } : {}),
          lineas: lineas.map((l) => ({
            ...(l.productoId ? { productoId: l.productoId } : {}),
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario,
          })),
        },
      });
      onCreada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear la orden");
      setGuardando(false);
    }
  }

  const puedeCrear =
    proveedorRfc.trim() && proveedorRazonSocial.trim() && sucursalId && lineas.length > 0;

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-w-2xl">
        <h2 className="mb-4 text-lg font-bold text-slate-800">Nueva orden de compra</h2>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="gx-label">RFC del proveedor</span>
            <input
              value={proveedorRfc}
              onChange={(e) => setProveedorRfc(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Razón social</span>
            <input
              value={proveedorRazonSocial}
              onChange={(e) => setProveedorRazonSocial(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Sucursal destino</span>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="gx-input"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="gx-label">Observaciones</span>
            <input
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="gx-input"
            />
          </label>
        </div>

        <div className="relative mb-3">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto para agregar…"
            className="gx-input"
          />
          {resultados.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-card">
              {resultados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregarProducto(p)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        {lineas.length > 0 && (
          <div className="mb-3 space-y-2">
            {lineas.map((l, idx) => (
              <div
                key={`${idx}-${l.descripcion}`}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="flex-1 font-medium">{l.descripcion}</span>
                <input
                  value={l.cantidad}
                  onChange={(e) => setLinea(idx, "cantidad", e.target.value)}
                  type="number"
                  className="w-20 rounded border border-slate-300 px-2 py-1"
                  placeholder="cant."
                />
                <input
                  value={l.precioUnitario}
                  onChange={(e) => setLinea(idx, "precioUnitario", e.target.value)}
                  type="number"
                  className="w-24 rounded border border-slate-300 px-2 py-1"
                  placeholder="costo"
                />
                <span className="w-24 text-right font-semibold">
                  ${(Number(l.cantidad) * Number(l.precioUnitario)).toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => setLineas((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-xs text-slate-400 hover:text-danger"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
              <span>Total (sin IVA)</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-ghost">
            Cancelar
          </button>
          <button
            type="button"
            onClick={crear}
            disabled={guardando || !puedeCrear}
            className="gx-btn-primary"
          >
            {guardando ? "Creando…" : "Crear orden"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetalleOcModal({
  oc,
  onClose,
  onChanged,
}: {
  oc: OcDetalle;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [recepcion, setRecepcion] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeAutorizar = oc.estado === "borrador";
  const puedeRecibir = oc.estado === "enviada" || oc.estado === "recibida_parcial";
  const puedeCancelar = ["borrador", "enviada", "recibida_parcial"].includes(oc.estado);

  async function accion(fn: () => Promise<unknown>) {
    setGuardando(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error");
      setGuardando(false);
    }
  }

  function recibir() {
    const lineas = Object.entries(recepcion)
      .filter(([, v]) => Number(v) > 0)
      .map(([lineaId, v]) => ({ lineaId, cantidadRecibida: v }));
    if (lineas.length === 0) {
      setError("Captura cuánto recibiste de al menos una línea");
      return;
    }
    void accion(() => api(`/t/ordenes-compra/${oc.id}/recibir`, { body: { lineas } }));
  }

  function cancelar() {
    const motivo = window.prompt("Motivo de la cancelación:");
    if (!motivo) return;
    void accion(() => api(`/t/ordenes-compra/${oc.id}/cancelar`, { body: { motivo } }));
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-w-2xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{oc.folio}</h2>
            <p className="text-sm text-slate-500">
              {oc.proveedorRazonSocial} · {oc.proveedorRfc}
            </p>
          </div>
          <span className={badge(oc.estado)}>{ESTADOS[oc.estado] ?? oc.estado}</span>
        </div>

        <div className="gx-table-wrap mb-3">
          <table className="gx-table">
            <thead>
              <tr>
                <th className="gx-th">Producto</th>
                <th className="gx-th text-right">Pedido</th>
                <th className="gx-th text-right">Recibido</th>
                <th className="gx-th text-right">Costo</th>
                {puedeRecibir && <th className="gx-th text-right">Recibir ahora</th>}
              </tr>
            </thead>
            <tbody>
              {oc.lineas.map((l) => {
                const pendiente = Number(l.cantidad) - Number(l.cantidadRecibida);
                return (
                  <tr key={l.id}>
                    <td className="gx-td">{l.descripcion}</td>
                    <td className="gx-td text-right">{Number(l.cantidad)}</td>
                    <td className="gx-td text-right">{Number(l.cantidadRecibida)}</td>
                    <td className="gx-td text-right">${Number(l.precioUnitario).toFixed(2)}</td>
                    {puedeRecibir && (
                      <td className="gx-td text-right">
                        {pendiente > 0 ? (
                          <input
                            type="number"
                            min={0}
                            max={pendiente}
                            value={recepcion[l.id] ?? ""}
                            onChange={(e) =>
                              setRecepcion((prev) => ({ ...prev, [l.id]: e.target.value }))
                            }
                            placeholder={`máx ${pendiente}`}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          <span className="text-xs text-ok">completa</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mb-4 flex justify-between text-sm">
          <span className="text-slate-500">
            Subtotal ${Number(oc.subtotal).toFixed(2)} · IVA ${Number(oc.ivaTotal).toFixed(2)}
          </span>
          <span className="font-bold">Total ${Number(oc.total).toFixed(2)}</span>
        </div>

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-ghost">
            Cerrar
          </button>
          {puedeCancelar && (
            <button type="button" onClick={cancelar} disabled={guardando} className="gx-btn-danger">
              Cancelar OC
            </button>
          )}
          {puedeAutorizar && (
            <button
              type="button"
              onClick={() =>
                accion(() => api(`/t/ordenes-compra/${oc.id}/autorizar`, { body: {} }))
              }
              disabled={guardando}
              className="gx-btn-primary"
            >
              Autorizar y enviar
            </button>
          )}
          {puedeRecibir && (
            <button type="button" onClick={recibir} disabled={guardando} className="gx-btn-primary">
              {guardando ? "Guardando…" : "Registrar recepción"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
