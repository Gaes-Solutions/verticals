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
      const data = (await res.json()) as { opcionesEnvio?: Opcion[] };
      setOpciones(data.opcionesEnvio ?? []);
    } catch {
      setError("No se pudo calcular el envío");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="mb-2 flex items-center gap-1.5 font-medium text-gray-700 text-sm">
        <Truck size={16} strokeWidth={2} /> ¿Cuándo llega?
      </p>
      <form onSubmit={cotizar} className="flex flex-wrap gap-2">
        <input
          value={cp}
          onChange={(e) => setCp(e.target.value.replace(/\D/g, "").slice(0, 5))}
          inputMode="numeric"
          placeholder="Tu código postal"
          className="w-36 rounded border px-3 py-2 text-sm"
        />
        <input
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          placeholder="Estado"
          className="w-32 rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={cargando}
          className="rounded bg-marca px-4 py-2 font-medium text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          {cargando ? "…" : "Calcular"}
        </button>
      </form>
      {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
      {opciones && opciones.length === 0 && (
        <p className="mt-2 text-gray-500 text-sm">
          No tenemos cobertura a esa zona por ahora. Verifica el CP y estado.
        </p>
      )}
      {opciones && opciones.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {opciones.map((o) => (
            <li key={o.nombrePublico} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">
                {o.nombrePublico}
                {o.diasEntregaEstimados ? ` · ${o.diasEntregaEstimados} días` : ""}
              </span>
              <span className={o.gratis ? "font-semibold text-emerald-600" : "font-medium"}>
                {o.gratis ? "Gratis" : `$${Number(o.costo).toFixed(2)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
