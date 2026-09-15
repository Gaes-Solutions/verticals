import { useCallback, useEffect, useRef, useState } from "react";
import { api, puede } from "../lib/api.js";

interface Solicitud {
  bankRefund?: { state: string; refundId: string | null; lastError: string | null } | null;
  id: string;
  folio: string;
  motivo: string;
  descripcion: string | null;
  items: Array<{ nombre: string; cantidad: number }>;
  estado: string;
  rechazoMotivo: string | null;
  createdAt: string;
  pedido: { folioPublico: string; emailComprador: string };
  cliente: { nombre: string } | null;
}

const MOTIVOS: Record<string, string> = {
  defectuoso: "Defectuoso",
  cambio_opinion: "Cambio de opinión",
  talla_color: "Talla / color",
  error_cobro: "Error de cobro",
  garantia: "Garantía",
  otro: "Otro",
};

const METODOS_REEMBOLSO: Array<{ value: string; label: string }> = [
  { value: "tarjeta_misma", label: "Tarjeta original" },
  { value: "efectivo", label: "Efectivo" },
  { value: "saldo_a_favor", label: "Saldo a favor" },
  { value: "vale", label: "Vale" },
];

function badge(estado: string): string {
  if (estado === "aprobada") return "bg-emerald-100 text-emerald-700";
  if (estado === "rechazada") return "bg-red-100 text-red-700";
  if (estado === "cancelada") return "bg-slate-100 text-slate-500";
  return "bg-amber-100 text-amber-700";
}

export function DevolucionesPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [filtro, setFiltro] = useState("solicitada");
  const [accion, setAccion] = useState<{ s: Solicitud; tipo: "aprobar" | "rechazar" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const puedeLeer = puede("ventas.leer");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const generation = useRef(0);
  const puedeResolver = puede("ventas.devolver");

  const cargar = useCallback(async () => {
    const current = ++generation.current;
    if (!puedeLeer) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    setSolicitudes([]);
    try {
      const qs = filtro ? `?estado=${encodeURIComponent(filtro)}` : "";
      const result = await api<Solicitud[]>(`/t/devoluciones-online${qs}`);
      if (current === generation.current) setSolicitudes(result);
    } catch {
      if (current === generation.current) setLoadError(true);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [filtro, puedeLeer]);
  useEffect(() => {
    void cargar();
    return () => {
      generation.current++;
    };
  }, [cargar]);
  if (!puedeLeer) return <p role="alert">No tienes permiso para consultar devoluciones.</p>;

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-slate-800">Devoluciones</h1>
        <select
          data-tour="dev-filtro"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todas</option>
          <option value="solicitada">Pendientes</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
        </select>
      </div>

      {loading && <output>Consultando devoluciones…</output>}
      {loadError && (
        <div role="alert">
          <p>No se pudieron consultar las devoluciones.</p>
          <button type="button" onClick={() => void cargar()}>
            Reintentar consulta
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-4 text-red-600 text-sm">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {solicitudes.map((s) => (
          <div key={s.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-800">
                  {s.folio} · Pedido {s.pedido.folioPublico}
                </p>
                <p className="text-slate-500 text-sm">
                  {s.cliente?.nombre ?? s.pedido.emailComprador} ·{" "}
                  {new Date(s.createdAt).toLocaleDateString("es-MX")}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${badge(s.estado)}`}>
                {s.estado}
              </span>
            </div>
            <p className="mt-2 text-slate-600 text-sm">
              <span className="font-medium">Motivo:</span> {MOTIVOS[s.motivo] ?? s.motivo}
              {s.descripcion ? ` — "${s.descripcion}"` : ""}
            </p>
            <ul className="mt-1 text-slate-600 text-sm">
              {s.items.map((it, i) => (
                <li key={`${i}-${it.nombre}`}>
                  {it.cantidad} × {it.nombre}
                </li>
              ))}
            </ul>
            {s.bankRefund && <BankRefundStatus solicitud={s} onReload={cargar} />}
            {s.rechazoMotivo && (
              <p className="mt-1 text-red-600 text-sm">Rechazo: {s.rechazoMotivo}</p>
            )}
            {!s.bankRefund &&
              s.estado === "solicitada" &&
              puedeResolver &&
              !blocked.includes(s.id) && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAccion({ s, tipo: "aprobar" })}
                    className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-sm text-white hover:bg-brand-dark"
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccion({ s, tipo: "rechazar" })}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-600 text-sm hover:bg-slate-50"
                  >
                    Rechazar
                  </button>
                </div>
              )}
          </div>
        ))}
        {!loading && !loadError && solicitudes.length === 0 && (
          <p className="rounded-xl bg-white p-8 text-center text-slate-400">Sin solicitudes.</p>
        )}
      </div>

      {accion && puedeResolver && (
        <AccionModal
          solicitud={accion.s}
          tipo={accion.tipo}
          onClose={() => setAccion(null)}
          onDone={() => {
            setAccion(null);
            setError(null);
            cargar();
          }}
          onError={(m) => {
            setError(m);
            setBlocked((ids) => [...ids, accion.s.id]);
          }}
        />
      )}
    </div>
  );
}

function AccionModal({
  solicitud,
  tipo,
  onClose,
  onDone,
  onError,
}: {
  solicitud: Solicitud;
  tipo: "aprobar" | "rechazar";
  onClose: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [reponeStock, setReponeStock] = useState(false);
  const [cajaId, setCajaId] = useState("");
  const [cajas, setCajas] = useState<
    Array<{ id: string; codigo: string; sucursal: { nombre: string } }>
  >([]);
  useEffect(() => {
    if (puede("cajas.leer"))
      void api<typeof cajas>("/t/cajas")
        .then(setCajas)
        .catch(() => setCajas([]));
  }, []);
  const [metodoReembolso, setMetodoReembolso] = useState("tarjeta_misma");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const guard = useRef(false);
  const [failed, setFailed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ejecutar() {
    if (guard.current || failed || !puede("ventas.devolver")) return;
    if (tipo === "aprobar" && metodoReembolso === "efectivo" && !cajaId) {
      setErr("Selecciona la caja que entrega el efectivo");
      return;
    }
    guard.current = true;
    setGuardando(true);
    setErr(null);
    try {
      if (tipo === "aprobar") {
        await api(`/t/devoluciones-online/${solicitud.id}/aprobar`, {
          body: {
            metodoReembolso,
            reponeStock,
            ...(metodoReembolso === "efectivo" ? { cajaId } : {}),
          },
        });
      } else {
        if (motivo.trim().length < 3) {
          setErr("Escribe el motivo del rechazo");
          guard.current = false;
          setGuardando(false);
          return;
        }
        await api(`/t/devoluciones-online/${solicitud.id}/rechazar`, { body: { motivo } });
      }
      onDone();
    } catch {
      const msg =
        "No se confirmó la operación. Consulta el estado y solicita conciliación antes de volver a realizarla.";
      setFailed(true);
      setErr(msg);
      onError(msg);
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6">
        <h2 className="mb-1 font-bold text-lg text-slate-800">
          {tipo === "aprobar" ? "Aprobar devolución" : "Rechazar devolución"}
        </h2>
        <p className="mb-4 text-slate-500 text-sm">
          {solicitud.folio} · Pedido {solicitud.pedido.folioPublico}
        </p>
        {tipo === "aprobar" ? (
          <>
            <p className="mb-3 text-slate-600 text-sm">
              El reembolso bancario queda pendiente hasta que el proveedor lo confirme. Elige el
              método:
            </p>
            <label className="gx-label mb-3 flex min-h-10 items-center gap-2">
              <input
                type="checkbox"
                checked={reponeStock}
                onChange={(e) => setReponeStock(e.target.checked)}
              />
              Producto recibido y apto para volver a vender
            </label>
            <select
              value={metodoReembolso}
              onChange={(e) => setMetodoReembolso(e.target.value)}
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {METODOS_REEMBOLSO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {metodoReembolso === "efectivo" && (
              <label className="gx-label">
                Caja que entrega el efectivo
                <select
                  className="gx-input"
                  required
                  value={cajaId}
                  onChange={(e) => setCajaId(e.target.value)}
                >
                  <option value="">Selecciona una caja abierta</option>
                  {cajas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.sucursal.nombre} · {c.codigo}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        ) : (
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo del rechazo (lo verá el cliente)"
            rows={3}
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        )}
        {err && <p className="mb-3 text-red-600 text-sm">{err}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 text-sm hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={ejecutar}
            disabled={guardando || failed}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Procesando…" : tipo === "aprobar" ? "Aprobar" : "Rechazar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BankRefundStatus({
  solicitud,
  onReload,
}: { solicitud: Solicitud; onReload: () => Promise<void> }) {
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guard = useRef(false);
  const labels: Record<string, string> = {
    preparing: "Preparando devolución",
    ready: "Reembolso por enviar",
    sending: "Consultando banco",
    pending: "Pendiente del banco",
    uncertain: "Por conciliar",
    completed: "Reembolso bancario confirmado",
    failed: "Reembolso rechazado por el banco",
  };
  async function check() {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/t/devoluciones-online/${solicitud.id}/conciliar`, {
        body: { ...(reference.trim() ? { reference: reference.trim() } : {}) },
      });
      await onReload();
    } catch {
      setError(
        "No se pudo confirmar. Conserva la referencia; consultar no vuelve a enviar dinero.",
      );
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="gx-card mt-3 p-3" aria-live="polite">
      <p className="font-semibold">
        {labels[solicitud.bankRefund?.state ?? ""] ?? "Reembolso por revisar"}
      </p>
      {solicitud.bankRefund?.refundId && (
        <p className="break-all text-sm">Referencia: {solicitud.bankRefund.refundId}</p>
      )}
      {solicitud.bankRefund?.state !== "completed" && puede("ventas.devolver") && (
        <div className="mt-2 space-y-2">
          <label className="gx-label">
            Referencia del proveedor (si te la proporcionó)
            <input
              className="gx-input"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={150}
            />
          </label>
          <button
            type="button"
            className="gx-btn-secondary min-h-10"
            disabled={busy}
            onClick={() => void check()}
          >
            {busy ? "Consultando…" : "Consultar reembolso"}
          </button>
          {error && <p className="text-danger text-sm">{error}</p>}
        </div>
      )}
    </div>
  );
}
