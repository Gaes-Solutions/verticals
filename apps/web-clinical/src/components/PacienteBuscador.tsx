import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export interface PacienteLite {
  id: string;
  nombre: string;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  numeroExpediente: string;
  fechaNacimiento?: string | null;
}

export function nombrePaciente(p: {
  nombre: string;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
}): string {
  return [p.nombre, p.apellidoPaterno, p.apellidoMaterno].filter(Boolean).join(" ");
}

/** Buscador reutilizable de paciente humano por nombre/CURP/expediente/teléfono. */
export function PacienteBuscador({
  onSelect,
  placeholder = "Buscar paciente por nombre, CURP o expediente…",
}: {
  onSelect: (p: PacienteLite) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PacienteLite[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ items: PacienteLite[] }>(`/t/pacientes?pageSize=8&q=${encodeURIComponent(q.trim())}`)
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
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-800">{nombrePaciente(p)}</span>
              <span className="text-slate-400 text-xs">{p.numeroExpediente}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
