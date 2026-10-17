"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { DialogoTienda } from "./dialogo-tienda";

import { type FacturaEstado, esEstadoFactura, esFacturaEmitida } from "@/lib/factura-contract";

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

async function leerEstado(ruta: string, signal?: AbortSignal) {
  const res = await fetch(ruta, {
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
  });
  if (res.status === 401)
    throw new Error("Tu sesión venció. Inicia sesión en otra pestaña y vuelve a consultar.");
  if (!res.ok) throw new Error("No pudimos consultar tu factura. Vuelve a consultar su estado.");
  const data = await res.json();
  if (!esEstadoFactura(data)) throw new Error("Invalid invoice state");
  return data;
}

function mensajeError(data: { message?: unknown } | null) {
  return typeof data?.message === "string"
    ? data.message
    : "No se pudo generar la factura. Consulta su estado antes de reintentar.";
}

function requiereConsulta(status: number) {
  return status >= 500 || status === 409;
}

function tituloFactura(estado: string) {
  return ["cancelado", "cancelada"].includes(estado) ? "Factura cancelada" : "Factura emitida ✓";
}

async function enviarSolicitud(ruta: string, form: Record<string, string>) {
  const res = await fetch(ruta, {
    method: "POST",
    signal: AbortSignal.timeout(65_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...form,
      rfcReceptor: form.rfcReceptor.trim().toUpperCase(),
      correoReceptor: form.correoReceptor.trim() || undefined,
    }),
  });
  return { res, data: await res.json().catch(() => null) };
}

/** Facturación CFDI self-service desde la cuenta del cliente. */
export function FacturaPedido({ folio }: { folio: string }) {
  const [estado, setEstado] = useState<FacturaEstado | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const ocupado = useRef(false);
  const [consultado, setConsultado] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [incierta, setIncierta] = useState(false);
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null);
  const ruta = `/api/cuenta/pedidos/${encodeURIComponent(folio)}/factura`;
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

  const consultarEstado = useCallback(
    async (signal?: AbortSignal) => {
      setConsultando(true);
      setErrorConsulta(null);
      try {
        const data = await leerEstado(ruta, signal);
        if (signal?.aborted) return;
        setEstado((prev) => (data === null && prev?.folioFiscal ? prev : data));
        setConsultado(true);
        setIncierta(false);
        setError(null);
      } catch (err) {
        if (!signal?.aborted)
          setErrorConsulta(
            err instanceof Error && err.message.startsWith("Tu sesión")
              ? err.message
              : "No pudimos consultar tu factura. Vuelve a consultar su estado.",
          );
      } finally {
        if (!signal?.aborted) setConsultando(false);
      }
    },
    [ruta],
  );

  useEffect(() => {
    const controller = new AbortController();
    void consultarEstado(controller.signal);
    return () => controller.abort();
  }, [consultarEstado]);

  const bloquearEnvio = incierta || consultando || !consultado;

  async function emitir(e: FormEvent) {
    e.preventDefault();
    if (ocupado.current || bloquearEnvio) return;
    ocupado.current = true;
    setEnviando(true);
    setError(null);
    try {
      const { res, data } = await enviarSolicitud(ruta, form);
      if (res.status === 401) {
        setError("Tu sesión venció. Inicia sesión en otra pestaña; conservamos tus datos aquí.");
        return;
      }
      if (!res.ok) {
        setIncierta(requiereConsulta(res.status));
        setError(mensajeError(data));
        return;
      }
      if (!esFacturaEmitida(data)) throw new Error("unconfirmed");
      setEstado({ folioFiscal: data.folioFiscal, estado: "vigente", disponible: false });
      setAbierto(false);
      await consultarEstado();
    } catch {
      setIncierta(true);
      setError(
        "No pudimos confirmar la factura. Consulta su estado antes de volver a solicitarla; conservamos tus datos.",
      );
    } finally {
      ocupado.current = false;
      setEnviando(false);
    }
  }

  const consulta = (
    <div className="text-sm">
      {errorConsulta && (
        <p role="alert" className="mb-2 text-danger">
          {errorConsulta}
        </p>
      )}
      <button
        type="button"
        disabled={consultando || enviando}
        onClick={() => void consultarEstado()}
        className="gx-btn-secondary min-h-11"
      >
        {consultando ? "Consultando factura…" : "Consultar estado de factura"}
      </button>
    </div>
  );

  if (!consultado) return consulta;

  if (estado?.folioFiscal) {
    return (
      <div className="gx-card !p-4 text-sm">
        <p className="font-medium">{tituloFactura(estado.estado)}</p>
        <p className="text-slate-500">Folio fiscal: {estado.folioFiscal}</p>
        {estado.disponible && (
          <a
            href={`${ruta}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block font-medium text-marca hover:underline"
          >
            Descargar PDF
          </a>
        )}
        <div className="mt-3">{consulta}</div>
      </div>
    );
  }

  function campo(label: string, key: keyof typeof form, placeholder = "") {
    return (
      <label className="block">
        <span className="gx-label">{label}</span>
        <input
          type={key === "correoReceptor" ? "email" : "text"}
          inputMode={
            key === "codigoPostalReceptor" || key === "regimenFiscalReceptor"
              ? "numeric"
              : undefined
          }
          maxLength={
            key === "codigoPostalReceptor" ? 5 : key === "regimenFiscalReceptor" ? 3 : undefined
          }
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="gx-input min-h-11"
          required={key !== "correoReceptor"}
        />
      </label>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="gx-btn-secondary min-h-11">
        🧾 Solicitar factura
      </button>

      {!abierto && errorConsulta && consulta}
      {abierto && (
        <DialogoTienda
          titulo="Datos de facturación"
          bloqueado={enviando}
          onCerrar={() => setAbierto(false)}
        >
          <form onSubmit={emitir} className="space-y-3">
            <fieldset disabled={enviando} className="space-y-3">
              {campo("RFC", "rfcReceptor", "XAXX010101000")}
              {campo("Razón social", "razonSocialReceptor")}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {campo("CP fiscal", "codigoPostalReceptor", "44100")}
                {campo("Régimen fiscal (3 díg.)", "regimenFiscalReceptor", "612")}
              </div>
              <label className="block">
                <span className="gx-label">Uso de CFDI</span>
                <select
                  value={form.usoCfdi}
                  onChange={(e) => setForm((f) => ({ ...f, usoCfdi: e.target.value }))}
                  className="gx-input min-h-11"
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
                  className="gx-input min-h-11"
                >
                  {FORMA_PAGO.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {campo("Correo (opcional)", "correoReceptor")}
            </fieldset>
            {error && (
              <p role="alert" className="text-danger text-sm">
                {error}
              </p>
            )}
            {(incierta || errorConsulta) && consulta}
            <button
              type="submit"
              disabled={enviando || incierta || consultando}
              className="gx-btn-primary min-h-12 w-full"
            >
              {enviando ? "Generando…" : "Generar factura"}
            </button>
          </form>
        </DialogoTienda>
      )}
    </>
  );
}
