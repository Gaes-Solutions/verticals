import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";
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
  const [monto, setMonto] = useState("");
  const [creada, setCreada] = useState<GiftCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<typeof data>("/t/monedero/gift-cards")
      .then(setData)
      .catch(() => undefined);
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
      setError(err instanceof ApiError ? err.message : "Error");
    }
  }

  async function cancelar(c: GiftCard) {
    if (!window.confirm(`¿Cancelar la tarjeta ${c.codigo}?`)) return;
    await api(`/t/monedero/gift-cards/${c.id}/cancelar`, { method: "POST" }).catch(() => undefined);
    cargar();
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div className="gx-card">
          <p className="text-slate-500 text-sm">Emitido total</p>
          <p className="font-bold text-2xl text-slate-800">{money(data.emitido)}</p>
        </div>
        <div className="gx-card">
          <p className="text-slate-500 text-sm">Saldo vigente</p>
          <p className="font-bold text-2xl text-brand">{money(data.vigente)}</p>
        </div>
      </div>

      <form
        onSubmit={crear}
        className="mb-4 flex items-end gap-2 rounded-xl bg-white p-4 shadow-sm"
      >
        <label className="flex-1">
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

      {creada && (
        <div className="mb-4 rounded-lg bg-green-50 p-4 text-green-800">
          ✅ Tarjeta emitida. Código: <span className="font-mono font-bold">{creada.codigo}</span> ·{" "}
          {money(creada.saldoActual)}
        </div>
      )}
      {error && <p className="mb-3 text-danger text-sm">{error}</p>}

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
            {data.items.length === 0 ? (
              <tr>
                <td className="gx-td text-slate-400" colSpan={5}>
                  Aún no hay tarjetas.
                </td>
              </tr>
            ) : (
              data.items.map((c) => (
                <tr key={c.id}>
                  <td className="gx-td font-mono">{c.codigo}</td>
                  <td className="gx-td">{money(c.montoInicial)}</td>
                  <td className="gx-td font-semibold">{money(c.saldoActual)}</td>
                  <td className="gx-td">
                    <span className={STATUS_BADGE[c.status] ?? "gx-badge-info"}>{c.status}</span>
                  </td>
                  <td className="gx-td text-right">
                    {c.status === "activa" && (
                      <button
                        type="button"
                        onClick={() => cancelar(c)}
                        className="text-red-500 text-sm hover:underline"
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
    api<{ saldo: string; movimientos: Movimiento[] }>(`/t/monedero/clientes/${id}`)
      .then((r) => {
        setSaldo(r.saldo);
        setMovs(r.movimientos);
      })
      .catch(() => undefined);
  }, []);

  function elegir(c: Cliente) {
    setSel(c);
    setMsg(null);
    cargarMonedero(c.id);
  }

  async function movimiento(tipo: "abono" | "cargo") {
    if (!sel) return;
    const monto = window.prompt(`${tipo === "abono" ? "Abonar" : "Cobrar del"} monedero — monto:`);
    if (!monto) return;
    const motivo = window.prompt("Motivo:") ?? (tipo === "abono" ? "Abono manual" : "Consumo");
    try {
      await api(`/t/monedero/clientes/${sel.id}/movimiento`, { body: { tipo, monto, motivo } });
      cargarMonedero(sel.id);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Error");
    }
  }

  async function canjear() {
    if (!sel) return;
    const codigo = window.prompt("Código de la tarjeta de regalo a canjear:");
    if (!codigo) return;
    try {
      const r = await api<{ abonado: string }>("/t/monedero/gift-cards/canjear", {
        body: { codigo, clienteId: sel.id },
      });
      setMsg(`Se abonaron ${money(r.abonado)} al monedero.`);
      cargarMonedero(sel.id);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Error al canjear");
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
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
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
            {msg && <p className="mb-2 text-green-700 text-sm">{msg}</p>}
            <div className="mb-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => movimiento("abono")} className="gx-btn-primary">
                Abonar
              </button>
              <button
                type="button"
                onClick={() => movimiento("cargo")}
                className="gx-btn-secondary"
              >
                Cobrar
              </button>
              <button type="button" onClick={canjear} className="gx-btn-secondary">
                Canjear gift card
              </button>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto text-sm">
              {movs.map((m) => (
                <div key={m.id} className="flex justify-between border-slate-100 border-b py-1">
                  <span className="text-slate-600">{m.motivo}</span>
                  <span className={m.tipo === "abono" ? "text-green-600" : "text-red-500"}>
                    {m.tipo === "abono" ? "+" : "−"}
                    {money(m.monto)}
                  </span>
                </div>
              ))}
              {movs.length === 0 && <p className="text-slate-400">Sin movimientos.</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
