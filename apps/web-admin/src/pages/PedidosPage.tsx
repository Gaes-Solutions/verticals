import { MapPin, Settings, Store, Tag, Truck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ChatPedido } from "../components/ChatPedido.js";
import { ApiError, api, getUserId, puede } from "../lib/api.js";

interface UsuarioRef {
  id: string;
  nombre: string;
}

interface PedidoRow {
  id: string;
  folioPublico: string;
  emailComprador: string;
  cliente: { nombre: string } | null;
  asignadoA: UsuarioRef | null;
  metodoEnvio: string;
  statusPedido: string;
  statusLabel: string;
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
  envio: {
    guiaTracking: string | null;
    etiquetaUrl: string | null;
    trackingUrl: string | null;
    statusExterno: string | null;
    proveedorLogistico: string | null;
    carrierReal: string | null;
  } | null;
}

interface ConfigEstados {
  etiquetas: Record<string, string>;
  defaults: Record<string, string>;
  estados: string[];
}

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
  const [config, setConfig] = useState<ConfigEstados | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioRef[]>([]);
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeGestionar = puede("ecommerce.pedidos_gestionar");
  const puedeConfigurar = puede("ecommerce.configurar");

  const etiqueta = useCallback((estado: string) => config?.etiquetas[estado] ?? estado, [config]);

  const cargar = useCallback(() => {
    const qs = filtro ? `?statusPedido=${filtro}` : "";
    api<{ items: PedidoRow[] }>(`/t/pedidos-ecommerce${qs}`)
      .then((r) => setPedidos(r.items))
      .catch(() => setPedidos([]));
  }, [filtro]);

  useEffect(() => cargar(), [cargar]);

  useEffect(() => {
    api<ConfigEstados>("/t/pedidos-ecommerce/config")
      .then(setConfig)
      .catch(() => {});
    if (puedeGestionar) {
      api<UsuarioRef[]>("/t/usuarios")
        .then((u) => setUsuarios(u.filter(Boolean)))
        .catch(() => {});
    }
  }, [puedeGestionar]);

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Pedidos online</h1>
        <div className="flex items-center gap-2">
          {puedeConfigurar && config && (
            <button
              type="button"
              onClick={() => setEditorAbierto(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-slate-600 text-sm hover:bg-slate-50"
            >
              <Settings size={16} /> Personalizar estados
            </button>
          )}
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Todos los estados</option>
            {(config?.estados ?? []).map((k) => (
              <option key={k} value={k}>
                {etiqueta(k)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Folio</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Comprador</th>
              <th className="px-4 py-2">Entrega</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Asignado</th>
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
                  <span className="inline-flex items-center gap-1">
                    {p.metodoEnvio === "click_collect" ? (
                      <>
                        <Store size={14} /> Pickup
                      </>
                    ) : (
                      <>
                        <Truck size={14} /> Envío
                      </>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${badgeColor(p.statusPedido)}`}
                  >
                    {p.statusLabel ?? etiqueta(p.statusPedido)}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {p.asignadoA?.nombre ?? <span className="text-slate-300">—</span>}
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
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Sin pedidos {filtro ? `en estado "${etiqueta(filtro)}"` : "todavía"}.
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
          etiqueta={etiqueta}
          usuarios={usuarios}
          puedeGestionar={puedeGestionar}
          onClose={() => setDetalle(null)}
          onChanged={() => {
            setDetalle(null);
            cargar();
          }}
        />
      )}

      {editorAbierto && config && (
        <EditorEstadosModal
          config={config}
          onClose={() => setEditorAbierto(false)}
          onSaved={(etiquetas) => {
            setConfig({ ...config, etiquetas });
            setEditorAbierto(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function DetalleModal({
  pedido,
  etiqueta,
  usuarios,
  puedeGestionar,
  onClose,
  onChanged,
}: {
  pedido: PedidoDetalle;
  etiqueta: (estado: string) => string;
  usuarios: UsuarioRef[];
  puedeGestionar: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const esFinal = ["cancelado", "recogido"].includes(pedido.statusPedido);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{pedido.folioPublico}</h2>
            <p className="text-sm text-slate-500">{pedido.emailComprador}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
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
          <p className="mb-4 flex items-start gap-1.5 text-sm text-slate-600">
            <MapPin size={16} className="mt-0.5 shrink-0" />
            <span>
              {pedido.direccionEnvio.calle}, {pedido.direccionEnvio.ciudad},{" "}
              {pedido.direccionEnvio.estado} CP {pedido.direccionEnvio.cp}
            </span>
          </p>
        )}
        {pedido.ventaGenerada && (
          <p className="mb-4 text-sm text-slate-500">
            Venta generada: {pedido.ventaGenerada.folio}
          </p>
        )}

        {puedeGestionar && <AsignarSeccion pedido={pedido} usuarios={usuarios} />}

        {puedeGestionar && pedido.metodoEnvio === "paqueteria" && (
          <GuiaSeccion pedido={pedido} onChanged={onChanged} />
        )}

        <ChatPedido pedidoId={pedido.id} />

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
            Pedido en estado final ({etiqueta(pedido.statusPedido)}).
            {pedido.canceladoMotivo && ` Motivo: ${pedido.canceladoMotivo}`}
          </p>
        ) : !puedeGestionar ? (
          <p className="text-sm text-slate-400">No tienes permiso para avanzar pedidos.</p>
        ) : (
          <AvanzarSeccion pedido={pedido} etiqueta={etiqueta} onChanged={onChanged} />
        )}
      </div>
    </div>
  );
}

function AsignarSeccion({
  pedido,
  usuarios,
}: {
  pedido: PedidoDetalle;
  usuarios: UsuarioRef[];
}) {
  const [asignado, setAsignado] = useState<UsuarioRef | null>(pedido.asignadoA);
  const [error, setError] = useState<string | null>(null);
  const miId = getUserId();

  async function asignar(usuarioId: string | null) {
    setError(null);
    try {
      const r = await api<{ asignadoA: UsuarioRef | null }>(
        `/t/pedidos-ecommerce/${pedido.id}/asignar`,
        { method: "PATCH", body: { usuarioId } },
      );
      setAsignado(r.asignadoA);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al asignar");
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 font-bold text-slate-700 text-sm">Quién lo surte</h3>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={asignado?.id ?? ""}
          onChange={(e) => asignar(e.target.value || null)}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Sin asignar</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
        {miId && asignado?.id !== miId && (
          <button
            type="button"
            onClick={() => asignar(miId)}
            className="rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-700 text-sm hover:bg-slate-200"
          >
            Asignarme
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
    </div>
  );
}

/** Auto-guía de paquetería: generar, descargar etiqueta PDF, cancelar. */
function GuiaSeccion({ pedido, onChanged }: { pedido: PedidoDetalle; onChanged: () => void }) {
  const [envio, setEnvio] = useState(pedido.envio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    setError(null);
    setBusy(true);
    try {
      const r = await api<{
        guia: { trackingNumber: string; etiquetaUrl: string; carrier: string };
      }>(`/t/envios/${pedido.id}/guia`, { method: "POST", body: {} });
      setEnvio({
        guiaTracking: r.guia.trackingNumber,
        etiquetaUrl: r.guia.etiquetaUrl,
        trackingUrl: null,
        statusExterno: "creada",
        proveedorLogistico: null,
        carrierReal: r.guia.carrier,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar la guía");
    } finally {
      setBusy(false);
    }
  }

  async function cancelar() {
    setError(null);
    setBusy(true);
    try {
      await api(`/t/envios/${pedido.id}/guia/cancelar`, { method: "POST" });
      setEnvio(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar la guía");
    } finally {
      setBusy(false);
    }
  }

  const guia = envio?.guiaTracking;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 font-bold text-slate-700 text-sm">Guía de envío</h3>
      {guia ? (
        <div className="space-y-2 text-sm">
          <p className="text-slate-600">
            {envio?.carrierReal ? `${envio.carrierReal} · ` : ""}
            <span className="font-mono">{guia}</span>
            {envio?.statusExterno && (
              <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-slate-500 text-xs">
                {envio.statusExterno}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {envio?.etiquetaUrl && (
              <a
                href={envio.etiquetaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 font-semibold text-brand text-sm hover:bg-teal-50"
              >
                <Tag size={15} /> Descargar etiqueta
              </a>
            )}
            <button
              type="button"
              onClick={cancelar}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar guía
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-slate-500 text-sm">
            Aún sin guía. Genera una con tu paquetería configurada.
          </p>
          <button
            type="button"
            onClick={generar}
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "Generando…" : "Generar guía"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
    </div>
  );
}

function AvanzarSeccion({
  pedido,
  etiqueta,
  onChanged,
}: {
  pedido: PedidoDetalle;
  etiqueta: (estado: string) => string;
  onChanged: () => void;
}) {
  const opciones = estadosSiguientes(pedido);
  const [nuevoEstado, setNuevoEstado] = useState(opciones[0] ?? "");
  const [guia, setGuia] = useState(pedido.guiaTracking ?? "");
  const [paqueteria, setPaqueteria] = useState(pedido.paqueteria ?? "estafeta");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              {etiqueta(o)}
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
      {error && <p className="mb-2 text-red-600 text-sm">{error}</p>}
      <button
        type="button"
        onClick={transicionar}
        disabled={guardando}
        className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {guardando ? "Guardando…" : `Marcar como ${etiqueta(nuevoEstado)}`}
      </button>
    </div>
  );
}

function EditorEstadosModal({
  config,
  onClose,
  onSaved,
}: {
  config: ConfigEstados;
  onClose: () => void;
  onSaved: (etiquetas: Record<string, string>) => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() => ({ ...config.etiquetas }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await api<{ etiquetas: Record<string, string> }>("/t/pedidos-ecommerce/config", {
        method: "PUT",
        body: { etiquetasEstado: valores },
      });
      onSaved(r.etiquetas);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6">
        <div className="mb-2 flex items-start justify-between">
          <h2 className="font-bold text-lg text-slate-800">Personalizar estados</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <p className="mb-4 text-slate-500 text-sm">
          Ponle a cada estado el nombre que usa tu negocio (ej. "Surtido", "En proceso"). El cliente
          y tu equipo verán estos nombres.
        </p>
        <div className="space-y-3">
          {config.estados.map((estado) => (
            <label key={estado} className="block">
              <span className="mb-1 block text-slate-500 text-xs">{config.defaults[estado]}</span>
              <input
                value={valores[estado] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [estado]: e.target.value }))}
                placeholder={config.defaults[estado]}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </label>
          ))}
        </div>
        {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 text-sm hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
