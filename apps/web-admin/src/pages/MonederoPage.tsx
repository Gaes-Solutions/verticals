import { CheckCircle2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";
import type { Paged } from "../lib/types.js";

function money(v: string | number): string {
  return `$${Number(v).toFixed(2)}`;
}

export function MonederoPage() {
  const [tab, setTab] = useState<"giftcards" | "monedero">("giftcards");
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-bold text-2xl text-slate-800">Monedero y tarjetas de regalo</h1>
      <p className="mb-4 text-slate-500 text-sm">
        Vende saldo por adelantado y dale a tus clientes saldo a favor.
      </p>
      <div className="mb-5 flex gap-1 rounded-lg bg-white p-1 shadow-sm">
        {(
          [
            ["giftcards", "Tarjetas de regalo"],
            ["monedero", "Monedero del cliente"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md px-4 py-1.5 font-medium text-sm ${
              tab === k ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "giftcards" ? <GiftCardsTab /> : <MonederoTab />}
    </div>
  );
}

interface GiftCard {
  id: string;
  codigo: string;
  montoInicial: string;
  saldoActual: string;
  status: string;
}

const STATUS_BADGE: Record<string, string> = {
  activa: "gx-badge-ok",
  agotada: "gx-badge-info",
  cancelada: "gx-badge-info",
  expirada: "gx-badge-info",
};

function GiftCardsTab() {
  const [data, setData] = useState<{ items: GiftCard[]; emitido: number; vigente: number }>({
    items: [],
    emitido: 0,
    vigente: 0,
  });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [creada, setCreada] = useState<GiftCard | null>(null);
  const [aCancelar, setACancelar] = useState<GiftCard | null>(null);
  const puedeGestionar = puede("ventas.crear");

  const cargar = useCallback(() => {
    setCargando(true);
    setError(null);
    api<typeof data>("/t/monedero/gift-cards")
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar las tarjetas"))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const c = await api<GiftCard>("/t/monedero/gift-cards", { body: { monto } });
      setCreada(c);
      setMonto("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo emitir la tarjeta");
    }
  }

  async function cancelar(c: GiftCard) {
    setACancelar(null);
    try {
      await api(`/t/monedero/gift-cards/${c.id}/cancelar`, { method: "POST" });
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cancelar la tarjeta");
    }
  }

  return (
    <div>
      {!cargando && !error && (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="gx-card">
            <p className="text-slate-500 text-sm">Emitido total</p>
            <p className="font-bold text-2xl text-slate-800">{money(data.emitido)}</p>
          </div>
          <div className="gx-card">
            <p className="text-slate-500 text-sm">Saldo vigente</p>
            <p className="font-bold text-2xl text-brand">{money(data.vigente)}</p>
          </div>
        </div>
      )}

      {puedeGestionar && (
        <form
          onSubmit={crear}
          className="mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-white p-4 shadow-sm"
        >
          <label className="min-w-52 flex-1">
            <span className="gx-label">Emitir tarjeta de regalo (monto MXN)</span>
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
          <button type="submit" className="gx-btn-primary">
            Emitir
          </button>
        </form>
      )}

      {creada && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-ok-light p-4 text-ok">
          <CheckCircle2 size={18} className="shrink-0" />
          <p className="text-sm">
            Tarjeta emitida. Código: <span className="font-mono font-bold">{creada.codigo}</span> ·{" "}
            {money(creada.saldoActual)}
          </p>
        </div>
      )}
      {error && !cargando && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-light p-3 text-danger text-sm">
          <span>{error}</span>
          <button type="button" onClick={cargar} className="gx-btn-danger">
            Reintentar
          </button>
        </div>
      )}

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Código</th>
              <th className="gx-th">Inicial</th>
              <th className="gx-th">Saldo</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td className="gx-td text-slate-400" colSpan={5}>
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && !error && data.items.length === 0 && (
              <tr>
                <td className="gx-td text-slate-400" colSpan={5}>
                  Aún no hay tarjetas.
                </td>
              </tr>
            )}
            {!cargando &&
              data.items.map((c) => (
                <tr key={c.id}>
                  <td className="gx-td font-mono">{c.codigo}</td>
                  <td className="gx-td">{money(c.montoInicial)}</td>
                  <td className="gx-td font-semibold">{money(c.saldoActual)}</td>
                  <td className="gx-td">
                    <span className={STATUS_BADGE[c.status] ?? "gx-badge-info"}>{c.status}</span>
                  </td>
                  <td className="gx-td text-right">
                    {c.status === "activa" && puedeGestionar && (
                      <button
                        type="button"
                        onClick={() => setACancelar(c)}
                        className="gx-btn-danger"
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {aCancelar && (
        <div className="gx-modal-overlay">
          <div className="gx-modal-panel">
            <h2 className="mb-2 font-bold text-lg text-slate-800">Cancelar tarjeta de regalo</h2>
            <p className="mb-4 text-slate-500 text-sm">
              ¿Cancelar la tarjeta {aCancelar.codigo}? Perderá su saldo vigente de{" "}
              {money(aCancelar.saldoActual)}.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setACancelar(null)} className="gx-btn-secondary">
                Volver
              </button>
              <button type="button" onClick={() => cancelar(aCancelar)} className="gx-btn-danger">
                Sí, cancelar tarjeta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface Cliente {
  id: string;
  nombre: string;
}
interface Movimiento {
  id: string;
  tipo: string;
  monto: string;
  saldoResultante: string;
  motivo: string;
  createdAt: string;
}

function MonederoTab() {
  const [buscar, setBuscar] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [sel, setSel] = useState<Cliente | null>(null);
  const [saldo, setSaldo] = useState("0.00");
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [movModal, setMovModal] = useState<"abono" | "cargo" | null>(null);
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [canjeOpen, setCanjeOpen] = useState(false);
  const [codigo, setCodigo] = useState("");
  const puedeGestionar = puede("clientes.fiado_gestionar");

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = buscar.trim() ? `?q=${encodeURIComponent(buscar.trim())}` : "";
      api<Paged<Cliente>>(`/t/clientes${qs}`)
        .then((r) => setClientes(r.items))
        .catch(() => setClientes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [buscar]);

  const cargarMonedero = useCallback((id: string) => {
    setError(null);
    api<{ saldo: string; movimientos: Movimiento[] }>(`/t/monedero/clientes/${id}`)
      .then((r) => {
        setSaldo(r.saldo);
        setMovs(r.movimientos);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar el monedero"));
  }, []);

  function elegir(c: Cliente) {
    setSel(c);
    setMsg(null);
    cargarMonedero(c.id);
  }

  function abrirMov(tipo: "abono" | "cargo") {
    setMonto("");
    setMotivo(tipo === "abono" ? "Abono manual" : "Consumo");
    setModalError(null);
    setMovModal(tipo);
  }

  async function guardarMovimiento(e: FormEvent) {
    e.preventDefault();
    if (!sel || !movModal) return;
    setModalError(null);
    setGuardando(true);
    try {
      await api(`/t/monedero/clientes/${sel.id}/movimiento`, {
        body: { tipo: movModal, monto, motivo: motivo.trim() },
      });
      setMovModal(null);
      cargarMonedero(sel.id);
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : "No se pudo registrar el movimiento");
    } finally {
      setGuardando(false);
    }
  }

  async function canjear(e: FormEvent) {
    e.preventDefault();
    if (!sel) return;
    setModalError(null);
    setGuardando(true);
    try {
      const r = await api<{ abonado: string }>("/t/monedero/gift-cards/canjear", {
        body: { codigo: codigo.trim(), clienteId: sel.id },
      });
      setCanjeOpen(false);
      setCodigo("");
      setMsg(`Se abonaron ${money(r.abonado)} al monedero.`);
      cargarMonedero(sel.id);
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : "No se pudo canjear la tarjeta");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <input
          data-tour="mon-buscar"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar cliente por nombre…"
          className="gx-input mb-3"
        />
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {clientes.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => elegir(c)}
              className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${
                sel?.id === c.id ? "border-brand bg-brand/5" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              {c.nombre}
            </button>
          ))}
          {clientes.length === 0 && <p className="text-slate-400 text-sm">Sin clientes.</p>}
        </div>
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        {!sel ? (
          <p className="text-slate-400 text-sm">Elige un cliente para ver su monedero.</p>
        ) : (
          <>
            <p className="text-slate-500 text-sm">Saldo de {sel.nombre}</p>
            <p className="mb-3 font-bold text-3xl text-brand">{money(saldo)}</p>
            {msg && <p className="mb-2 text-ok text-sm">{msg}</p>}
            {error && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-danger text-sm">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => cargarMonedero(sel.id)}
                  className="gx-btn-danger"
                >
                  Reintentar
                </button>
              </div>
            )}
            {puedeGestionar && (
              <div className="mb-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => abrirMov("abono")} className="gx-btn-primary">
                  Abonar
                </button>
                <button
                  type="button"
                  onClick={() => abrirMov("cargo")}
                  className="gx-btn-secondary"
                >
                  Cobrar
                </button>
                <button
                  type="button"
                  onClick={() => setCanjeOpen(true)}
                  className="gx-btn-secondary"
                >
                  Canjear gift card
                </button>
              </div>
            )}
            <div className="max-h-56 space-y-1 overflow-y-auto text-sm">
              {movs.map((m) => (
                <div key={m.id} className="flex justify-between border-slate-100 border-b py-1">
                  <span className="text-slate-600">{m.motivo}</span>
                  <span className={m.tipo === "abono" ? "text-ok" : "text-danger"}>
                    {m.tipo === "abono" ? "+" : "−"}
                    {money(m.monto)}
                  </span>
                </div>
              ))}
              {movs.length === 0 && !error && <p className="text-slate-400">Sin movimientos.</p>}
            </div>
          </>
        )}
      </section>

      {movModal && (
        <div className="gx-modal-overlay">
          <form onSubmit={guardarMovimiento} className="gx-modal-panel">
            <h2 className="mb-4 font-bold text-lg text-slate-800">
              {movModal === "abono" ? "Abonar al monedero" : "Cobrar del monedero"}
              {sel ? ` — ${sel.nombre}` : ""}
            </h2>
            <label className="mb-3 block">
              <span className="gx-label">Monto (MXN)</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="gx-input"
                required
                // biome-ignore lint/a11y/noAutofocus: foco intencional en el primer campo del modal de abono
                autoFocus
              />
            </label>
            <label className="mb-3 block">
              <span className="gx-label">Motivo</span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="gx-input"
                required
              />
            </label>
            {modalError && <p className="mb-3 text-danger text-sm">{modalError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMovModal(null)} className="gx-btn-secondary">
                Cancelar
              </button>
              <button type="submit" disabled={guardando} className="gx-btn-primary">
                {guardando ? "Guardando…" : movModal === "abono" ? "Abonar" : "Cobrar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {canjeOpen && (
        <div className="gx-modal-overlay">
          <form onSubmit={canjear} className="gx-modal-panel">
            <h2 className="mb-2 font-bold text-lg text-slate-800">Canjear tarjeta de regalo</h2>
            <p className="mb-3 text-slate-500 text-sm">
              Escribe el código de la tarjeta; su saldo se abonará al monedero
              {sel ? ` de ${sel.nombre}` : ""}.
            </p>
            <label className="mb-3 block">
              <span className="gx-label">Código de la tarjeta</span>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="gx-input font-mono"
                placeholder="Ej. GC-XXXX-XXXX"
                required
                // biome-ignore lint/a11y/noAutofocus: foco intencional en el primer campo del modal de canje
                autoFocus
              />
            </label>
            {modalError && <p className="mb-3 text-danger text-sm">{modalError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCanjeOpen(false)}
                className="gx-btn-secondary"
              >
                Cancelar
              </button>
              <button type="submit" disabled={guardando} className="gx-btn-primary">
                {guardando ? "Canjeando…" : "Canjear"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
