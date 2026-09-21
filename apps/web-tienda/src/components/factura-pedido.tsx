"use client";

import { type FormEvent, useEffect, useState } from "react";

interface FacturaEstado {
  folioFiscal: string | null;
  estado: string;
  disponible: boolean;
}

const USO_CFDI = [
  { value: "G03", label: "G03 · Gastos en general" },
  { value: "G01", label: "G01 · Adquisición de mercancías" },
  { value: "I01", label: "I01 · Construcciones" },
  { value: "S01", label: "S01 · Sin efectos fiscales" },
];
const FORMA_PAGO = [
  { value: "04", label: "Tarjeta de crédito" },
  { value: "28", label: "Tarjeta de débito" },
  { value: "03", label: "Transferencia" },
  { value: "01", label: "Efectivo" },
];

/** Facturación CFDI self-service desde la cuenta del cliente. */
export function FacturaPedido({ folio }: { folio: string }) {
  const [estado, setEstado] = useState<FacturaEstado | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    rfcReceptor: "",
    razonSocialReceptor: "",
    codigoPostalReceptor: "",
    regimenFiscalReceptor: "612",
    usoCfdi: "G03",
    formaPago: "04",
    correoReceptor: "",
  });

  useEffect(() => {
    fetch(`/api/cuenta/pedidos/${folio}/factura`).then(async (res) => {
      if (res.ok) setEstado((await res.json().catch(() => null)) as FacturaEstado | null);
    });
  }, [folio]);

  async function emitir(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/cuenta/pedidos/${folio}/factura`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        rfcReceptor: form.rfcReceptor.toUpperCase(),
        correoReceptor: form.correoReceptor || undefined,
      }),
    });
    setEnviando(false);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { message?: string };
      setError(d.message ?? "No se pudo generar la factura");
      return;
    }
    const r = (await res.json()) as { folioFiscal: string };
    setEstado({ folioFiscal: r.folioFiscal, estado: "vigente", disponible: true });
    setAbierto(false);
  }

  if (estado?.folioFiscal) {
    return (
      <div className="gx-card !p-4 text-sm">
        <p className="font-medium">Factura emitida ✓</p>
        <p className="text-slate-500">Folio fiscal: {estado.folioFiscal}</p>
        {estado.disponible && (
          <a
            href={`/api/cuenta/pedidos/${folio}/factura/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block font-medium text-marca hover:underline"
          >
            Descargar PDF
          </a>
        )}
      </div>
    );
  }

  function campo(label: string, key: keyof typeof form, placeholder = "") {
    return (
      <label className="block">
        <span className="gx-label">{label}</span>
        <input
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="gx-input"
          required={key !== "correoReceptor"}
        />
      </label>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="gx-btn-secondary">
        🧾 Solicitar factura
      </button>

      {abierto && (
        <div className="gx-modal-overlay">
          <form onSubmit={emitir} className="gx-modal-panel space-y-3">
            <div className="flex items-start justify-between">
              <h2 className="font-bold text-lg">Datos de facturación</h2>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="gx-btn-ghost !px-2"
              >
                ✕
              </button>
            </div>
            {campo("RFC", "rfcReceptor", "XAXX010101000")}
            {campo("Razón social", "razonSocialReceptor")}
            <div className="grid grid-cols-2 gap-3">
              {campo("CP fiscal", "codigoPostalReceptor", "44100")}
              {campo("Régimen fiscal (3 díg.)", "regimenFiscalReceptor", "612")}
            </div>
            <label className="block">
              <span className="gx-label">Uso de CFDI</span>
              <select
                value={form.usoCfdi}
                onChange={(e) => setForm((f) => ({ ...f, usoCfdi: e.target.value }))}
                className="gx-input"
              >
                {USO_CFDI.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="gx-label">Forma de pago</span>
              <select
                value={form.formaPago}
                onChange={(e) => setForm((f) => ({ ...f, formaPago: e.target.value }))}
                className="gx-input"
              >
                {FORMA_PAGO.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {campo("Correo (opcional)", "correoReceptor")}
            {error && <p className="text-danger text-sm">{error}</p>}
            <button type="submit" disabled={enviando} className="gx-btn-primary w-full">
              {enviando ? "Generando…" : "Generar factura"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
