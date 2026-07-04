import { useCallback, useEffect, useState } from "react";
import { ApiError, api, horaCorta, money } from "../lib/api.js";
import type { Dashboard, MiCliente, VisitaHoy } from "../lib/types.js";

function BarraMeta({ resumen }: { resumen: Dashboard["resumen"] }) {
  const pct = Math.min(resumen.progresoPct ?? 0, 100);
  return (
    <div className="gx-card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="font-semibold text-slate-800">Meta del mes</p>
        <p className="text-slate-500 text-sm">
          {resumen.meta
            ? `${money(resumen.vendido)} de ${money(resumen.meta)}`
            : money(resumen.vendido)}
        </p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-brand"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={pct >= 100 ? "font-semibold text-emerald-600" : "text-slate-600"}>
          {resumen.progresoPct !== null
            ? `${resumen.progresoPct}% de tu meta`
            : "Sin meta asignada"}
        </span>
        <span className="text-slate-600">
          Comisión: <span className="font-semibold text-brand">{money(resumen.totalEstimado)}</span>
          {Number(resumen.bonoEstimado) > 0 && (
            <span className="ml-1 text-emerald-600">(+{money(resumen.bonoEstimado)} bono 🎉)</span>
          )}
        </span>
      </div>
    </div>
  );
}

function PlanearVisitaModal({
  onCerrar,
  onCreada,
}: {
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const [clientes, setClientes] = useState<MiCliente[]>([]);
  const [clienteB2bId, setClienteB2bId] = useState("");
  const [tipo, setTipo] = useState<"visita" | "llamada">("visita");
  const [hora, setHora] = useState("09:00");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<{ items: MiCliente[] }>("/t/vendedor/clientes")
      .then((r) => setClientes(r.items))
      .catch(() => setClientes([]));
  }, []);

  async function guardar() {
    if (!clienteB2bId) {
      setError("Elige un cliente");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const fecha = new Date();
      const [h, m] = hora.split(":");
      fecha.setHours(Number(h ?? 9), Number(m ?? 0), 0, 0);
      await api("/t/visitas", {
        body: {
          clienteB2bId,
          tipo,
          fechaPlaneada: fecha.toISOString(),
          ...(notas.trim() ? { notas: notas.trim() } : {}),
        },
      });
      onCreada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo planear");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <h2 className="mb-3 font-bold text-lg text-slate-800">Planear visita de hoy</h2>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Cliente</span>
          <select
            value={clienteB2bId}
            onChange={(e) => setClienteB2bId(e.target.value)}
            className="gx-input w-full"
          >
            <option value="">Elegir…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombreComercial ?? c.razonSocial}
              </option>
            ))}
          </select>
        </label>
        <div className="mb-3 flex gap-3">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-slate-700">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "visita" | "llamada")}
              className="gx-input w-full"
            >
              <option value="visita">Visita</option>
              <option value="llamada">Llamada</option>
            </select>
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-slate-700">Hora</span>
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="gx-input w-full"
            />
          </label>
        </div>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Notas (opcional)</span>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="gx-input w-full"
            placeholder="Qué llevar, qué ofrecer…"
          />
        </label>
        {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className="gx-btn-secondary flex-1">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="gx-btn-primary flex-1"
          >
            {guardando ? "Guardando…" : "Planear"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CerrarVisitaModal({
  visita,
  onCerrar,
  onHecho,
}: {
  visita: VisitaHoy;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [resultado, setResultado] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerrar() {
    setGuardando(true);
    setError(null);
    try {
      await api(`/t/visitas/${visita.id}/cerrar`, {
        body: resultado.trim() ? { resultado: resultado.trim() } : {},
      });
      onHecho();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cerrar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <h2 className="mb-1 font-bold text-lg text-slate-800">Cerrar visita</h2>
        <p className="mb-3 text-slate-500 text-sm">
          {visita.clienteB2b.nombreComercial ?? visita.clienteB2b.razonSocial}
        </p>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium text-slate-700">¿Cómo te fue?</span>
          <textarea
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            className="gx-input w-full"
            rows={3}
            placeholder="Pedido levantado, quedó de confirmar…"
          />
        </label>
        {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className="gx-btn-secondary flex-1">
            Volver
          </button>
          <button
            type="button"
            onClick={cerrar}
            disabled={guardando}
            className="gx-btn-primary flex-1"
          >
            {guardando ? "Cerrando…" : "Marcar hecha"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ESTADO_BADGE: Record<string, string> = {
  planeada: "bg-slate-100 text-slate-600",
  hecha: "bg-emerald-100 text-emerald-700",
  cancelada: "bg-red-100 text-red-600",
};

export function HoyPage({ onNuevoPedido }: { onNuevoPedido: (clienteB2bId: string) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planear, setPlanear] = useState(false);
  const [cerrando, setCerrando] = useState<VisitaHoy | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api<Dashboard>("/t/vendedor/dashboard")
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Sin conexión: intenta más tarde"),
      )
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function checkin(v: VisitaHoy) {
    setBusy(v.id);
    try {
      let coords: { lat: number; lng: number } | null = null;
      if (data?.config.geocheckinActivo && "geolocation" in navigator) {
        coords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { timeout: 8000 },
          );
        });
      }
      await api(`/t/visitas/${v.id}/checkin`, { body: coords ?? {} });
      cargar();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "No se pudo hacer checkin");
    } finally {
      setBusy(null);
    }
  }

  async function cancelar(v: VisitaHoy) {
    const motivo = window.prompt("¿Por qué no se hará la visita?");
    if (!motivo?.trim()) return;
    setBusy(v.id);
    try {
      await api(`/t/visitas/${v.id}/cancelar`, { body: { motivoNoVisita: motivo.trim() } });
      cargar();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "No se pudo cancelar");
    } finally {
      setBusy(null);
    }
  }

  if (cargando && !data) return <p className="text-slate-400">Cargando tu día…</p>;
  if (error && !data) return <p className="rounded-xl bg-white p-6 text-slate-500">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <BarraMeta resumen={data.resumen} />

      <div className="grid grid-cols-3 gap-2">
        <div className="gx-card p-3 text-center">
          <p className="font-bold text-brand text-xl">{data.pendientes.cotizacionesVigentes}</p>
          <p className="text-slate-500 text-xs">Cotizaciones por convertir</p>
        </div>
        <div className="gx-card p-3 text-center">
          <p className="font-bold text-brand text-xl">{data.pendientes.pedidosPorConfirmar}</p>
          <p className="text-slate-500 text-xs">Pedidos en proceso</p>
        </div>
        <div className="gx-card p-3 text-center">
          <p className="font-bold text-brand text-xl">
            {money(data.pendientes.cxcPorCobrar.saldo)}
          </p>
          <p className="text-slate-500 text-xs">
            Por cobrar ({data.pendientes.cxcPorCobrar.cuentas})
          </p>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Ruta de hoy ({data.visitasHoy.length})</h2>
          <button type="button" onClick={() => setPlanear(true)} className="gx-btn-primary text-sm">
            + Planear visita
          </button>
        </div>
        {data.visitasHoy.length === 0 ? (
          <p className="rounded-xl bg-white p-6 text-center text-slate-400">
            Sin visitas planeadas hoy.
          </p>
        ) : (
          <div className="space-y-2">
            {data.visitasHoy.map((v) => (
              <div key={v.id} className="gx-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-800">
                      {v.tipo === "llamada" ? "📞 " : "📍 "}
                      {v.clienteB2b.nombreComercial ?? v.clienteB2b.razonSocial}
                    </p>
                    <p className="text-slate-500 text-sm">
                      {horaCorta(v.fechaPlaneada)}
                      {v.checkinAt ? ` · checkin ${horaCorta(v.checkinAt)}` : ""}
                    </p>
                    {v.notas && <p className="mt-1 text-slate-500 text-xs">{v.notas}</p>}
                    {v.resultado && (
                      <p className="mt-1 text-emerald-700 text-xs">✔ {v.resultado}</p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_BADGE[v.estado] ?? ""}`}
                  >
                    {v.estado}
                  </span>
                </div>
                {v.estado === "planeada" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!v.checkinAt && (
                      <button
                        type="button"
                        disabled={busy === v.id}
                        onClick={() => checkin(v)}
                        className="gx-btn-secondary text-sm"
                      >
                        Checkin
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCerrando(v)}
                      className="gx-btn-secondary text-sm"
                    >
                      Cerrar visita
                    </button>
                    <button
                      type="button"
                      onClick={() => onNuevoPedido(v.clienteB2b.id)}
                      className="gx-btn-primary text-sm"
                    >
                      Levantar pedido
                    </button>
                    {v.clienteB2b.telefonoPrincipal && (
                      <a
                        href={`tel:${v.clienteB2b.telefonoPrincipal}`}
                        className="gx-btn-secondary text-sm"
                      >
                        Llamar
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={busy === v.id}
                      onClick={() => cancelar(v)}
                      className="text-red-500 text-sm hover:underline"
                    >
                      No se hará
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {planear && (
        <PlanearVisitaModal
          onCerrar={() => setPlanear(false)}
          onCreada={() => {
            setPlanear(false);
            cargar();
          }}
        />
      )}
      {cerrando && (
        <CerrarVisitaModal
          visita={cerrando}
          onCerrar={() => setCerrando(null)}
          onHecho={() => {
            setCerrando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
