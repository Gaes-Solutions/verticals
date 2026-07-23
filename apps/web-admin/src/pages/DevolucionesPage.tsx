import { useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";

interface Solicitud {
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
  { value: "transferencia", label: "Transferencia" },
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

  const puedeResolver = puede("ventas.devolver");

  const cargar = useCallback(() => {
    const qs = filtro ? `?estado=${filtro}` : "";
    api<Solicitud[]>(`/t/devoluciones-online${qs}`)
      .then(setSolicitudes)
      .catch(() => setSolicitudes([]));
  }, [filtro]);

  useEffect(() => cargar(), [cargar]);

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

      {error && <p className="mb-4 text-red-600 text-sm">{error}</p>}

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
            {s.rechazoMotivo && (
              <p className="mt-1 text-red-600 text-sm">Rechazo: {s.rechazoMotivo}</p>
            )}
            {s.estado === "solicitada" && puedeResolver && (
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
        {solicitudes.length === 0 && (
          <p className="rounded-xl bg-white p-8 text-center text-slate-400">Sin solicitudes.</p>
        )}
      </div>

      {accion && (
        <AccionModal
          solicitud={accion.s}
          tipo={accion.tipo}
          onClose={() => setAccion(null)}
          onDone={() => {
            setAccion(null);
            setError(null);
            cargar();
          }}
          onError={(m) => setError(m)}
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
  const [metodoReembolso, setMetodoReembolso] = useState("tarjeta_misma");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ejecutar() {
    setGuardando(true);
    setErr(null);
    try {
      if (tipo === "aprobar") {
        await api(`/t/devoluciones-online/${solicitud.id}/aprobar`, {
          body: { metodoReembolso },
        });
      } else {
        if (motivo.trim().length < 3) {
          setErr("Escribe el motivo del rechazo");
          setGuardando(false);
          return;
        }
        await api(`/t/devoluciones-online/${solicitud.id}/rechazar`, { body: { motivo } });
      }
      onDone();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Error";
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
              Se repondrá el stock y se registrará el reembolso. Elige el método:
            </p>
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
            disabled={guardando}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Procesando…" : tipo === "aprobar" ? "Aprobar" : "Rechazar"}
          </button>
        </div>
      </div>
    </div>
  );
}
