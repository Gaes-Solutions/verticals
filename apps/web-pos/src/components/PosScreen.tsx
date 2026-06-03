import { useEffect, useRef, useState } from "react";
import type { Session } from "../App.js";
import { ApiError, api } from "../lib/api.js";
import type {
  Producto,
  ProductoList,
  TicketLinea,
  VentaDetalle,
  VentaResponse,
} from "../lib/types.js";
import { CobroModal, type CobroResult } from "./CobroModal.js";

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function PosScreen({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [ticket, setTicket] = useState<TicketLinea[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [ultimaVenta, setUltimaVenta] = useState<VentaDetalle | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const total = ticket.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
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
          canal: "pos",
          lineas: ticket.map((l) => ({ varianteId: l.varianteId, cantidad: String(l.cantidad) })),
          pagos: [{ metodo: pago.metodo, monto: pago.monto.toFixed(2) }],
        },
      });
      const detalle = await api<VentaDetalle>(`/t/ventas/${venta.ventaId}`);
      setUltimaVenta(detalle);
      setTicket([]);
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
            <TicketResultado venta={ultimaVenta} onNueva={() => setUltimaVenta(null)} />
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

              <div className="border-t border-slate-200 pt-3">
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
    </div>
  );
}

function TicketResultado({ venta, onNueva }: { venta: VentaDetalle; onNueva: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-2 text-5xl">✓</div>
      <h2 className="text-xl font-bold text-slate-800">Venta registrada</h2>
      <p className="mb-1 text-slate-500">Folio {venta.folio}</p>
      <p className="mb-6 text-3xl font-bold text-brand">
        ${Number.parseFloat(venta.total).toFixed(2)}
      </p>
      <button
        type="button"
        onClick={onNueva}
        className="rounded-lg bg-brand px-8 py-3 font-semibold text-white hover:bg-brand-dark"
      >
        Nueva venta
      </button>
    </div>
  );
}
