import { CheckCircle2, Printer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Session } from "../App.js";
import { ApiError, api, puede } from "../lib/api.js";
import {
  type CashPayload,
  type CashResult,
  type CashScope,
  cashStorageKey,
  finishCashAttempt,
  readCashAttempt,
  recoverCashAttempt,
  startCashAttempt,
} from "../lib/cash-attempt.js";
import { LatestSearch, findBarcode } from "../lib/product-search.js";
import type {
  Cliente,
  Producto,
  ProductoList,
  TicketLinea,
  VentaDetalle,
  VentaResponse,
} from "../lib/types.js";
import { ApartadosModal } from "./ApartadosModal.js";
import { ClienteModal } from "./ClienteModal.js";
import { CobroModal, type CobroResult } from "./CobroModal.js";
import { CorteModal } from "./CorteModal.js";
import { DevolucionModal } from "./DevolucionModal.js";
import { PesoModal } from "./PesoModal.js";
import { RecargaModal } from "./RecargaModal.js";
import { Recibo } from "./Recibo.js";

interface PesajePendiente {
  varianteId: string;
  sku: string;
  nombre: string;
  precioUnitario: number;
  pesoInicial?: number;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function PosScreen({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [ticket, setTicket] = useState<TicketLinea[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchVersion, setSearchVersion] = useState(0);
  const [searched, setSearched] = useState(false);
  const latestSearch = useRef(new LatestSearch());
  const searchKind = useRef<"text" | "barcode">("text");
  const [cobrando, setCobrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [ultimaVenta, setUltimaVenta] = useState<VentaDetalle | null>(null);
  const [ventaRegistrada, setVentaRegistrada] = useState<VentaResponse | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modalCliente, setModalCliente] = useState(false);
  const [modalCorte, setModalCorte] = useState(false);
  const [modalDevolucion, setModalDevolucion] = useState(false);
  const [modalRecarga, setModalRecarga] = useState(false);
  const [modalApartados, setModalApartados] = useState(false);
  const [pesaje, setPesaje] = useState<PesajePendiente | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saleBusy = useRef(false);
  const [cashScope, setCashScope] = useState<CashScope | null>(null);
  const [cashPending, setCashPending] = useState(false);
  const [cashLoading, setCashLoading] = useState(true);
  const [cashResult, setCashResult] = useState<CashResult | null>(null);
  const [cashError, setCashError] = useState<string | null>(null);
  const [quotedTotal, setQuotedTotal] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const sync = (scope: CashScope) => {
      try {
        setCashPending(!!readCashAttempt(scope));
      } catch (error) {
        setCashError(error instanceof Error ? error.message : "No se pudo leer el intento");
        setCashPending(true);
      }
    };
    let scope: CashScope | null = null;
    const changed = (event: StorageEvent) => {
      if (scope && event.key === cashStorageKey(scope)) {
        sync(scope);
        setCashResult(null);
        if (!event.newValue) {
          clearTicket();
          setUltimaVenta(null);
        }
      }
    };
    window.addEventListener("storage", changed);
    void (async () => {
      try {
        const identity = await api<{ id: string; tenantSlug: string }>("/auth/tenant/me");
        if (!identity.id || !identity.tenantSlug || !session.caja)
          throw new Error("No se pudo verificar la identidad de la caja.");
        scope = {
          userId: identity.id,
          tenantSlug: identity.tenantSlug,
          cajaId: session.caja.id,
          sucursalId: session.sucursal.id,
        };
        if (active) {
          setCashScope(scope);
          sync(scope);
        }
      } catch (error) {
        if (active)
          setCashError(error instanceof Error ? error.message : "No se pudo verificar la sesión");
      } finally {
        if (active) setCashLoading(false);
      }
    })();
    return () => {
      active = false;
      window.removeEventListener("storage", changed);
    };
  }, [session]);

  const [descuentoPct, setDescuentoPct] = useState(0);
  const [descuentoMotivo, setDescuentoMotivo] = useState("");

  const subtotalTicket = ticket.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const descuentoMonto = subtotalTicket * (descuentoPct / 100);
  const total = subtotalTicket - descuentoMonto;
  const numItems = ticket.reduce((s, l) => s + l.cantidad, 0);

  useEffect(() => {
    searchRef.current?.focus();
    const search = latestSearch.current;
    return () => search.invalidate();
  }, []);

  function updateQuery(value: string) {
    latestSearch.current.invalidate();
    setResultados([]);
    setSearchError(null);
    setBuscando(false);
    setSearched(false);
    setQuery(value);
  }
  useEffect(() => {
    const current = latestSearch.current.begin();
    setResultados([]);
    setSearchError(null);
    setSearched(false);
    setBuscando(false);
    if (query.trim().length < 2) return current.cancel;
    const timer = setTimeout(async () => {
      if (!current.current()) return;
      searchKind.current = "text";
      setBuscando(true);
      try {
        const response = await api<ProductoList>(
          `/t/productos?q=${encodeURIComponent(query.trim())}&pageSize=12&isActive=true`,
          { signal: current.signal },
        );
        if (!Array.isArray(response?.items))
          throw new Error("El servidor devolvió resultados no válidos.");
        if (current.current()) {
          setResultados(response.items);
          setSearched(true);
        }
      } catch (error) {
        if (current.current())
          setSearchError(
            error instanceof Error ? error.message : "No se pudo buscar. Revisa la conexión.",
          );
      } finally {
        if (current.current()) setBuscando(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      current.cancel();
    };
  }, [query, searchVersion]);

  function agregarProducto(p: Producto) {
    const variante = p.variantes[0];
    if (!variante) return;
    const nombre = variante.nombreVariante ? `${p.nombre} · ${variante.nombreVariante}` : p.nombre;
    const precio = Number.parseFloat(variante.precioBase);
    if (p.requiresBalanza) {
      setPesaje({
        varianteId: variante.id,
        sku: variante.sku,
        nombre,
        precioUnitario: precio,
      });
      updateQuery("");
      setResultados([]);
      return;
    }
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
          nombre,
          precioUnitario: precio,
          cantidad: 1,
        },
      ];
    });
    updateQuery("");
    setResultados([]);
    searchRef.current?.focus();
  }

  async function onSearchEnter() {
    const code = query.trim();
    if (!code) return;
    const current = latestSearch.current.begin();
    searchKind.current = "barcode";
    setSearchError(null);
    setResultados([]);
    setBuscando(true);
    setSearched(false);
    try {
      const product = await findBarcode(code, current.signal);
      if (!current.current()) return;
      if (product) agregarProducto(product);
      else setSearchVersion((version) => version + 1);
    } catch (error) {
      if (current.current())
        setSearchError(
          error instanceof Error
            ? error.message
            : "No se pudo verificar el código. Revisa la conexión.",
        );
    } finally {
      if (current.current()) setBuscando(false);
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

  function confirmarPeso(kg: number) {
    if (!pesaje) return;
    setTicket((prev) => {
      const existente = prev.find((l) => l.varianteId === pesaje.varianteId);
      if (existente) {
        return prev.map((l) => (l.varianteId === pesaje.varianteId ? { ...l, cantidad: kg } : l));
      }
      return [
        ...prev,
        {
          varianteId: pesaje.varianteId,
          sku: pesaje.sku,
          nombre: pesaje.nombre,
          precioUnitario: pesaje.precioUnitario,
          cantidad: kg,
          esBalanza: true,
        },
      ];
    });
    setPesaje(null);
    searchRef.current?.focus();
  }

  function saleBase() {
    return {
      sucursalId: session.sucursal.id,
      ...(session.caja ? { cajaId: session.caja.id } : {}),
      ...(cliente ? { clienteId: cliente.id } : {}),
      ...(descuentoPct > 0
        ? {
            descuentoGlobalPct: String(descuentoPct),
            descuentoGlobalMotivo: descuentoMotivo || "Descuento en caja",
          }
        : {}),
      canal: "pos" as const,
      lineas: ticket.map((line) => ({
        varianteId: line.varianteId,
        cantidad: String(line.cantidad),
      })),
    };
  }
  async function quoteSale() {
    if (saleBusy.current || cashPending) return;
    saleBusy.current = true;
    setProcesando(true);
    setAviso(null);
    try {
      const quote = await api<{ total: string }>("/t/ventas/preview", { body: saleBase() });
      const amount = Number(quote.total);
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error("El total del servidor no es válido.");
      setQuotedTotal(amount);
      setCobrando(true);
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "No se pudo cotizar la venta.");
    } finally {
      saleBusy.current = false;
      setProcesando(false);
    }
  }
  async function confirmarCobro(pago: CobroResult) {
    if (!ticket.length || saleBusy.current || quotedTotal === null) return;
    saleBusy.current = true;
    setProcesando(true);
    setAviso(null);
    const cashOnly =
      pago.pagos.length > 0 && pago.pagos.every((item) => item.metodo === "efectivo");
    try {
      if (cashScope && readCashAttempt(cashScope)) {
        setCashPending(true);
        throw new Error("Hay un intento pendiente en esta caja.");
      }
      if (cashOnly) {
        if (!cashScope) throw new Error("No se pudo verificar la identidad de caja.");
        const payload: CashPayload = {
          ...saleBase(),
          cajaId: cashScope.cajaId,
          expectedTotal: quotedTotal.toFixed(2),
          pagos: pago.pagos.map((item) => ({ metodo: "efectivo", monto: item.monto.toFixed(2) })),
        };
        setCashResult(await startCashAttempt(cashScope, payload));
        setCobrando(false);
      } else {
        const venta = await api<VentaResponse>("/t/ventas", {
          body: {
            ...saleBase(),
            pagos: pago.pagos.map((item) => ({
              metodo: item.metodo,
              monto: item.monto.toFixed(2),
            })),
          },
        });
        setVentaRegistrada(venta);
        clearTicket();
        setCobrando(false);
        await cargarReciboRegistrado(venta.ventaId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo verificar el cobro";
      setAviso(message);
      if (cashOnly) {
        setCashError(message);
        setCobrando(false);
      }
    } finally {
      if (cashScope) {
        try {
          setCashPending(!!readCashAttempt(cashScope));
        } catch {
          setCashPending(true);
        }
      }
      saleBusy.current = false;
      setProcesando(false);
    }
  }
  function clearTicket() {
    setTicket([]);
    setCliente(null);
    setDescuentoPct(0);
    setDescuentoMotivo("");
    setQuotedTotal(null);
  }
  async function cargarReciboRegistrado(ventaId: string) {
    setProcesando(true);
    setAviso(null);
    try {
      setUltimaVenta(await api<VentaDetalle>(`/t/ventas/${ventaId}`));
    } catch {
      setAviso("La venta está registrada, pero no se pudo cargar el recibo. No vuelvas a cobrar.");
    } finally {
      setProcesando(false);
    }
  }
  async function recoverCash(action: "query" | "retry" | "cancel") {
    if (!cashScope || saleBusy.current) return;
    saleBusy.current = true;
    setProcesando(true);
    setCashError(null);
    try {
      setCashResult(await recoverCashAttempt(cashScope, action));
    } catch (error) {
      setCashError(error instanceof Error ? error.message : "No se pudo verificar el intento.");
    } finally {
      saleBusy.current = false;
      setProcesando(false);
    }
  }
  async function newCashSale() {
    if (!cashScope || saleBusy.current) return;
    saleBusy.current = true;
    setProcesando(true);
    try {
      await finishCashAttempt(cashScope);
      setUltimaVenta(null);
      clearTicket();
      setCashPending(false);
      setCashResult(null);
      setCashError(null);
      setAviso(null);
    } catch (error) {
      setCashError(error instanceof Error ? error.message : "No se pudo resolver el intento.");
    } finally {
      saleBusy.current = false;
      setProcesando(false);
    }
  }
  async function cashReceipt() {
    if (cashResult?.status !== "ready") return;
    setProcesando(true);
    try {
      setUltimaVenta(await api<VentaDetalle>(`/t/ventas/${cashResult.result.ventaId}`));
    } catch {
      setCashError(
        "La venta está registrada, pero no se pudo cargar el recibo. No vuelvas a cobrar.",
      );
    } finally {
      setProcesando(false);
    }
  }
  if (ventaRegistrada)
    return (
      <main className="p-4">
        <section className="gx-card mx-auto w-full max-w-lg">
          <h1 className="text-xl font-bold">Venta registrada</h1>
          <p className="my-3 break-words">
            {ventaRegistrada.folio} · ${ventaRegistrada.total}
          </p>
          {aviso && (
            <p role="alert" className="my-3 text-red-700">
              {aviso}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="gx-btn-secondary min-h-10"
              disabled={procesando}
              onClick={() => void cargarReciboRegistrado(ventaRegistrada.ventaId)}
            >
              {ultimaVenta ? "Actualizar recibo" : "Reintentar recibo"}
            </button>
            {ultimaVenta && (
              <button
                type="button"
                className="gx-btn-secondary min-h-10"
                onClick={() => window.print()}
              >
                Imprimir recibo
              </button>
            )}
            <button
              type="button"
              className="gx-btn-primary min-h-10"
              disabled={procesando}
              onClick={() => {
                setVentaRegistrada(null);
                setUltimaVenta(null);
                setAviso(null);
              }}
            >
              Iniciar nueva venta
            </button>
          </div>
          {ultimaVenta && <Recibo session={session} venta={ultimaVenta} />}
        </section>
      </main>
    );
  if (cashLoading || cashPending || !cashScope)
    return (
      <main className="flex min-h-full items-center justify-center p-4">
        <section className="gx-card w-full max-w-lg min-w-0">
          <h1 className="text-xl font-bold">
            {cashLoading ? "Verificando caja…" : "Verificar cobro en efectivo"}
          </h1>
          <p className="my-3 text-sm">
            {session.sucursal.nombre} · {session.caja?.codigo}
          </p>
          {cashError && (
            <p role="alert" className="my-3 break-words text-red-700">
              {cashError}
            </p>
          )}
          {cashPending && cashResult?.status !== "ready" && cashResult?.status !== "cancelled" && (
            <p className="my-3 text-sm">
              Hay un intento guardado. No solicites efectivo nuevamente ni inicies otra venta hasta
              resolverlo.
            </p>
          )}
          {cashResult?.status === "ready" && (
            <output className="my-3 block text-sm">
              Venta {cashResult.result.folio} · ${cashResult.result.total} · Estado actual:{" "}
              {cashResult.ventaEstado}
            </output>
          )}
          {cashResult?.status === "not_found" && (
            <p className="my-3 text-sm">
              Aún no hay resultado. El envío puede seguir en tránsito. Puedes consultar, repetir el
              mismo intento o descartarlo de forma segura.
            </p>
          )}
          {cashResult?.status === "processing" && (
            <p className="my-3 text-sm">
              El servidor está procesando el cobro. Espera y consulta nuevamente.
            </p>
          )}
          {cashResult?.status === "cancelled" && (
            <p className="my-3 text-sm">
              Intento descartado en el servidor. Un envío tardío con esa clave ya no registrará una
              venta.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {cashScope && cashPending && (
              <button
                type="button"
                className="gx-btn-primary min-h-10"
                disabled={procesando}
                onClick={() => void recoverCash("query")}
              >
                Consultar estado
              </button>
            )}
            {cashResult?.status === "not_found" && (
              <button
                type="button"
                className="gx-btn-secondary min-h-10"
                disabled={procesando}
                onClick={() => void recoverCash("retry")}
              >
                Reintentar el mismo cobro
              </button>
            )}
            {cashScope &&
              cashPending &&
              cashResult?.status !== "ready" &&
              cashResult?.status !== "cancelled" && (
                <button
                  type="button"
                  className="gx-btn-secondary min-h-10"
                  disabled={procesando}
                  onClick={() => void recoverCash("cancel")}
                >
                  Descartar intento sin cancelar ventas
                </button>
              )}
            {cashResult?.status === "ready" && (
              <button
                type="button"
                className="gx-btn-secondary min-h-10"
                disabled={procesando}
                onClick={() => void cashReceipt()}
              >
                Ver recibo
              </button>
            )}
            {(cashResult?.status === "ready" || cashResult?.status === "cancelled") && (
              <button
                type="button"
                className="gx-btn-primary min-h-10"
                disabled={procesando}
                onClick={() => void newCashSale()}
              >
                Iniciar nueva venta
              </button>
            )}
            <button
              type="button"
              className="gx-btn-ghost min-h-10"
              disabled={procesando}
              onClick={onLogout}
            >
              Cerrar sesión
            </button>
          </div>
          {ultimaVenta && (
            <>
              <p className="my-3 text-sm">Recibo cargado: {ultimaVenta.folio}</p>
              <button
                type="button"
                className="gx-btn-secondary min-h-10"
                onClick={() => window.print()}
              >
                Imprimir recibo
              </button>
              <Recibo session={session} venta={ultimaVenta} />
            </>
          )}
        </section>
      </main>
    );

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-brand px-4 py-3 text-white">
        <div>
          <span className="font-bold">GaesSoft POS</span>
          <span className="ml-2 block text-xs text-teal-100 sm:ml-3 sm:inline sm:text-sm">
            {session.sucursal.nombre}
            {session.caja ? ` · ${session.caja.codigo}` : " · sin caja"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm sm:gap-3">
          <span className="hidden text-teal-100 sm:inline">{session.cajeroNombre}</span>
          {puede("ventas.devolver") && (
            <button
              type="button"
              onClick={() => setModalDevolucion(true)}
              className="rounded bg-brand-dark px-3 py-1"
            >
              Devolución
            </button>
          )}
          {puede("recargas.vender") && (
            <button
              type="button"
              onClick={() => setModalRecarga(true)}
              className="rounded bg-brand-dark px-3 py-1"
            >
              Recarga
            </button>
          )}
          {puede("apartados.leer") && (
            <button
              type="button"
              onClick={() => setModalApartados(true)}
              className="rounded bg-brand-dark px-3 py-1"
            >
              Apartados
            </button>
          )}
          {session.caja && puede("corte.consultar") && (
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

      <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {/* Izquierda: búsqueda + resultados */}
        <div className="flex min-h-[40vh] w-full flex-col border-b border-slate-200 p-4 md:min-h-0 md:w-1/2 md:border-b-0 md:border-r">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSearchEnter();
            }}
            placeholder="Buscar producto o escanear código…"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-lg focus:border-brand focus:outline-none"
          />
          <div className="mt-3 flex-1 overflow-y-auto">
            {buscando && <p className="text-sm text-slate-400">Buscando…</p>}
            {searchError && (
              <div className="my-3">
                <p role="alert" className="break-words text-sm text-red-700">
                  {searchError}
                </p>
                <button
                  type="button"
                  className="gx-btn-secondary mt-2 min-h-10"
                  onClick={() => {
                    if (searchKind.current === "barcode") void onSearchEnter();
                    else setSearchVersion((version) => version + 1);
                  }}
                >
                  Reintentar búsqueda
                </button>
              </div>
            )}
            {searched && !searchError && !buscando && !resultados.length && (
              <p className="text-sm text-slate-500">Sin coincidencias para esta búsqueda.</p>
            )}
            {resultados
              .flatMap((product) =>
                product.variantes.map((variant) => ({ ...product, variantes: [variant] })),
              )
              .map((p) => {
                const v = p.variantes[0];
                return (
                  <button
                    key={`${p.id}-${v?.id}`}
                    type="button"
                    onClick={() => agregarProducto(p)}
                    className="mb-2 flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-brand"
                  >
                    <div className="min-w-0 break-words">
                      <p className="font-medium text-slate-800">
                        {p.nombre}
                        {v?.nombreVariante ? ` · ${v.nombreVariante}` : ""}
                      </p>
                      <p className="text-xs text-slate-400">{v?.sku}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-brand">
                      {v ? money(Number.parseFloat(v.precioBase)) : "—"}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Derecha: ticket */}
        <div className="flex w-full flex-col p-4 md:w-1/2">
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
                      className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="w-full min-w-0">
                        <p className="break-words font-medium text-slate-800">{l.nombre}</p>
                        <p className="text-xs text-slate-400">{money(l.precioUnitario)} c/u</p>
                      </div>
                      {l.esBalanza ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPesaje({
                              varianteId: l.varianteId,
                              sku: l.sku,
                              nombre: l.nombre,
                              precioUnitario: l.precioUnitario,
                              pesoInicial: l.cantidad,
                            })
                          }
                          className="min-h-10 rounded bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700"
                        >
                          {l.cantidad.toFixed(3)} kg
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(l.varianteId, -1)}
                            aria-label={`Quitar una unidad de ${l.nombre}`}
                            className="h-10 w-10 rounded bg-slate-100 font-bold text-slate-600"
                          >
                            −
                          </button>
                          <span className="w-8 text-center font-medium">{l.cantidad}</span>
                          <button
                            type="button"
                            onClick={() => cambiarCantidad(l.varianteId, 1)}
                            aria-label={`Agregar una unidad de ${l.nombre}`}
                            className="h-10 w-10 rounded bg-slate-100 font-bold text-slate-600"
                          >
                            +
                          </button>
                        </div>
                      )}
                      <span className="w-20 text-right font-semibold text-slate-800">
                        {money(l.precioUnitario * l.cantidad)}
                      </span>
                      <button
                        type="button"
                        onClick={() => quitarLinea(l.varianteId)}
                        aria-label={`Eliminar ${l.nombre} del ticket`}
                        className="flex h-10 w-10 items-center justify-center text-slate-600 hover:text-red-700"
                      >
                        <X size={16} />
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
                  aria-label="Descuento porcentual"
                  min={0}
                  max={100}
                  value={descuentoPct || ""}
                  onChange={(e) =>
                    setDescuentoPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                  }
                  className="min-h-10 w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-brand focus:outline-none"
                  placeholder="0"
                />
                <span className="text-sm text-slate-500">%</span>
                {descuentoPct > 0 && (
                  <input
                    value={descuentoMotivo}
                    aria-label="Motivo del descuento"
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
                  onClick={() => void quoteSale()}
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
          total={quotedTotal ?? total}
          saldoMonedero={cliente ? Number(cliente.saldoMonedero ?? 0) : 0}
          clienteNombre={cliente ? cliente.nombre : null}
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

      {modalDevolucion && (
        <DevolucionModal session={session} onClose={() => setModalDevolucion(false)} />
      )}

      {modalRecarga && <RecargaModal session={session} onClose={() => setModalRecarga(false)} />}

      {modalApartados && (
        <ApartadosModal
          session={session}
          cliente={cliente}
          ticket={ticket}
          onClose={() => setModalApartados(false)}
          onCreated={() => {
            setTicket([]);
            setCliente(null);
            setDescuentoPct(0);
            setDescuentoMotivo("");
          }}
        />
      )}

      {pesaje && (
        <PesoModal
          nombre={pesaje.nombre}
          precioPorKg={pesaje.precioUnitario}
          {...(pesaje.pesoInicial !== undefined ? { pesoInicial: pesaje.pesoInicial } : {})}
          onConfirm={confirmarPeso}
          onCancel={() => setPesaje(null)}
        />
      )}

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
      setCfdiMsg("CFDI emitido y enviado");
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
      <CheckCircle2 size={56} className="mb-2 text-emerald-500" />
      <h2 className="text-xl font-bold text-slate-800">Venta registrada</h2>
      <p className="mb-1 text-slate-500">Folio {venta.folio}</p>
      <p className="mb-6 text-3xl font-bold text-brand">
        ${Number.parseFloat(venta.total).toFixed(2)}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg border border-brand px-5 py-3 font-semibold text-brand hover:bg-teal-50"
        >
          <Printer size={18} /> Imprimir
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
