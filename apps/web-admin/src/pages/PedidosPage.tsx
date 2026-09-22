import { MapPin, Settings, Store, Tag, Truck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPedido } from "../components/ChatPedido.js";
import { EfectosPostpagoPanel } from "../components/EfectosPostpagoPanel.js";
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
  metodoPago: string;
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
  if (estado === "cancelado") return "bg-danger-light text-danger";
  if (["entregado", "recogido"].includes(estado)) return "bg-ok-light text-ok";
  if (["enviado", "en_camino", "listo_pickup"].includes(estado)) return "bg-info-light text-info";
  return "bg-warn-light text-warn";
}

export function PedidosPage() {
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [listBusy, setListBusy] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const listGeneration = useRef(0);
  const listController = useRef<AbortController | null>(null);
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
    const current = ++listGeneration.current;
    listController.current?.abort();
    const controller = new AbortController();
    listController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    setListBusy(true);
    setListError(null);
    setDetalle(null);
    const qs = filtro ? `?statusPedido=${encodeURIComponent(filtro)}` : "";
    void api<{ items: PedidoRow[] }>(`/t/pedidos-ecommerce${qs}`, { signal: controller.signal })
      .then((result) => {
        if (!Array.isArray(result.items)) throw new Error("Respuesta inválida");
        if (current === listGeneration.current) setPedidos(result.items);
      })
      .catch(() => {
        if (current === listGeneration.current)
          setListError("No pudimos cargar los pedidos. Revisa tu conexión y vuelve a intentar.");
      })
      .finally(() => {
        clearTimeout(timeout);
        if (current === listGeneration.current) setListBusy(false);
      });
  }, [filtro]);

  useEffect(() => {
    cargar();
    return () => {
      listGeneration.current++;
      listController.current?.abort();
    };
  }, [cargar]);

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
    if (listBusy || listError) return;
    const current = listGeneration.current;
    setError(null);
    try {
      const result = await api<PedidoDetalle>(`/t/pedidos-ecommerce/${id}`);
      if (current === listGeneration.current) setDetalle(result);
    } catch (err) {
      if (current === listGeneration.current)
        setError(err instanceof ApiError ? err.message : "Error al cargar pedido");
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Pedidos online</h1>
        <div className="flex flex-wrap items-center gap-2">
          {puedeConfigurar && config && (
            <button
              type="button"
              onClick={() => setEditorAbierto(true)}
              className="gx-btn-secondary"
            >
              <Settings size={16} /> Personalizar estados
            </button>
          )}
          <select
            aria-label="Filtrar pedidos por estado"
            data-tour="ped-filtro"
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

      {puedeGestionar ? <EfectosPostpagoPanel /> : null}

      {listError ? (
        <div role="alert" className="gx-card mb-4">
          <p className="text-danger">{listError}</p>
          <button type="button" className="gx-btn-secondary mt-3 min-h-11" onClick={cargar}>
            Reintentar consulta de pedidos
          </button>
        </div>
      ) : null}
      {listBusy ? (
        <output className="gx-card block text-slate-500">Cargando pedidos…</output>
      ) : null}
      {!listBusy && !listError ? (
        <div className="gx-table-wrap">
          <table className="gx-table min-w-[720px]">
            <thead>
              <tr>
                <th className="gx-th">Folio</th>
                <th className="gx-th">Fecha</th>
                <th className="gx-th">Comprador</th>
                <th className="gx-th">Entrega</th>
                <th className="gx-th">Estado</th>
                <th className="gx-th">Asignado</th>
                <th className="gx-th text-right">Total</th>
                <th className="gx-th" />
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id}>
                  <td className="gx-td font-medium">{p.folioPublico}</td>
                  <td className="gx-td text-slate-500">
                    {new Date(p.createdAt).toLocaleDateString("es-MX")}
                  </td>
                  <td className="gx-td">{p.cliente?.nombre ?? p.emailComprador}</td>
                  <td className="gx-td">
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
                  <td className="gx-td">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${badgeColor(p.statusPedido)}`}
                    >
                      {p.statusLabel ?? etiqueta(p.statusPedido)}
                    </span>
                  </td>
                  <td className="gx-td text-slate-500">
                    {p.asignadoA?.nombre ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="gx-td text-right font-semibold">${Number(p.total).toFixed(2)}</td>
                  <td className="gx-td text-right">
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
                  <td className="gx-td py-8 text-center text-slate-400" colSpan={8}>
                    Sin pedidos {filtro ? `en estado "${etiqueta(filtro)}"` : "todavía"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

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
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
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
          <>
            {pedido.metodoPago === "cod" && pedido.statusPago === "pendiente" && (
              <CobroEnMostrador pedido={pedido} onChanged={onChanged} />
            )}
            <AvanzarSeccion pedido={pedido} etiqueta={etiqueta} onChanged={onChanged} />
          </>
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
      {error && <p className="mt-2 text-danger text-sm">{error}</p>}
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
                className="gx-btn-secondary"
              >
                <Tag size={15} /> Descargar etiqueta
              </a>
            )}
            <button
              type="button"
              onClick={cancelar}
              disabled={busy}
              className="gx-btn-secondary disabled:opacity-50"
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
            className="gx-btn-primary disabled:opacity-50"
          >
            {busy ? "Generando…" : "Generar guía"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-danger text-sm">{error}</p>}
    </div>
  );
}

/**
 * Pedido que se paga al recoger: al cobrarlo queda igual que un pago en línea
 * (genera su venta y descuenta inventario), así el corte de caja cuadra.
 */
function CobroEnMostrador({
  pedido,
  onChanged,
}: {
  pedido: PedidoDetalle;
  onChanged: () => void;
}) {
  const [metodo, setMetodo] = useState("efectivo");
  const [referencia, setReferencia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cobrar() {
    if (!puede("ecommerce.pedidos_gestionar")) return;
    setGuardando(true);
    setError(null);
    try {
      await api(`/t/pedidos-ecommerce/${pedido.id}/pago-recibido`, {
        body: { metodo, ...(referencia.trim() ? { referencia: referencia.trim() } : {}) },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el cobro");
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-lg border border-warn/40 bg-warn/5 p-3">
      <h3 className="mb-1 font-bold text-slate-700 text-sm">Cobrar al entregar</h3>
      <p className="mb-2 text-slate-600 text-xs">
        Este pedido se paga al recoger. Registra el cobro de ${pedido.total} cuando el cliente
        pague: se genera su venta y se descuenta el inventario.
      </p>
      <div className="mb-2 flex flex-wrap gap-2">
        <select
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          className="gx-input flex-1"
        >
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta en terminal</option>
          <option value="transferencia">Transferencia</option>
        </select>
        <input
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          placeholder="Referencia (opcional)"
          className="gx-input flex-1"
        />
      </div>
      {error && <p className="mb-2 text-danger text-sm">{error}</p>}
      <button
        type="button"
        onClick={cobrar}
        disabled={guardando}
        className="gx-btn-primary w-full disabled:opacity-50"
      >
        {guardando ? "Registrando…" : `Registrar cobro de $${pedido.total}`}
      </button>
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
      <div className="mb-2 flex flex-wrap gap-2">
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
        <div className="mb-2 flex flex-wrap gap-2">
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
          className="gx-input mb-2"
        />
      )}
      {error && <p className="mb-2 text-danger text-sm">{error}</p>}
      <button
        type="button"
        onClick={transicionar}
        disabled={guardando}
        className="gx-btn-primary w-full disabled:opacity-50"
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
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-w-md">
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
                className="gx-input"
              />
            </label>
          ))}
        </div>
        {error && <p className="mt-3 text-danger text-sm">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="gx-btn-primary disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
