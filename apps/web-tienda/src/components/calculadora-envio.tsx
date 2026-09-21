"use client";

import { Truck } from "lucide-react";
import { type FormEvent, useState } from "react";

interface Opcion {
  nombrePublico: string;
  costo: string;
  gratis: boolean;
  diasEntregaEstimados: number | null;
}

/** "¿Cuándo llega?" — cotiza envío por CP+estado desde la página de producto (estilo ML). */
export function CalculadoraEnvio({ subtotal }: { subtotal: number }) {
  const [cp, setCp] = useState("");
  const [estado, setEstado] = useState("");
  const [opciones, setOpciones] = useState<Opcion[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cotizar(e: FormEvent) {
    e.preventDefault();
    if (cp.length !== 5) {
      setError("Ingresa un CP de 5 dígitos");
      return;
    }
    setCargando(true);
    setError(null);
    setOpciones(null);
    try {
      const params = new URLSearchParams({ cp, subtotal: String(subtotal) });
      if (estado.trim()) params.set("estado", estado.trim());
      const res = await fetch(`/api/envios?${params.toString()}`);
      if (!res.ok) throw new Error("Cotización no disponible");
      const data = (await res.json()) as { opcionesEnvio?: Opcion[] };
      if (!Array.isArray(data.opcionesEnvio)) throw new Error("Cotización inválida");
      setOpciones(data.opcionesEnvio ?? []);
    } catch {
      setError("No se pudo calcular el envío");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="mb-2 flex items-center gap-1.5 font-medium text-slate-700 text-sm">
        <Truck size={16} strokeWidth={2} /> ¿Cuándo llega?
      </p>
      <form onSubmit={cotizar} className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="gx-label">Código postal</span>
          <input
            value={cp}
            onChange={(e) => setCp(e.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            className="gx-input w-36"
          />
        </label>
        <label className="block">
          <span className="gx-label">Estado</span>
          <input
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="gx-input w-32"
          />
        </label>
        <button type="submit" disabled={cargando} className="gx-btn-primary">
          {cargando ? "…" : "Calcular"}
        </button>
      </form>
      {error && <p className="mt-2 text-danger text-sm">{error}</p>}
      {opciones && opciones.length === 0 && (
        <p className="mt-2 text-slate-500 text-sm">
          No tenemos cobertura a esa zona por ahora. Verifica el CP y estado.
        </p>
      )}
      {opciones && opciones.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {opciones.map((o) => (
            <li key={o.nombrePublico} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">
                {o.nombrePublico}
                {o.diasEntregaEstimados ? ` · ${o.diasEntregaEstimados} días` : ""}
              </span>
              <span className={o.gratis ? "font-semibold text-ok" : "font-medium"}>
                {o.gratis ? "Gratis" : `$${Number(o.costo).toFixed(2)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
