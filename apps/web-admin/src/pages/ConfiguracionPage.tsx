import { Percent } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";

interface ConfigVentas {
  descuentoMaximoPct: number;
  recomendado: number;
}

export function ConfiguracionPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-bold text-2xl text-slate-800">Configuración</h1>
        <p className="text-slate-500 text-sm">Ajustes del negocio. Todo configurable por ti.</p>
      </div>
      <TopeDescuento />
    </div>
  );
}

function TopeDescuento() {
  const [cfg, setCfg] = useState<ConfigVentas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const editable = puede("configuracion.actualizar");

  const cargar = useCallback(() => {
    setCargando(true);
    setError(null);
    api<ConfigVentas>("/t/config-ventas")
      .then((c) => {
        setCfg(c);
        setValor(String(c.descuentoMaximoPct));
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar la configuración"))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const saved = await api<ConfigVentas>("/t/config-ventas", {
        method: "PUT",
        body: { descuentoMaximoPct: Number(valor) },
      });
      setCfg(saved);
      setValor(String(saved.descuentoMaximoPct));
      setGuardado(true);
      setTimeout(() => setGuardado(false), 1500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <section className="rounded-xl border bg-white p-6">
        <p className="text-slate-400 text-sm">Cargando…</p>
      </section>
    );
  }
  if (!cfg) {
    return (
      <section className="rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 text-danger text-sm">
          <span>{error ?? "No se pudo cargar la configuración"}</span>
          <button type="button" onClick={cargar} className="gx-btn-danger">
            Reintentar
          </button>
        </div>
      </section>
    );
  }
  const num = Number(valor);
  const valido = Number.isFinite(num) && num >= 0 && num <= 100;
  const sinTope = num >= 100;

  return (
    <section className="rounded-xl border bg-white p-6">
      <div className="mb-1 flex items-center gap-2">
        <Percent size={18} className="text-brand" />
        <h2 className="font-bold text-lg text-slate-800">Tope de descuento manual</h2>
      </div>
      <p className="mb-4 text-slate-500 text-sm">
        Máximo de descuento que un cajero puede aplicar en una venta. Los roles con permiso de{" "}
        <span className="font-medium">descuento alto</span> (y el dueño) pueden sobrepasarlo.
      </p>

      <label className="mb-2 block max-w-[220px]">
        <span className="gx-label">Descuento máximo (%)</span>
        <input
          data-tour="cfg-tope"
          type="number"
          min="0"
          max="100"
          step="1"
          value={valor}
          disabled={!editable}
          onChange={(e) => setValor(e.target.value)}
          className="gx-input disabled:bg-slate-50 disabled:text-slate-500"
        />
      </label>
      <p className="mb-4 text-slate-400 text-xs">
        Recomendado: <span className="font-medium text-slate-500">{cfg.recomendado}%</span> ·{" "}
        {sinTope ? "100% = sin tope (cualquier descuento permitido)" : "100 = sin tope"}
      </p>

      {error && <p className="mb-3 text-danger text-sm">{error}</p>}
      {editable && (
        <button
          type="button"
          data-tour="cfg-guardar"
          onClick={guardar}
          disabled={guardando || !valido}
          className="gx-btn-primary"
        >
          {guardado ? "Guardado" : guardando ? "Guardando…" : "Guardar"}
        </button>
      )}
    </section>
  );
}
