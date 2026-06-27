import { Minus, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "../App.js";
import { ApiError, api, puede } from "../lib/api.js";
import type {
  ApartadoDetalle,
  ApartadoEstado,
  ApartadoListItem,
  ApartadoLista,
  Cliente,
  ClienteList,
  MetodoAbono,
  ProductoList,
} from "../lib/types.js";

const METODOS: { value: MetodoAbono; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta_debito", label: "Débito" },
  { value: "tarjeta_credito", label: "Crédito" },
  { value: "transferencia", label: "Transferencia" },
  { value: "vale", label: "Vale" },
  { value: "otro", label: "Otro" },
];

const ESTADO_LABEL: Record<ApartadoEstado, { label: string; clase: string }> = {
  activo: { label: "Activo", clase: "bg-emerald-100 text-emerald-700" },
  liquidado_y_entregado: { label: "Liquidado", clase: "bg-slate-200 text-slate-600" },
  cancelado: { label: "Cancelado", clase: "bg-red-100 text-red-600" },
  expirado: { label: "Expirado", clase: "bg-amber-100 text-amber-700" },
};

type LineaNueva = {
  varianteId: string;
  sku: string;
  nombre: string;
  precio: number;
  cantidad: number;
};

function saldoDe(a: { total: string; montoPagado: string }): number {
  return Number.parseFloat(a.total) - Number.parseFloat(a.montoPagado);
}

function nombreCliente(a: ApartadoListItem): string {
  if (a.clienteB2b) return a.clienteB2b.razonSocial;
  if (a.cliente) return `${a.cliente.nombre} ${a.cliente.apellidos ?? ""}`.trim();
  return "—";
}

export function ApartadosModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const [tab, setTab] = useState<"lista" | "nuevo">("lista");
  const [error, setError] = useState<string | null>(null);

  const puedeCrear = puede("apartados.crear");

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">Apartados</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-4 pt-3">
          <button
            type="button"
            onClick={() => setTab("lista")}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${
              tab === "lista" ? "bg-brand text-white" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            Activos
          </button>
          {puedeCrear && (
            <button
              type="button"
              onClick={() => setTab("nuevo")}
              className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${
                tab === "nuevo" ? "bg-brand text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              Nuevo apartado
            </button>
          )}
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {tab === "lista" ? (
            <ListaApartados onError={setError} />
          ) : (
            <NuevoApartado session={session} onError={setError} onCreado={() => setTab("lista")} />
          )}
        </div>
      </div>
    </div>
  );
}

function ListaApartados({ onError }: { onError: (m: string | null) => void }) {
  const [items, setItems] = useState<ApartadoListItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionado, setSeleccionado] = useState<ApartadoDetalle | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    onError(null);
    try {
      const res = await api<ApartadoLista>("/t/apartados?estado=activo&pageSize=50");
      setItems(res.items);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Error al cargar apartados");
    } finally {
      setCargando(false);
    }
  }, [onError]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function abrir(id: string) {
    onError(null);
    try {
      setSeleccionado(await api<ApartadoDetalle>(`/t/apartados/${id}`));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Error al abrir el apartado");
    }
  }

  if (seleccionado) {
    return (
      <DetalleApartado
        apartado={seleccionado}
        onError={onError}
        onVolver={() => setSeleccionado(null)}
        onCambio={() => {
          void cargar();
          void abrir(seleccionado.id);
        }}
      />
    );
  }

  if (cargando) return <p className="text-center text-slate-400">Cargando…</p>;
  if (items.length === 0)
    return <p className="text-center text-slate-400">No hay apartados activos.</p>;

  return (
    <div className="flex flex-col gap-2">
      {items.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => abrir(a.id)}
          className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-brand"
        >
          <div>
            <p className="font-semibold text-slate-800">{a.folio}</p>
            <p className="text-xs text-slate-500">{nombreCliente(a)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-700">Saldo ${saldoDe(a).toFixed(2)}</p>
            <p className="text-xs text-slate-400">de ${Number.parseFloat(a.total).toFixed(2)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function DetalleApartado({
  apartado,
  onError,
  onVolver,
  onCambio,
}: {
  apartado: ApartadoDetalle;
  onError: (m: string | null) => void;
  onVolver: () => void;
  onCambio: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoAbono>("efectivo");
  const [motivo, setMotivo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const saldo = saldoDe(apartado);

  const puedeAbonar = puede("apartados.abonar");
  const puedeLiquidar = puede("apartados.liquidar");
  const puedeCancelar = puede("apartados.cancelar");

  async function correr(fn: () => Promise<unknown>) {
    setProcesando(true);
    onError(null);
    try {
      await fn();
      onCambio();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "No se pudo completar la acción");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onVolver} className="mb-3 text-sm text-brand hover:underline">
        ← Volver
      </button>

      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-lg font-bold text-slate-800">{apartado.folio}</p>
          <p className="text-sm text-slate-500">{nombreCliente(apartado)}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${ESTADO_LABEL[apartado.estado].clase}`}
        >
          {ESTADO_LABEL[apartado.estado].label}
        </span>
      </div>

      <div className="mb-3 rounded-lg bg-slate-50 p-3">
        {apartado.lineas.map((l) => (
          <div key={l.id} className="flex justify-between text-sm">
            <span className="text-slate-600">
              {l.cantidad}× {l.snapshotProducto?.nombreProducto ?? "—"}
            </span>
            <span className="text-slate-700">${Number.parseFloat(l.totalLinea).toFixed(2)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
          <span>Total</span>
          <span>${Number.parseFloat(apartado.total).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm text-emerald-600">
          <span>Pagado</span>
          <span>${Number.parseFloat(apartado.montoPagado).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold text-slate-800">
          <span>Saldo</span>
          <span>${saldo.toFixed(2)}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Vence: {new Date(apartado.fechaLimite).toLocaleDateString()}
        </p>
      </div>

      {apartado.abonos.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold text-slate-500">Abonos</p>
          {apartado.abonos.map((ab) => (
            <div key={ab.id} className="flex justify-between text-xs text-slate-500">
              <span>
                {new Date(ab.createdAt).toLocaleDateString()} · {ab.metodo}
              </span>
              <span>${Number.parseFloat(ab.monto).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {apartado.estado === "activo" && (
        <div className="flex flex-col gap-3">
          {puedeAbonar && saldo > 0 && (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-700">Registrar abono</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="Monto"
                  className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
                <select
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value as MetodoAbono)}
                  className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
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
                      await api(`/t/apartados/${apartado.id}/abonos`, {
                        method: "POST",
                        body: { monto, metodo },
                      });
                      setMonto("");
                    })
                  }
                  className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
                >
                  Abonar
                </button>
              </div>
            </div>
          )}

          {puedeLiquidar && (
            <button
              type="button"
              disabled={procesando || saldo > 0}
              onClick={() =>
                correr(() => api(`/t/apartados/${apartado.id}/liquidar`, { method: "POST" }))
              }
              className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
            >
              {saldo > 0 ? `Liquidar (falta $${saldo.toFixed(2)})` : "Liquidar y entregar"}
            </button>
          )}

          {puedeCancelar && (
            <div className="rounded-lg border border-red-200 p-3">
              <p className="mb-2 text-sm font-semibold text-red-600">Cancelar apartado</p>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo de cancelación"
                className="mb-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                disabled={procesando || motivo.trim().length < 3}
                onClick={() =>
                  correr(() =>
                    api(`/t/apartados/${apartado.id}/cancelar`, {
                      method: "POST",
                      body: { motivo },
                    }),
                  )
                }
                className="w-full rounded-lg border border-red-300 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                Cancelar apartado (pena {Number.parseFloat(apartado.penaCancelacionPct).toFixed(0)}
                %)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NuevoApartado({
  session,
  onError,
  onCreado,
}: {
  session: Session;
  onError: (m: string | null) => void;
  onCreado: () => void;
}) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ProductoList["items"]>([]);
  const [lineas, setLineas] = useState<LineaNueva[]>([]);
  const [clienteQuery, setClienteQuery] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [diasVigencia, setDiasVigencia] = useState(30);
  const [penaPct, setPenaPct] = useState(20);
  const [abonoMonto, setAbonoMonto] = useState("");
  const [abonoMetodo, setAbonoMetodo] = useState<MetodoAbono>("efectivo");
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api<ProductoList>(
          `/t/productos?q=${encodeURIComponent(query)}&pageSize=8`,
        );
        setResultados(res.items);
      } catch {
        setResultados([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!clienteQuery.trim()) {
      setClientes([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api<ClienteList>(
          `/t/clientes?q=${encodeURIComponent(clienteQuery)}&pageSize=8`,
        );
        setClientes(res.items);
      } catch {
        setClientes([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [clienteQuery]);

  function agregar(varianteId: string, sku: string, nombre: string, precio: number) {
    setLineas((prev) => {
      const ex = prev.find((l) => l.varianteId === varianteId);
      if (ex)
        return prev.map((l) =>
          l.varianteId === varianteId ? { ...l, cantidad: l.cantidad + 1 } : l,
        );
      return [...prev, { varianteId, sku, nombre, precio, cantidad: 1 }];
    });
    setQuery("");
    setResultados([]);
  }

  const total = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);

  async function crear() {
    if (!cliente || lineas.length === 0) return;
    setProcesando(true);
    onError(null);
    try {
      await api("/t/apartados", {
        method: "POST",
        body: {
          sucursalId: session.sucursal.id,
          ...(session.caja ? { cajaId: session.caja.id } : {}),
          clienteId: cliente.id,
          diasVigencia,
          penaCancelacionPct: penaPct,
          lineas: lineas.map((l) => ({ varianteId: l.varianteId, cantidad: String(l.cantidad) })),
          ...(abonoMonto && Number(abonoMonto) > 0
            ? { abonoInicial: { monto: abonoMonto, metodo: abonoMetodo } }
            : {}),
        },
      });
      onCreado();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "No se pudo crear el apartado");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        {resultados.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {resultados.map((p) => {
              const v = p.variantes[0];
              if (!v) return null;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregar(v.id, v.sku, p.nombre, Number.parseFloat(v.precioBase))}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>{p.nombre}</span>
                  <span className="text-brand">${Number.parseFloat(v.precioBase).toFixed(2)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {lineas.length === 0 ? (
        <p className="rounded-lg bg-slate-50 py-6 text-center text-sm text-slate-400">
          Agrega productos al apartado
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {lineas.map((l) => (
            <div
              key={l.varianteId}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <span className="flex-1 truncate">{l.nombre}</span>
              <button
                type="button"
                onClick={() =>
                  setLineas((prev) =>
                    prev
                      .map((x) =>
                        x.varianteId === l.varianteId
                          ? { ...x, cantidad: Math.max(1, x.cantidad - 1) }
                          : x,
                      )
                      .filter((x) => x.cantidad > 0),
                  )
                }
                className="rounded bg-slate-100 p-1 hover:bg-slate-200"
              >
                <Minus size={14} />
              </button>
              <span className="w-6 text-center">{l.cantidad}</span>
              <button
                type="button"
                onClick={() =>
                  setLineas((prev) =>
                    prev.map((x) =>
                      x.varianteId === l.varianteId ? { ...x, cantidad: x.cantidad + 1 } : x,
                    ),
                  )
                }
                className="rounded bg-slate-100 p-1 hover:bg-slate-200"
              >
                <Plus size={14} />
              </button>
              <span className="w-20 text-right font-medium">
                ${(l.precio * l.cantidad).toFixed(2)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setLineas((prev) => prev.filter((x) => x.varianteId !== l.varianteId))
                }
                className="text-slate-400 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex justify-between px-3 pt-1 text-sm font-bold">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="relative">
        {cliente ? (
          <div className="flex items-center justify-between rounded-lg border border-brand/40 bg-brand/5 px-3 py-2 text-sm">
            <span>
              Cliente: <strong>{`${cliente.nombre} ${cliente.apellidos ?? ""}`.trim()}</strong>
            </span>
            <button
              type="button"
              onClick={() => setCliente(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <input
              value={clienteQuery}
              onChange={(e) => setClienteQuery(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
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
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Vigencia (días)</span>
          <input
            type="number"
            min={1}
            max={180}
            value={diasVigencia}
            onChange={(e) => setDiasVigencia(Number(e.target.value) || 30)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Pena cancelación (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={penaPct}
            onChange={(e) => setPenaPct(Number(e.target.value) || 0)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-700">Abono inicial (opcional)</p>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            value={abonoMonto}
            onChange={(e) => setAbonoMonto(e.target.value)}
            placeholder="Monto"
            className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
          <select
            value={abonoMetodo}
            onChange={(e) => setAbonoMetodo(e.target.value as MetodoAbono)}
            className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
          >
            {METODOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        disabled={procesando || !cliente || lineas.length === 0}
        onClick={crear}
        className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
      >
        {procesando ? "Creando…" : "Crear apartado"}
      </button>
    </div>
  );
}
