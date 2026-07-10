import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export interface MascotaLite {
  id: string;
  nombre: string;
  especie: string;
  raza?: string | null;
  numeroExpediente: string;
}

/** Buscador reutilizable de mascota (paciente veterinario) por nombre/microchip/raza. */
export function MascotaBuscador({
  onSelect,
  placeholder = "Buscar paciente por nombre, microchip o raza…",
}: {
  onSelect: (m: MascotaLite) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MascotaLite[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ items: MascotaLite[] }>(`/t/mascotas?pageSize=8&q=${encodeURIComponent(q.trim())}`)
        .then((r) => setItems(r.items ?? []))
        .catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
      />
      {items.length > 0 && (
        <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-800">{m.nombre}</span>
              <span className="text-slate-400 text-xs capitalize">
                {m.especie} · {m.numeroExpediente}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
