import { useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";

interface CfdiConfig {
  rfcEmisor?: string;
  razonSocialEmisor?: string;
  regimenFiscalSat?: string;
  codigoPostalEmisor?: string;
  lugarExpedicion?: string;
  serieDefault?: string;
  facturamaAmbiente?: "sandbox" | "prod";
  correoEmisor?: string | null;
  telefonoEmisor?: string | null;
  autofacturaActiva?: boolean;
  diasAutofactura?: number;
  facturamaApiKeyConfigured?: boolean;
}

export function CfdiPage() {
  const [cfg, setCfg] = useState<CfdiConfig>({ facturamaAmbiente: "sandbox" });
  const [apiKey, setApiKey] = useState("");
  const [configurado, setConfigurado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const puedeConfigurar = puede("cfdi.configurar");

  useEffect(() => {
    api<CfdiConfig>("/t/cfdis/config")
      .then((c) => {
        setCfg(c);
        setConfigurado(Boolean(c.facturamaApiKeyConfigured));
      })
      .catch(() => {
        // 404 = aún sin configurar
        setCfg({ facturamaAmbiente: "sandbox", serieDefault: "A", autofacturaActiva: true });
      });
  }, []);

  async function guardar() {
    setError(null);
    setMsg(null);
    setGuardando(true);
    try {
      await api("/t/cfdis/config", {
        method: "PUT",
        body: {
          rfcEmisor: cfg.rfcEmisor ?? "",
          razonSocialEmisor: cfg.razonSocialEmisor ?? "",
          regimenFiscalSat: cfg.regimenFiscalSat ?? "",
          codigoPostalEmisor: cfg.codigoPostalEmisor ?? "",
          lugarExpedicion: cfg.lugarExpedicion ?? cfg.codigoPostalEmisor ?? "",
          serieDefault: cfg.serieDefault ?? "A",
          facturamaAmbiente: cfg.facturamaAmbiente ?? "sandbox",
          ...(apiKey.trim() ? { facturamaApiKey: apiKey.trim() } : {}),
          ...(cfg.correoEmisor ? { correoEmisor: cfg.correoEmisor } : {}),
          ...(cfg.telefonoEmisor ? { telefonoEmisor: cfg.telefonoEmisor } : {}),
          autofacturaActiva: cfg.autofacturaActiva ?? true,
          diasAutofactura: cfg.diasAutofactura ?? 30,
        },
      });
      setMsg("Configuración de facturación guardada");
      setConfigurado(true);
      setApiKey("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  function campo(label: string, key: keyof CfdiConfig, placeholder = "") {
    return (
      <label className="mb-3 block">
        <span className="mb-1 block font-medium text-slate-700 text-sm">{label}</span>
        <input
          value={(cfg[key] as string | undefined) ?? ""}
          onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}
          placeholder={placeholder}
          disabled={!puedeConfigurar}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </label>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 font-bold text-2xl text-slate-800">Facturación (CFDI)</h1>
      <p className="mb-6 text-slate-500 text-sm">
        Conecta tu cuenta de Facturama (PAC) para timbrar CFDI 4.0. Empieza en{" "}
        <strong>sandbox</strong> para probar sin timbres reales; cambia a producción cuando estés
        listo.
      </p>

      {!puedeConfigurar && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-amber-700 text-sm">
          No tienes permiso para configurar facturación.
        </p>
      )}

      <section className="mb-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-bold text-slate-800">Datos del emisor</h2>
        {campo("RFC del emisor", "rfcEmisor", "XAXX010101000")}
        {campo("Razón social", "razonSocialEmisor")}
        <div className="grid grid-cols-2 gap-3">
          {campo("Régimen fiscal SAT (3 díg.)", "regimenFiscalSat", "601")}
          {campo("Serie", "serieDefault", "A")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {campo("CP del emisor", "codigoPostalEmisor", "44100")}
          {campo("Lugar de expedición (CP)", "lugarExpedicion", "44100")}
        </div>
        {campo("Correo del emisor (opcional)", "correoEmisor")}
      </section>

      <section className="mb-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">Conexión con Facturama</h2>
        <p className="mb-4 text-slate-500 text-sm">
          Pega tu API key de Facturama. En sandbox usa tu llave de pruebas.
        </p>

        <label className="mb-3 block">
          <span className="mb-1 block font-medium text-slate-700 text-sm">Ambiente</span>
          <select
            value={cfg.facturamaAmbiente ?? "sandbox"}
            onChange={(e) =>
              setCfg({ ...cfg, facturamaAmbiente: e.target.value as "sandbox" | "prod" })
            }
            disabled={!puedeConfigurar}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-64"
          >
            <option value="sandbox">Sandbox (pruebas)</option>
            <option value="prod">Producción (timbres reales)</option>
          </select>
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block font-medium text-slate-700 text-sm">
            API key de Facturama{" "}
            {configurado && <span className="text-emerald-600 text-xs">· configurada </span>}
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              configurado ? "•••••••• (déjala vacía para conservarla)" : "Pega tu API key"
            }
            disabled={!puedeConfigurar}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </label>

        <label className="mb-2 flex items-center gap-2 text-slate-700 text-sm">
          <input
            type="checkbox"
            checked={cfg.autofacturaActiva ?? true}
            onChange={(e) => setCfg({ ...cfg, autofacturaActiva: e.target.checked })}
            disabled={!puedeConfigurar}
          />
          Permitir autofacturación pública (el cliente factura su ticket)
        </label>
      </section>

      {puedeConfigurar && (
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar facturación"}
        </button>
      )}
      {msg && <p className="mt-4 text-emerald-600 text-sm">{msg}</p>}
      {error && <p className="mt-4 text-red-600 text-sm">{error}</p>}
    </div>
  );
}
