import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface Invoice {
  id: string;
  invoiceNumber: string | null;
  status: string;
  total: string;
  currency: string;
  attempts: number;
  createdAt: string;
  tenant: { slug: string; name: string } | null;
}

const STATUS: Record<string, string> = {
  draft: "Borrador",
  open: "Abierta",
  paid: "Pagada",
  void: "Anulada",
  uncollectible: "Incobrable",
};

function badge(s: string): string {
  if (s === "paid") return "gx-badge-ok";
  if (s === "void") return "gx-badge";
  if (s === "uncollectible") return "gx-badge-danger";
  if (s === "open") return "gx-badge-warn";
  return "gx-badge-info";
}

export function FacturasPage() {
  const [items, setItems] = useState<Invoice[]>([]);
  const [filtro, setFiltro] = useState("");
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    const qs = filtro ? `?status=${filtro}` : "";
    api<{ items: Invoice[] }>(`/admin/billing-ops/invoices${qs}`)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [filtro]);

  useEffect(() => cargar(), [cargar]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-slate-800">Facturas</h1>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="gx-input w-auto"
        >
          <option value="">Todas</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-4 text-danger text-sm">{error}</p>}

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Folio</th>
              <th className="gx-th">Negocio</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th text-right">Intentos</th>
              <th className="gx-th text-right">Total</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {items.map((inv) => (
              <tr key={inv.id}>
                <td className="gx-td font-medium">{inv.invoiceNumber ?? inv.id.slice(0, 8)}</td>
                <td className="gx-td">{inv.tenant?.name ?? inv.tenant?.slug ?? "—"}</td>
                <td className="gx-td">
                  <span className={badge(inv.status)}>{STATUS[inv.status] ?? inv.status}</span>
                </td>
                <td className="gx-td text-right">{inv.attempts}</td>
                <td className="gx-td text-right font-semibold">
                  ${Number(inv.total).toLocaleString("es-MX")} {inv.currency}
                </td>
                <td className="gx-td text-right">
                  {inv.status !== "paid" && inv.status !== "void" && (
                    <button
                      type="button"
                      onClick={() => setVoiding(inv)}
                      className="font-semibold text-danger text-sm hover:underline"
                    >
                      Anular
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={6}>
                  Sin facturas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {voiding && (
        <VoidModal
          invoice={voiding}
          onClose={() => setVoiding(null)}
          onDone={() => {
            setVoiding(null);
            setError(null);
            cargar();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function VoidModal({
  invoice,
  onClose,
  onDone,
  onError,
}: {
  invoice: Invoice;
  onClose: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function anular() {
    if (motivo.trim().length < 3) {
      setErr("Escribe el motivo (mín. 3 caracteres)");
      return;
    }
    setGuardando(true);
    setErr(null);
    try {
      await api(`/admin/billing-ops/invoices/${invoice.id}/void`, { body: { motivo } });
      onDone();
    } catch (e) {
      const m = e instanceof ApiError ? e.message : "Error";
      setErr(m);
      onError(m);
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">Anular factura</h2>
        <p className="mb-4 text-slate-500 text-sm">
          {invoice.invoiceNumber ?? invoice.id.slice(0, 8)} ·{" "}
          {invoice.tenant?.name ?? invoice.tenant?.slug}
        </p>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo del write-off (queda en auditoría)"
          rows={3}
          className="gx-input mb-4"
        />
        {err && <p className="mb-3 text-danger text-sm">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={anular} disabled={guardando} className="gx-btn-danger">
            {guardando ? "Anulando…" : "Anular factura"}
          </button>
        </div>
      </div>
    </div>
  );
}
