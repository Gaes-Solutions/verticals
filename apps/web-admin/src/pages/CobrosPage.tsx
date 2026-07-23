import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface Cobro {
  id: string;
  token: string;
  concepto: string;
  monto: string;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  status: string;
  createdAt: string;
}
interface ListaCobros {
  items: Cobro[];
  totalCobrado: number;
  pendiente: number;
}

const TIENDA_URL = import.meta.env.VITE_TIENDA_URL ?? "http://localhost:3001";

function urlCobro(token: string): string {
  return `${TIENDA_URL}/cobro/${token}`;
}
function urlWhatsapp(c: Cobro): string {
  const msg = `Hola${c.clienteNombre ? ` ${c.clienteNombre}` : ""}, aquí está tu link de pago por ${money(
    c.monto,
  )} (${c.concepto}): ${urlCobro(c.token)}`;
  const tel = (c.clienteTelefono ?? "").replace(/\D/g, "");
  return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
}
function money(v: string | number): string {
  return `$${Number(v).toFixed(2)}`;
}

const STATUS_BADGE: Record<string, string> = {
  pendiente: "gx-badge-warn",
  pagado: "gx-badge-ok",
  cancelado: "gx-badge-info",
  expirado: "gx-badge-info",
};

export function CobrosPage() {
  const [data, setData] = useState<ListaCobros>({ items: [], totalCobrado: 0, pendiente: 0 });
  const [nuevo, setNuevo] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<ListaCobros>("/t/cobros")
      .then(setData)
      .catch(() => setData({ items: [], totalCobrado: 0, pendiente: 0 }));
  }, []);
  useEffect(() => cargar(), [cargar]);

  function copiar(token: string) {
    navigator.clipboard?.writeText(urlCobro(token)).then(
      () => {
        setCopiado(token);
        setTimeout(() => setCopiado(null), 1500);
      },
      () => undefined,
    );
  }

  async function cancelar(c: Cobro) {
    if (!window.confirm(`¿Cancelar el cobro de ${money(c.monto)}?`)) return;
    await api(`/t/cobros/${c.id}/cancelar`, { method: "POST" }).catch(() => undefined);
    cargar();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Cobros / Links de pago</h1>
          <p className="text-slate-500 text-sm">
            Cobra a distancia: genera un link y mándalo por WhatsApp.
          </p>
        </div>
        <button
          type="button"
          data-tour="cobro-nuevo"
          onClick={() => setNuevo(true)}
          className="gx-btn-primary"
        >
          + Nuevo cobro
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div className="gx-card">
          <p className="text-slate-500 text-sm">Cobrado</p>
          <p className="font-bold text-2xl text-brand">{money(data.totalCobrado)}</p>
        </div>
        <div className="gx-card">
          <p className="text-slate-500 text-sm">Pendiente</p>
          <p className="font-bold text-2xl text-slate-800">{money(data.pendiente)}</p>
        </div>
      </div>

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Concepto</th>
              <th className="gx-th">Cliente</th>
              <th className="gx-th">Monto</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td className="gx-td text-slate-400" colSpan={5}>
                  Aún no hay cobros. Crea el primero con “+ Nuevo cobro”.
                </td>
              </tr>
            ) : (
              data.items.map((c) => (
                <tr key={c.id}>
                  <td className="gx-td font-medium">{c.concepto}</td>
                  <td className="gx-td text-slate-500">{c.clienteNombre ?? "—"}</td>
                  <td className="gx-td font-semibold">{money(c.monto)}</td>
                  <td className="gx-td">
                    <span className={STATUS_BADGE[c.status] ?? "gx-badge-info"}>{c.status}</span>
                  </td>
                  <td className="gx-td">
                    {c.status === "pendiente" && (
                      <div className="flex flex-wrap justify-end gap-2 text-sm">
                        <button
                          type="button"
                          onClick={() => copiar(c.token)}
                          className="text-slate-500 hover:underline"
                        >
                          {copiado === c.token ? "✓ Copiado" : "Copiar link"}
                        </button>
                        <a
                          href={urlWhatsapp(c)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-green-600 hover:underline"
                        >
                          WhatsApp
                        </a>
                        <button
                          type="button"
                          onClick={() => cancelar(c)}
                          className="text-red-500 hover:underline"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nuevo && (
        <NuevoCobroModal
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

function NuevoCobroModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [creado, setCreado] = useState<Cobro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const c = await api<Cobro>("/t/cobros", {
        body: {
          concepto,
          monto,
          ...(clienteNombre ? { clienteNombre } : {}),
          ...(clienteTelefono ? { clienteTelefono } : {}),
        },
      });
      setCreado(c);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear el cobro");
      setGuardando(false);
    }
  }

  if (creado) {
    return (
      <div className="gx-modal-overlay">
        <div className="gx-modal-panel">
          <h2 className="mb-1 font-bold text-lg text-slate-800">✅ Cobro creado</h2>
          <p className="mb-3 text-slate-500 text-sm">
            Comparte este link con tu cliente por WhatsApp para que pague.
          </p>
          <div className="mb-3 break-all rounded-lg bg-slate-50 p-3 font-mono text-slate-700 text-sm">
            {urlCobro(creado.token)}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(urlCobro(creado.token))}
              className="gx-btn-secondary"
            >
              Copiar link
            </button>
            <a
              href={urlWhatsapp(creado)}
              target="_blank"
              rel="noopener noreferrer"
              className="gx-btn-primary"
            >
              Enviar por WhatsApp
            </a>
            <button type="button" onClick={onDone} className="gx-btn-ghost">
              Listo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gx-modal-overlay">
      <form onSubmit={guardar} className="gx-modal-panel">
        <h2 className="mb-4 font-bold text-lg text-slate-800">Nuevo cobro</h2>
        <label className="mb-3 block">
          <span className="gx-label">Concepto</span>
          <input
            data-tour="cobro-f-concepto"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            className="gx-input"
            placeholder="Anticipo pedido / Servicio…"
            required
          />
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Monto (MXN)</span>
          <input
            type="number"
            min="1"
            step="0.01"
            data-tour="cobro-f-monto"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="gx-input"
            required
          />
        </label>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="gx-label">Cliente (opcional)</span>
            <input
              value={clienteNombre}
              onChange={(e) => setClienteNombre(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">WhatsApp (opcional)</span>
            <input
              value={clienteTelefono}
              onChange={(e) => setClienteTelefono(e.target.value)}
              className="gx-input"
              placeholder="5213312345678"
            />
          </label>
        </div>
        {error && <p className="mb-3 text-danger text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button
            type="submit"
            data-tour="cobro-f-crear"
            disabled={guardando}
            className="gx-btn-primary"
          >
            {guardando ? "Creando…" : "Crear cobro"}
          </button>
        </div>
      </form>
    </div>
  );
}
