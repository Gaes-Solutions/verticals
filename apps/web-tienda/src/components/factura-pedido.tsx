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
      <div className="rounded-lg border bg-white p-4 text-sm">
        <p className="font-medium">Factura emitida ✓</p>
        <p className="text-gray-500">Folio fiscal: {estado.folioFiscal}</p>
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
        <span className="mb-1 block font-medium text-sm">{label}</span>
        <input
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full rounded border px-3 py-2 text-sm"
          required={key !== "correoReceptor"}
        />
      </label>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 text-sm hover:border-marca hover:text-marca"
      >
        🧾 Solicitar factura
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={emitir}
            className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-xl bg-white p-6"
          >
            <div className="flex items-start justify-between">
              <h2 className="font-bold text-lg">Datos de facturación</h2>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="text-gray-400 hover:text-gray-600"
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
              <span className="mb-1 block font-medium text-sm">Uso de CFDI</span>
              <select
                value={form.usoCfdi}
                onChange={(e) => setForm((f) => ({ ...f, usoCfdi: e.target.value }))}
                className="w-full rounded border px-3 py-2 text-sm"
              >
                {USO_CFDI.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-sm">Forma de pago</span>
              <select
                value={form.formaPago}
                onChange={(e) => setForm((f) => ({ ...f, formaPago: e.target.value }))}
                className="w-full rounded border px-3 py-2 text-sm"
              >
                {FORMA_PAGO.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {campo("Correo (opcional)", "correoReceptor")}
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={enviando}
              className="w-full rounded-lg bg-marca py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {enviando ? "Generando…" : "Generar factura"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
