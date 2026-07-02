import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "../App.js";
import { ApiError, api, puede } from "../lib/api.js";
import type { ApartadoLista, ApartadosPaged, Cliente, TicketLinea } from "../lib/types.js";

type Vista = "lista" | "crear";

function saldoDe(a: ApartadoLista): number {
  return Number.parseFloat(a.total) - Number.parseFloat(a.montoPagado);
}

/**
 * Apartados (layaway) desde el POS: crear a partir del ticket (requiere cliente)
 * y gestionar los activos (abonar / liquidar / cancelar). Consume /t/apartados.
 */
export function ApartadosModal({
  session,
  cliente,
  ticket,
  onClose,
  onCreated,
}: {
  session: Session;
  cliente: Cliente | null;
  ticket: TicketLinea[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const puedeCrear = ticket.length > 0 && cliente !== null && puede("apartados.crear");
  const [vista, setVista] = useState<Vista>(puedeCrear ? "crear" : "lista");
  const [items, setItems] = useState<ApartadoLista[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await api<ApartadosPaged>("/t/apartados?estado=activo&pageSize=50");
      setItems(res.items);
    } catch {
      setError("No se pudieron cargar los apartados");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (vista === "lista") void cargar();
  }, [vista, cargar]);

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Apartados</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setVista("lista")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              vista === "lista" ? "bg-brand text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            Activos
          </button>
          {puedeCrear && (
            <button
              type="button"
              onClick={() => setVista("crear")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                vista === "crear" ? "bg-brand text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              Apartar ticket
            </button>
          )}
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex-1 overflow-y-auto">
          {vista === "crear" && cliente ? (
            <CrearApartado
              session={session}
              cliente={cliente}
              ticket={ticket}
              onDone={() => {
                onCreated();
                setVista("lista");
              }}
            />
          ) : (
            <ListaApartados
              items={items}
              cargando={cargando}
              onRefetch={cargar}
              onError={setError}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CrearApartado({
  session,
  cliente,
  ticket,
  onDone,
}: {
  session: Session;
  cliente: Cliente;
  ticket: TicketLinea[];
  onDone: () => void;
}) {
  const total = ticket.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const [diasVigencia, setDiasVigencia] = useState("30");
  const [anticipo, setAnticipo] = useState((total * 0.2).toFixed(2));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setError(null);
    setGuardando(true);
    try {
      const anticipoNum = Number.parseFloat(anticipo);
      await api("/t/apartados", {
        body: {
          sucursalId: session.sucursal.id,
          ...(session.caja ? { cajaId: session.caja.id } : {}),
          clienteId: cliente.id,
          diasVigencia: Number.parseInt(diasVigencia, 10) || 30,
          lineas: ticket.map((l) => ({ varianteId: l.varianteId, cantidad: String(l.cantidad) })),
          ...(anticipoNum > 0
            ? { abonoInicial: { monto: anticipo, metodo: "efectivo" as const } }
            : {}),
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear el apartado");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Cliente: <span className="font-semibold text-slate-800">{cliente.nombre}</span>
      </p>
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        {ticket.map((l) => (
          <div key={l.varianteId} className="flex justify-between">
            <span>
              {l.cantidad}× {l.nombre}
            </span>
            <span>${(l.precioUnitario * l.cantidad).toFixed(2)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Anticipo (efectivo)
        <input
          type="number"
          step="0.01"
          value={anticipo}
          onChange={(e) => setAnticipo(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Vigencia (días)
        <input
          type="number"
          value={diasVigencia}
          onChange={(e) => setDiasVigencia(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={crear}
        disabled={guardando}
        className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {guardando ? "Creando…" : "Crear apartado"}
      </button>
    </div>
  );
}

function ListaApartados({
  items,
  cargando,
  onRefetch,
  onError,
}: {
  items: ApartadoLista[];
  cargando: boolean;
  onRefetch: () => Promise<void>;
  onError: (m: string | null) => void;
}) {
  const [abonando, setAbonando] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [procesando, setProcesando] = useState(false);

  async function accion(id: string, path: string, body?: unknown) {
    onError(null);
    setProcesando(true);
    try {
      await api(`/t/apartados/${id}/${path}`, body ? { body } : { method: "POST" });
      setAbonando(null);
      setMonto("");
      await onRefetch();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Error en la operación");
    } finally {
      setProcesando(false);
    }
  }

  if (cargando) return <p className="text-center text-sm text-slate-400">Cargando…</p>;
  if (items.length === 0)
    return <p className="text-center text-sm text-slate-400">Sin apartados activos.</p>;

  return (
    <div className="space-y-3">
      {items.map((a) => (
        <div key={a.id} className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">{a.folio}</p>
              <p className="text-xs text-slate-500">{a.cliente?.nombre ?? "Sin cliente"}</p>
            </div>
            <div className="text-right text-sm">
              <p className="text-slate-500">Total ${Number.parseFloat(a.total).toFixed(2)}</p>
              <p className="font-semibold text-amber-600">Saldo ${saldoDe(a).toFixed(2)}</p>
            </div>
          </div>
          {abonando === a.id ? (
            <div className="mt-3 flex gap-2">
              <input
                type="number"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="Monto"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                disabled={procesando || !(Number.parseFloat(monto) > 0)}
                onClick={() => accion(a.id, "abonos", { monto, metodo: "efectivo" })}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Abonar
              </button>
              <button
                type="button"
                onClick={() => setAbonando(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {puede("apartados.abonar") && (
                <button
                  type="button"
                  onClick={() => {
                    setAbonando(a.id);
                    setMonto(saldoDe(a).toFixed(2));
                  }}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700"
                >
                  Abonar
                </button>
              )}
              {puede("apartados.liquidar") && (
                <button
                  type="button"
                  disabled={procesando}
                  onClick={() => accion(a.id, "liquidar")}
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Liquidar y entregar
                </button>
              )}
              {puede("apartados.cancelar") && (
                <button
                  type="button"
                  disabled={procesando}
                  onClick={() => accion(a.id, "cancelar", { motivo: "Cancelado en caja" })}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
                >
                  Cancelar
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
