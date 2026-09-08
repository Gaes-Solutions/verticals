import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Session } from "../App.js";
import { loadToken, puede } from "../lib/api.js";
import {
  type RefundAttempt,
  type RefundScope,
  type RefundStatus,
  loadRefundScope,
  readRefundAttempt,
  recoverRefundAttempt,
  startRefundAttempt,
} from "../lib/devolucion-attempt.js";
import {
  type VentaDevolucion,
  armarDevolucion,
  buscarVentaDevolucion,
  cantidadesDevolucionValidas,
  mensajeFalloDevolucion,
  verificarCajaDevolucion,
} from "../lib/devolucion-safe.js";
import type { DevolucionResultado, MetodoReembolso, MotivoDevolucion } from "../lib/types.js";

const MOTIVOS: { value: MotivoDevolucion; label: string }[] = [
  { value: "defectuoso", label: "Defectuoso" },
  { value: "cambio_opinion", label: "Cambio de opinión" },
  { value: "talla_color", label: "Talla/color" },
  { value: "error_cobro", label: "Error de cobro" },
  { value: "garantia", label: "Garantía" },
  { value: "otro", label: "Otro" },
];

const REEMBOLSOS: { value: MetodoReembolso; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
];

interface RefundProps {
  session: Session;
  onClose: () => void;
}
function useDevolucion({ session, onClose }: RefundProps) {
  const [folio, setFolio] = useState("");
  const [venta, setVenta] = useState<VentaDevolucion | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [reponer, setReponer] = useState<Record<string, boolean>>({});
  const [motivo, setMotivo] = useState<MotivoDevolucion>("defectuoso");
  const [metodoReembolso, setMetodoReembolso] = useState<MetodoReembolso>("efectivo");
  const [resultado, setResultado] = useState<DevolucionResultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const [pendiente, setPendiente] = useState<RefundAttempt | null>(null);
  const [scope, setScope] = useState<RefundScope | null>(null);
  const [status, setStatus] = useState<RefundStatus | null>(null);
  const [confirm, setConfirm] = useState<"retry" | "cancel" | null>(null);
  const token = useRef(loadToken());
  const guard = useRef(false);
  const searchBusy = useRef(false);
  const active = useRef(true);
  const version = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const allowed = puede("ventas.devolver");
  const locked = procesando || !!pendiente || !scope;
  const currentSession = useCallback(() => active.current && token.current === loadToken(), []);
  const cargarIdentidad = useCallback(async () => {
    try {
      const owner = await loadRefundScope();
      const saved = readRefundAttempt(owner);
      if (currentSession()) {
        setScope(owner);
        setPendiente(saved);
        setError(null);
      }
    } catch {
      if (currentSession())
        setError(
          "No se pudo verificar la identidad o el intento guardado. Conserva los datos y vuelve a consultar; el reembolso está bloqueado.",
        );
    }
  }, [currentSession]);
  useEffect(() => {
    active.current = true;
    const previous = document.activeElement;
    dialog.current?.showModal();
    heading.current?.focus();
    void cargarIdentidad();
    return () => {
      active.current = false;
      version.current++;
      searchController.current?.abort();
      dialog.current?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [cargarIdentidad]);
  const close = () => {
    if (!guard.current) onClose();
  };
  const whenActive = (action: () => void) => {
    if (currentSession()) action();
  };
  const searchActive = (current: number) => currentSession() && current === version.current;
  async function buscarVenta() {
    if (guard.current || locked || !folio.trim() || !allowed) return;
    const current = ++version.current;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setError(null);
    setVenta(null);
    searchBusy.current = true;
    setBuscando(true);
    try {
      const detail = await buscarVentaDevolucion(folio, controller.signal);
      if (!searchActive(current)) return;
      if (!detail) setError("No se encontró una venta con ese folio exacto.");
      setVenta(detail);
      setCantidades({});
      setReponer({});
    } catch {
      if (searchActive(current))
        setError("No se pudo consultar la venta. Revisa la conexión y vuelve a buscar.");
    } finally {
      if (searchActive(current)) {
        searchBusy.current = false;
        setBuscando(false);
      }
    }
  }
  function aplicarStatus(value: RefundStatus) {
    if (!scope) return;
    setStatus(value);
    setPendiente(readRefundAttempt(scope));
    if (value.status === "ready") {
      setResultado(value.result);
      setError(null);
    }
    if (value.status === "cancelled")
      setError(
        "Intento cancelado sin procesar una devolución. Revisa las cantidades y el efectivo antes de continuar.",
      );
  }
  async function recuperar(action: "query" | "retry" | "cancel" = "query") {
    if (!scope || guard.current || !allowed) return;
    guard.current = true;
    setProcesando(true);
    setError(null);
    setConfirm(null);
    try {
      const result = await recoverRefundAttempt(scope, currentSession, action);
      whenActive(() => aplicarStatus(result));
    } catch (failure) {
      whenActive(() => setError(mensajeFalloDevolucion(failure, true)));
    } finally {
      guard.current = false;
      whenActive(() => setProcesando(false));
    }
  }

  const lineasADevolver = venta ? venta.lineas.filter((l) => (cantidades[l.id] ?? 0) > 0) : [];

  const cantidadesValidas = !venta || cantidadesDevolucionValidas(venta, cantidades);
  async function procesar() {
    if (
      !venta ||
      !scope ||
      !lineasADevolver.length ||
      !cantidadesValidas ||
      guard.current ||
      searchBusy.current ||
      locked ||
      !allowed
    )
      return;
    guard.current = true;
    setProcesando(true);
    setError(null);
    let sent = false;
    try {
      const body = armarDevolucion(
        venta,
        cantidades,
        motivo,
        metodoReembolso,
        session.caja?.id,
        reponer,
      );
      if (metodoReembolso === "efectivo")
        await verificarCajaDevolucion(session.caja?.id, venta.sucursalId);
      if (!currentSession()) return;
      sent = true;
      const result = await startRefundAttempt(
        scope,
        { ventaId: venta.id, folio: venta.folio, payload: body },
        currentSession,
      );
      whenActive(() => aplicarStatus(result));
    } catch (failure) {
      whenActive(() => {
        try {
          setPendiente(readRefundAttempt(scope));
        } catch {
          setScope(null);
        }
        setError(mensajeFalloDevolucion(failure, sent));
      });
    } finally {
      guard.current = false;
      whenActive(() => setProcesando(false));
    }
  }

  return {
    dialog,
    titleId,
    heading,
    procesando,
    buscando,
    close,
    allowed,
    scope,
    cargarIdentidad,
    pendiente,
    resultado,
    status,
    confirm,
    setConfirm,
    recuperar,
    folio,
    setFolio,
    locked,
    buscarVenta,
    error,
    venta,
    cantidades,
    setCantidades,
    reponer,
    setReponer,
    cantidadesValidas,
    motivo,
    setMotivo,
    metodoReembolso,
    setMetodoReembolso,
    procesar,
    lineasADevolver,
  };
}
type RefundModel = ReturnType<typeof useDevolucion>;
export function DevolucionModal(props: RefundProps) {
  const model = useDevolucion(props);
  const {
    dialog,
    titleId,
    heading,
    procesando,
    buscando,
    close,
    allowed,
    scope,
    cargarIdentidad,
    resultado,
    folio,
    setFolio,
    locked,
    buscarVenta,
    error,
  } = model;
  const { session } = props;
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-busy={procesando || buscando}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-6 shadow-xl backdrop:bg-black/40"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2
          ref={heading}
          id={titleId}
          tabIndex={-1}
          className="text-lg font-bold text-slate-800 outline-none"
        >
          Devolución
        </h2>
        <button
          type="button"
          onClick={close}
          disabled={procesando}
          aria-label="Cerrar devolución"
          className="flex min-h-10 min-w-10 items-center justify-center text-slate-400 hover:text-slate-600"
        >
          <X size={20} />
        </button>
      </div>

      {!allowed ? (
        <p role="alert" className="mb-3 text-red-700">
          No tienes permiso para procesar devoluciones.
        </p>
      ) : null}
      {!scope ? (
        <button
          type="button"
          className="mb-3 min-h-10 rounded border px-3"
          onClick={() => void cargarIdentidad()}
        >
          Verificar identidad e intento guardado
        </button>
      ) : null}
      <RecuperacionDevolucion model={model} />
      {resultado ? (
        <div className="text-center">
          <div className="mb-2 text-4xl">↩️</div>
          <p className="text-lg font-bold text-slate-800">Devolución registrada</p>
          <p className="mt-2 text-sm text-slate-600">
            Confirma con el encargado la entrega o aplicación del reembolso. No lo realices dos
            veces.
          </p>
          {resultado.folio && <p className="text-slate-500">Folio {resultado.folio}</p>}
          <button
            type="button"
            onClick={close}
            className="mt-6 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark"
          >
            Listo
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <input
              aria-label="Folio exacto de la venta"
              disabled={locked || !allowed}
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void buscarVenta();
              }}
              placeholder="Folio de la venta (p.ej. SUC-PRINCIPAL-000001)"
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={buscarVenta}
              disabled={locked || buscando || !folio.trim() || !allowed}
              className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {buscando ? "…" : "Buscar"}
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <DetalleDevolucion model={model} session={session} />
        </>
      )}
    </dialog>
  );
}

function DetalleDevolucion({ model, session }: { model: RefundModel; session: Session }) {
  const {
    venta,
    cantidades,
    setCantidades,
    reponer,
    setReponer,
    cantidadesValidas,
    motivo,
    setMotivo,
    metodoReembolso,
    setMetodoReembolso,
    procesar,
    lineasADevolver,
    locked,
    allowed,
    procesando,
  } = model;
  return (
    <>
      {venta && (
        <>
          <p className="mb-2 text-sm text-slate-500">
            Venta {venta.folio} · total ${Number.parseFloat(venta.total).toFixed(2)} · selecciona
            cuánto devolver:
          </p>
          <div className="mb-3 max-h-52 overflow-y-auto">
            {venta.lineas.map((l) => {
              const max = Number.parseFloat(l.cantidad);
              return (
                <div
                  key={l.id}
                  className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-slate-800">
                      {l.snapshotProducto?.nombreProducto ?? "—"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {l.cantidad} vendidas · ${Number.parseFloat(l.totalLinea).toFixed(2)}
                    </p>
                    <label className="mt-1 flex min-h-10 items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        disabled={locked || !allowed}
                        checked={reponer[l.id] === true}
                        onChange={(e) =>
                          setReponer((prev) => ({ ...prev, [l.id]: e.target.checked }))
                        }
                        className="h-4 w-4 shrink-0"
                      />
                      Volver a inventario vendible
                    </label>
                  </div>
                  <input
                    type="number"
                    disabled={locked || !allowed}
                    aria-label={`Cantidad a devolver de ${l.snapshotProducto?.nombreProducto ?? "producto"}`}
                    step="0.001"
                    aria-invalid={!cantidadesValidas}
                    min={0}
                    max={max}
                    value={cantidades[l.id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? 0 : Number(e.target.value);
                      setCantidades((prev) => ({ ...prev, [l.id]: v }));
                    }}
                    className="min-h-10 w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-brand focus:outline-none"
                    placeholder="0"
                  />
                </div>
              );
            })}
          </div>

          {!cantidadesValidas ? (
            <p role="alert" className="mb-3 text-sm text-red-700">
              Cantidad inválida: usa como máximo tres decimales, sin valores negativos ni cantidades
              superiores a las vendidas. No se redondeará.
            </p>
          ) : null}
          <p className="mb-3 text-sm text-slate-600">
            Marca la reposición solo después de comprobar que el artículo puede volver a venderse.
            Los productos defectuosos no deben regresar al inventario vendible.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">Motivo</span>
              <select
                disabled={locked || !allowed}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as MotivoDevolucion)}
                className="min-h-10 w-full rounded-lg border border-slate-300 px-2 py-2 focus:border-brand focus:outline-none"
              >
                {MOTIVOS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">Reembolso</span>
              <select
                disabled={locked || !allowed}
                value={metodoReembolso}
                onChange={(e) => setMetodoReembolso(e.target.value as MetodoReembolso)}
                className="min-h-10 w-full rounded-lg border border-slate-300 px-2 py-2 focus:border-brand focus:outline-none"
              >
                {REEMBOLSOS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mb-3 text-sm text-slate-600">
            En esta pantalla solo está disponible efectivo. Tarjeta y transferencia aún no están
            integradas aquí. Los vales requieren el flujo de saldo del cliente y no están
            disponibles en esta pantalla.
          </p>
          {metodoReembolso === "efectivo" ? (
            <p className="mb-2 text-sm text-slate-600">
              {session.caja
                ? `El efectivo saldrá de la caja ${session.caja.codigo}. Verificaremos su apertura y la sucursal antes de enviar.`
                : "No hay caja seleccionada; el reembolso en efectivo está bloqueado."}
            </p>
          ) : null}
          <button
            type="button"
            onClick={procesar}
            disabled={
              locked ||
              !allowed ||
              lineasADevolver.length === 0 ||
              (metodoReembolso === "efectivo" && !session.caja)
            }
            className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
          >
            {procesando ? "Procesando…" : `Devolver ${lineasADevolver.length} producto(s)`}
          </button>
        </>
      )}
    </>
  );
}

function RecuperacionDevolucion({ model }: { model: RefundModel }) {
  const { pendiente, resultado, status, confirm, setConfirm, procesando, recuperar } = model;
  return (
    <>
      {pendiente && !resultado ? (
        <div className="mb-3 space-y-2 rounded border border-amber-300 p-3">
          <p role="alert">
            Devolución pendiente de la venta {pendiente.folio}. Conservamos la misma clave y
            cantidades. No entregues efectivo otra vez.
          </p>
          {status?.status === "not_found" ? (
            <p>Todavía no se encuentra el intento; eso no demuestra que haya fallado.</p>
          ) : null}
          {status?.status === "processing" ? (
            <p>El servidor sigue procesando la devolución.</p>
          ) : null}
          {confirm ? (
            <ConfirmarDevolucion model={model} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={procesando}
                className="min-h-10 rounded border px-3"
                onClick={() => void recuperar()}
              >
                Consultar devolución pendiente
              </button>
              <button
                type="button"
                disabled={procesando}
                className="min-h-10 rounded border px-3"
                onClick={() => setConfirm("cancel")}
              >
                Cancelar intento sin devolución
              </button>
              {status?.status === "not_found" &&
              pendiente.payload.metodoReembolso === "efectivo" ? (
                <button
                  type="button"
                  disabled={procesando}
                  className="min-h-10 rounded border px-3"
                  onClick={() => setConfirm("retry")}
                >
                  Reenviar la misma devolución
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

function ConfirmarDevolucion({ model }: { model: RefundModel }) {
  const { confirm, procesando, recuperar, setConfirm } = model;
  if (!confirm) return null;
  return (
    <div className="space-y-2">
      <p>
        {confirm === "cancel"
          ? "Solo se libera si no existe devolución registrada. Si ya se procesó, recuperaremos su resultado sin cancelarla."
          : "Se reenviará la misma devolución guardada con su clave original. No reembolses dos veces."}
      </p>
      <button
        type="button"
        disabled={procesando}
        className="min-h-10 rounded border px-3"
        onClick={() => void recuperar(confirm)}
      >
        Confirmar{" "}
        {confirm === "cancel" ? "cancelación del intento" : "reenvío de la misma devolución"}
      </button>
      <button
        type="button"
        disabled={procesando}
        className="min-h-10 rounded border px-3"
        onClick={() => setConfirm(null)}
      >
        Volver sin cambios
      </button>
    </div>
  );
}
