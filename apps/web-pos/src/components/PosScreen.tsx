import { useEffect, useRef, useState } from "react";
import type { Session } from "../App.js";
import { ApiError, api } from "../lib/api.js";
import type {
  Cliente,
  Producto,
  ProductoList,
  TicketLinea,
  VentaDetalle,
  VentaResponse,
} from "../lib/types.js";
import { ClienteModal } from "./ClienteModal.js";
import { CobroModal, type CobroResult } from "./CobroModal.js";
import { CorteModal } from "./CorteModal.js";
import { DevolucionModal } from "./DevolucionModal.js";
import { Recibo } from "./Recibo.js";

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function PosScreen({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [ticket, setTicket] = useState<TicketLinea[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [ultimaVenta, setUltimaVenta] = useState<VentaDetalle | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modalCliente, setModalCliente] = useState(false);
  const [modalCorte, setModalCorte] = useState(false);
  const [modalDevolucion, setModalDevolucion] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const [descuentoPct, setDescuentoPct] = useState(0);
  const [descuentoMotivo, setDescuentoMotivo] = useState("");

  const subtotalTicket = ticket.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const descuentoMonto = subtotalTicket * (descuentoPct / 100);
  const total = subtotalTicket - descuentoMonto;
  const numItems = ticket.reduce((s, l) => s + l.cantidad, 0);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Búsqueda con debounce contra /t/productos?q=
  useEffect(() => {
    if (query.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await api<ProductoList>(
          `/t/productos?q=${encodeURIComponent(query)}&pageSize=12`,
        );
        setResultados(res.items);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function agregarProducto(p: Producto) {
    const variante = p.variantes[0];
    if (!variante) return;
    const precio = Number.parseFloat(variante.precioBase);
    setTicket((prev) => {
      const existente = prev.find((l) => l.varianteId === variante.id);
      if (existente) {
        return prev.map((l) =>
          l.varianteId === variante.id ? { ...l, cantidad: l.cantidad + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          varianteId: variante.id,
          sku: variante.sku,
          nombre: p.nombre,
          precioUnitario: precio,
          cantidad: 1,
        },
      ];
    });
    setQuery("");
    setResultados([]);
    searchRef.current?.focus();
  }

  // Enter en el buscador: intenta match exacto por código de barras.
  async function onSearchEnter() {
    const code = query.trim();
    if (!code) return;
    try {
      const p = await api<{ variante: { producto: Producto } }>(
        `/t/productos/buscar/${encodeURIComponent(code)}`,
      );
      if (p?.variante?.producto) {
        agregarProducto(p.variante.producto);
        return;
      }
    } catch {
      // no es barcode exacto; deja que la búsqueda por texto muestre resultados
    }
  }

  function cambiarCantidad(varianteId: string, delta: number) {
    setTicket((prev) =>
      prev
        .map((l) => (l.varianteId === varianteId ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0),
    );
  }

  function quitarLinea(varianteId: string) {
    setTicket((prev) => prev.filter((l) => l.varianteId !== varianteId));
  }

  async function confirmarCobro(pago: CobroResult) {
    if (ticket.length === 0) return;
    setProcesando(true);
    setAviso(null);
    try {
      const venta = await api<VentaResponse>("/t/ventas", {
        body: {
          sucursalId: session.sucursal.id,
          ...(session.caja ? { cajaId: session.caja.id } : {}),
          ...(cliente ? { clienteId: cliente.id } : {}),
          ...(descuentoPct > 0
            ? {
                descuentoGlobalPct: String(descuentoPct),
                descuentoGlobalMotivo: descuentoMotivo || "Descuento en caja",
              }
            : {}),
          canal: "pos",
          lineas: ticket.map((l) => ({ varianteId: l.varianteId, cantidad: String(l.cantidad) })),
          pagos: [{ metodo: pago.metodo, monto: pago.monto.toFixed(2) }],
        },
      });
      const detalle = await api<VentaDetalle>(`/t/ventas/${venta.ventaId}`);
      setUltimaVenta(detalle);
      setTicket([]);
      setCliente(null);
      setDescuentoPct(0);
      setDescuentoMotivo("");
      setCobrando(false);
    } catch (err) {
      setAviso(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Error al cobrar",
      );
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between bg-brand px-4 py-3 text-white">
        <div>
          <span className="font-bold">GaesSoft POS</span>
          <span className="ml-3 text-sm text-teal-100">
            {session.sucursal.nombre}
            {session.caja ? ` · ${session.caja.codigo}` : " · sin caja"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-teal-100">{session.cajeroNombre}</span>
          <button
            type="button"
            onClick={() => setModalDevolucion(true)}
            className="rounded bg-brand-dark px-3 py-1"
          >
            Devolución
          </button>
          {session.caja && (
            <button
              type="button"
              onClick={() => setModalCorte(true)}
              className="rounded bg-brand-dark px-3 py-1"
            >
              Corte
            </button>
          )}
          <button type="button" onClick={onLogout} className="rounded bg-brand-dark px-3 py-1">
            Salir
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Izquierda: búsqueda + resultados */}
        <div className="flex w-1/2 flex-col border-r border-slate-200 p-4">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSearchEnter();
            }}
            placeholder="Buscar producto o escanear código…"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-lg focus:border-brand focus:outline-none"
          />
          <div className="mt-3 flex-1 overflow-y-auto">
            {buscando && <p className="text-sm text-slate-400">Buscando…</p>}
            {resultados.map((p) => {
              const v = p.variantes[0];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregarProducto(p)}
                  className="mb-2 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-brand"
                >
                  <div>
                    <p className="font-medium text-slate-800">{p.nombre}</p>
                    <p className="text-xs text-slate-400">{v?.sku}</p>
                  </div>
                  <span className="font-semibold text-brand">
                    {v ? money(Number.parseFloat(v.precioBase)) : "—"}
                  </span>
                </button>
              );
            })}
            {!buscando && query.length >= 2 && resultados.length === 0 && (
              <p className="text-sm text-slate-400">Sin resultados para “{query}”.</p>
            )}
          </div>
        </div>

        {/* Derecha: ticket */}
        <div className="flex w-1/2 flex-col p-4">
          {ultimaVenta ? (
            <TicketResultado
              session={session}
              venta={ultimaVenta}
              onNueva={() => setUltimaVenta(null)}
            />
          ) : (
            <>
              <h2 className="mb-2 text-lg font-bold text-slate-800">
                Ticket {numItems > 0 && <span className="text-slate-400">({numItems})</span>}
              </h2>
              <div className="flex-1 overflow-y-auto">
                {ticket.length === 0 ? (
                  <p className="mt-8 text-center text-slate-400">Agrega productos al ticket</p>
                ) : (
                  ticket.map((l) => (
                    <div
                      key={l.varianteId}
                      className="mb-2 flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{l.nombre}</p>
                        <p className="text-xs text-slate-400">{money(l.precioUnitario)} c/u</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(l.varianteId, -1)}
                          className="h-7 w-7 rounded bg-slate-100 font-bold text-slate-600"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-medium">{l.cantidad}</span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(l.varianteId, 1)}
                          className="h-7 w-7 rounded bg-slate-100 font-bold text-slate-600"
                        >
                          +
                        </button>
                      </div>
                      <span className="w-20 text-right font-semibold text-slate-800">
                        {money(l.precioUnitario * l.cantidad)}
                      </span>
                      <button
                        type="button"
                        onClick={() => quitarLinea(l.varianteId)}
                        className="text-slate-300 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              {aviso && <p className="mb-2 text-sm text-red-600">{aviso}</p>}

              <button
                type="button"
                onClick={() => setModalCliente(true)}
                className="mb-2 flex w-full items-center justify-between rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm hover:border-brand"
              >
                <span className="text-slate-500">Cliente</span>
                <span className="font-medium text-slate-800">
                  {cliente ? `${cliente.nombre} ${cliente.apellidos ?? ""}` : "Público en general"}
                </span>
              </button>

              <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-500">Descuento</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={descuentoPct || ""}
                  onChange={(e) =>
                    setDescuentoPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                  }
                  className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-brand focus:outline-none"
                  placeholder="0"
                />
                <span className="text-sm text-slate-500">%</span>
                {descuentoPct > 0 && (
                  <input
                    value={descuentoMotivo}
                    onChange={(e) => setDescuentoMotivo(e.target.value)}
                    placeholder="Motivo"
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand focus:outline-none"
                  />
                )}
              </div>

              <div className="border-t border-slate-200 pt-3">
                {descuentoPct > 0 && (
                  <div className="mb-1 flex items-center justify-between text-sm text-slate-500">
                    <span>Subtotal</span>
                    <span>{money(subtotalTicket)}</span>
                  </div>
                )}
                {descuentoPct > 0 && (
                  <div className="mb-2 flex items-center justify-between text-sm text-emerald-600">
                    <span>Descuento ({descuentoPct}%)</span>
                    <span>−{money(descuentoMonto)}</span>
                  </div>
                )}
                <div className="mb-3 flex items-center justify-between text-2xl font-bold text-slate-900">
                  <span>Total</span>
                  <span>{money(total)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCobrando(true)}
                  disabled={ticket.length === 0}
                  className="w-full rounded-lg bg-brand py-4 text-lg font-bold text-white hover:bg-brand-dark disabled:opacity-40"
                >
                  Cobrar {money(total)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {cobrando && (
        <CobroModal
          total={total}
          procesando={procesando}
          onCancel={() => setCobrando(false)}
          onConfirm={confirmarCobro}
        />
      )}

      {modalCliente && (
        <ClienteModal
          onClose={() => setModalCliente(false)}
          onSelect={(c) => {
            setCliente(c);
            setModalCliente(false);
          }}
        />
      )}

      {modalCorte && (
        <CorteModal
          session={session}
          onClose={() => setModalCorte(false)}
          onCierreZ={() => {
            setModalCorte(false);
            onLogout();
          }}
        />
      )}

      {modalDevolucion && <DevolucionModal onClose={() => setModalDevolucion(false)} />}

      {ultimaVenta && <Recibo session={session} venta={ultimaVenta} />}
    </div>
  );
}

function TicketResultado({
  session,
  venta,
  onNueva,
}: { session: Session; venta: VentaDetalle; onNueva: () => void }) {
  const [facturando, setFacturando] = useState(false);
  const [cfdiMsg, setCfdiMsg] = useState<string | null>(null);

  async function facturar() {
    setFacturando(true);
    setCfdiMsg(null);
    try {
      await api(`/t/ventas/${venta.id}/cfdi/emitir`, {
        body: { formaPago: "01", usoCfdi: "G03" },
      });
      setCfdiMsg("✓ CFDI emitido y enviado");
    } catch (err) {
      setCfdiMsg(
        err instanceof ApiError && err.status === 409
          ? "Configura los datos fiscales (CFDI) del negocio para facturar"
          : err instanceof ApiError
            ? err.message
            : "No se pudo facturar",
      );
    } finally {
      setFacturando(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-2 text-5xl">✓</div>
      <h2 className="text-xl font-bold text-slate-800">Venta registrada</h2>
      <p className="mb-1 text-slate-500">Folio {venta.folio}</p>
      <p className="mb-6 text-3xl font-bold text-brand">
        ${Number.parseFloat(venta.total).toFixed(2)}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-brand px-5 py-3 font-semibold text-brand hover:bg-teal-50"
        >
          🖨️ Imprimir
        </button>
        <button
          type="button"
          onClick={facturar}
          disabled={facturando}
          className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {facturando ? "Facturando…" : "Facturar (CFDI)"}
        </button>
        <button
          type="button"
          onClick={onNueva}
          className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark"
        >
          Nueva venta
        </button>
      </div>
      {cfdiMsg && <p className="mt-4 text-sm text-slate-600">{cfdiMsg}</p>}
      <p className="mt-1 text-xs text-slate-400">Sesión de {session.cajeroNombre}</p>
    </div>
  );
}
