import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";
import type { Paged, Sucursal } from "../lib/types.js";

interface CxcCliente {
  id: string;
  nombre: string;
  apellidos?: string | null;
}
interface CxcPago {
  id: string;
  monto: string;
  metodo: string;
  referencia?: string | null;
  createdAt: string;
  usuario?: { nombre: string } | null;
}
interface CxcItem {
  id: string;
  folio: string;
  estado: string;
  tipoOrigen: string;
  montoOriginal: string;
  montoPagado: string;
  interesAcumulado: string;
  fechaVencimiento: string;
  notas?: string | null;
  cliente?: { nombre: string; apellidos?: string | null } | null;
  clienteB2b?: { razonSocial: string } | null;
  venta?: { folio: string } | null;
}
interface CxcDetalle extends CxcItem {
  pagos: CxcPago[];
}

const METODOS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta_debito", label: "Débito" },
  { value: "tarjeta_credito", label: "Crédito" },
  { value: "transferencia", label: "Transferencia" },
  { value: "vale", label: "Vale" },
  { value: "otro", label: "Otro" },
];

const ESTADO_BADGE: Record<string, string> = {
  activa: "gx-badge-info",
  vencida: "gx-badge-warn",
  liquidada: "gx-badge-ok",
  incobrable: "gx-badge-danger",
  condonada: "gx-badge-info",
};

const ORIGEN_LABEL: Record<string, string> = {
  venta_credito: "Venta a crédito",
  regularizacion_fiado: "Fiado regularizado",
  manual: "Manual",
  apertura_saldo_inicial: "Saldo inicial",
};

function money(v: string | number): string {
  return `$${Number(v).toFixed(2)}`;
}
function saldoDe(c: CxcItem): number {
  return Number(c.montoOriginal) + Number(c.interesAcumulado) - Number(c.montoPagado);
}
function nombreCliente(c: CxcItem): string {
  if (c.clienteB2b) return c.clienteB2b.razonSocial;
  if (c.cliente) return `${c.cliente.nombre} ${c.cliente.apellidos ?? ""}`.trim();
  return "—";
}

export function CxcPage() {
  const [items, setItems] = useState<CxcItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<CxcDetalle | null>(null);
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    api<Paged<CxcItem>>("/t/cxc?pageSize=100")
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function abrir(id: string) {
    try {
      setSel(await api<CxcDetalle>(`/t/cxc/${id}`));
    } catch {
      setSel(null);
    }
  }

  const porCobrar = items
    .filter((c) => c.estado === "activa" || c.estado === "vencida")
    .reduce((s, c) => s + saldoDe(c), 0);
  const vencido = items.filter((c) => c.estado === "vencida").reduce((s, c) => s + saldoDe(c), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Cuentas por cobrar</h1>
          <p className="text-slate-500 text-sm">
            Crédito a clientes y fiados regularizados. Registra abonos y da seguimiento a lo
            vencido.
          </p>
        </div>
        {puede("cxc.crear") && (
          <button type="button" onClick={() => setNuevo(true)} className="gx-btn-primary">
            + Nueva cuenta
          </button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div className="gx-card">
          <p className="text-slate-500 text-sm">Por cobrar</p>
          <p className="font-bold text-2xl text-slate-800">{money(porCobrar)}</p>
        </div>
        <div className="gx-card">
          <p className="text-slate-500 text-sm">Vencido</p>
          <p className="font-bold text-2xl text-danger">{money(vencido)}</p>
        </div>
      </div>

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Folio</th>
              <th className="gx-th">Cliente</th>
              <th className="gx-th">Origen</th>
              <th className="gx-th">Saldo</th>
              <th className="gx-th">Vence</th>
              <th className="gx-th">Estado</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td className="gx-td text-slate-400" colSpan={6}>
                  Cargando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="gx-td text-slate-400" colSpan={6}>
                  Aún no hay cuentas por cobrar.
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => abrir(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") abrir(c.id);
                  }}
                  tabIndex={0}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="gx-td font-medium">{c.folio}</td>
                  <td className="gx-td text-slate-500">{nombreCliente(c)}</td>
                  <td className="gx-td text-slate-500">
                    {ORIGEN_LABEL[c.tipoOrigen] ?? c.tipoOrigen}
                  </td>
                  <td className="gx-td font-semibold">{money(saldoDe(c))}</td>
                  <td className="gx-td text-slate-500">
                    {new Date(c.fechaVencimiento).toLocaleDateString()}
                  </td>
                  <td className="gx-td">
                    <span className={ESTADO_BADGE[c.estado] ?? "gx-badge-info"}>{c.estado}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sel && (
        <CxcDetalleModal
          cuenta={sel}
          onClose={() => setSel(null)}
          onChanged={() => {
            cargar();
            void abrir(sel.id);
          }}
        />
      )}
      {nuevo && (
        <NuevaCxcModal
          onClose={() => setNuevo(false)}
          onDone={() => {
            setNuevo(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function CxcDetalleModal({
  cuenta,
  onClose,
  onChanged,
}: {
  cuenta: CxcDetalle;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const saldo = saldoDe(cuenta);
  const activa = cuenta.estado === "activa" || cuenta.estado === "vencida";

  async function correr(fn: () => Promise<unknown>) {
    setProcesando(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la acción");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-h-[90vh] overflow-y-auto">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="font-bold text-lg text-slate-800">{cuenta.folio}</h2>
            <p className="text-slate-500 text-sm">
              {nombreCliente(cuenta)}
              {cuenta.venta ? ` · venta ${cuenta.venta.folio}` : ""}
            </p>
          </div>
          <span className={ESTADO_BADGE[cuenta.estado] ?? "gx-badge-info"}>{cuenta.estado}</span>
        </div>

        <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Monto original</span>
            <span>{money(cuenta.montoOriginal)}</span>
          </div>
          {Number(cuenta.interesAcumulado) > 0 && (
            <div className="flex justify-between text-amber-600">
              <span>Interés moratorio</span>
              <span>{money(cuenta.interesAcumulado)}</span>
            </div>
          )}
          <div className="flex justify-between text-emerald-600">
            <span>Pagado</span>
            <span>{money(cuenta.montoPagado)}</span>
          </div>
          <div className="mt-1 flex justify-between border-slate-200 border-t pt-1 font-bold text-slate-800">
            <span>Saldo</span>
            <span>{money(saldo)}</span>
          </div>
          <p className="mt-1 text-slate-400 text-xs">
            Vence: {new Date(cuenta.fechaVencimiento).toLocaleDateString()}
          </p>
        </div>

        {cuenta.pagos.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 font-semibold text-slate-500 text-xs">Abonos</p>
            {cuenta.pagos.map((p) => (
              <div key={p.id} className="flex justify-between text-slate-500 text-xs">
                <span>
                  {new Date(p.createdAt).toLocaleDateString()} · {p.metodo}
                </span>
                <span>{money(p.monto)}</span>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mb-3 text-danger text-sm">{error}</p>}

        {activa && (
          <div className="flex flex-col gap-3">
            {puede("cxc.cobrar") && saldo > 0 && (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 font-semibold text-slate-700 text-sm">Registrar abono</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="Monto"
                    className="gx-input w-28"
                  />
                  <select
                    value={metodo}
                    onChange={(e) => setMetodo(e.target.value)}
                    className="gx-input flex-1"
                  >
                    {METODOS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={procesando || !monto || Number(monto) <= 0}
                    onClick={() =>
                      correr(async () => {
                        await api(`/t/cxc/${cuenta.id}/pagos`, {
                          body: { monto, metodo },
                        });
                        setMonto("");
                      })
                    }
                    className="gx-btn-primary"
                  >
                    Abonar
                  </button>
                </div>
              </div>
            )}

            {puede("cxc.condonar") && (
              <div className="rounded-lg border border-red-200 p-3">
                <p className="mb-2 font-semibold text-red-600 text-sm">Cerrar la cuenta</p>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo (condonar o incobrable)"
                  className="gx-input mb-2"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={procesando || motivo.trim().length < 3}
                    onClick={() =>
                      correr(() => api(`/t/cxc/${cuenta.id}/condonar`, { body: { motivo } }))
                    }
                    className="gx-btn-secondary flex-1"
                  >
                    Condonar
                  </button>
                  <button
                    type="button"
                    disabled={procesando || motivo.trim().length < 3}
                    onClick={() =>
                      correr(() => api(`/t/cxc/${cuenta.id}/incobrable`, { body: { motivo } }))
                    }
                    className="flex-1 rounded-lg border border-red-300 py-2 font-semibold text-red-600 text-sm hover:bg-red-50 disabled:opacity-40"
                  >
                    Incobrable
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="gx-btn-ghost">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function NuevaCxcModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState("");
  const [clienteQuery, setClienteQuery] = useState("");
  const [clientes, setClientes] = useState<CxcCliente[]>([]);
  const [cliente, setCliente] = useState<CxcCliente | null>(null);
  const [monto, setMonto] = useState("");
  const [dias, setDias] = useState(30);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<Sucursal[]>("/t/sucursales")
      .then((s) => {
        setSucursales(s);
        setSucursalId(s.find((x) => x.isDefault)?.id ?? s[0]?.id ?? "");
      })
      .catch(() => setSucursales([]));
  }, []);

  useEffect(() => {
    if (!clienteQuery.trim()) {
      setClientes([]);
      return;
    }
    const t = setTimeout(() => {
      api<Paged<CxcCliente>>(`/t/clientes?q=${encodeURIComponent(clienteQuery)}&pageSize=8`)
        .then((r) => setClientes(r.items))
        .catch(() => setClientes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [clienteQuery]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!cliente || !sucursalId) return;
    setGuardando(true);
    setError(null);
    try {
      await api("/t/cxc", {
        body: {
          sucursalId,
          clienteId: cliente.id,
          montoOriginal: monto,
          diasCreditoOtorgados: dias,
          ...(notas ? { notas } : {}),
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear la cuenta");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <form onSubmit={guardar} className="gx-modal-panel">
        <h2 className="mb-4 font-bold text-lg text-slate-800">Nueva cuenta por cobrar</h2>

        <label className="mb-3 block">
          <span className="gx-label">Sucursal</span>
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

        <div className="mb-3 block">
          <span className="gx-label">Cliente</span>
          {cliente ? (
            <div className="flex items-center justify-between rounded-lg border border-brand/40 bg-teal-50 px-3 py-2 text-sm">
              <span>{`${cliente.nombre} ${cliente.apellidos ?? ""}`.trim()}</span>
              <button
                type="button"
                onClick={() => setCliente(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={clienteQuery}
                onChange={(e) => setClienteQuery(e.target.value)}
                className="gx-input"
                placeholder="Buscar cliente…"
              />
              {clientes.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {clientes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCliente(c);
                        setClienteQuery("");
                        setClientes([]);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      {`${c.nombre} ${c.apellidos ?? ""}`.trim()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="gx-label">Monto (MXN)</span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="gx-input"
              required
            />
          </label>
          <label className="block">
            <span className="gx-label">Días de crédito</span>
            <input
              type="number"
              min="1"
              max="365"
              value={dias}
              onChange={(e) => setDias(Number(e.target.value) || 30)}
              className="gx-input"
            />
          </label>
        </div>

        <label className="mb-3 block">
          <span className="gx-label">Notas (opcional)</span>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} className="gx-input" />
        </label>

        {error && <p className="mb-3 text-danger text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando || !cliente || !sucursalId || !monto}
            className="gx-btn-primary"
          >
            {guardando ? "Creando…" : "Crear cuenta"}
          </button>
        </div>
      </form>
    </div>
  );
}
