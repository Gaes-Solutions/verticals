import { useEffect, useState } from "react";
import { api, puede } from "../lib/api.js";
import { nombrePaciente } from "./PacienteBuscador.js";

// Sujeto de atención unificado: mascota (vet) o paciente humano. Los flujos
// clínicos (SOAP, receta) lo usan para pasar mascotaId o pacienteId y elegir la
// vertical del catálogo (vet/humano) sin duplicar pantallas.
export interface Sujeto {
  tipo: "mascota" | "paciente";
  id: string;
  nombre: string;
  subtitulo: string;
  numeroExpediente: string;
}

interface MascotaRow {
  id: string;
  nombre: string;
  especie: string;
  numeroExpediente: string;
}
interface PacienteRow {
  id: string;
  nombre: string;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  numeroExpediente: string;
}

async function buscarMascotas(q: string): Promise<Sujeto[]> {
  if (!puede("mascotas.leer")) return [];
  const r = await api<{ items: MascotaRow[] }>(
    `/t/mascotas?pageSize=6&q=${encodeURIComponent(q)}`,
  ).catch(() => ({ items: [] as MascotaRow[] }));
  return (r.items ?? []).map((m) => ({
    tipo: "mascota" as const,
    id: m.id,
    nombre: m.nombre,
    subtitulo: m.especie,
    numeroExpediente: m.numeroExpediente,
  }));
}

async function buscarPacientes(q: string): Promise<Sujeto[]> {
  if (!puede("pacientes.leer")) return [];
  const r = await api<{ items: PacienteRow[] }>(
    `/t/pacientes?pageSize=6&q=${encodeURIComponent(q)}`,
  ).catch(() => ({ items: [] as PacienteRow[] }));
  return (r.items ?? []).map((p) => ({
    tipo: "paciente" as const,
    id: p.id,
    nombre: nombrePaciente(p),
    subtitulo: "Paciente",
    numeroExpediente: p.numeroExpediente,
  }));
}

/** Buscador unificado mascota (🐾) / paciente humano (👤). */
export function SujetoBuscador({ onSelect }: { onSelect: (s: Sujeto) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Sujeto[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const t = setTimeout(async () => {
      const [ms, ps] = await Promise.all([buscarMascotas(q.trim()), buscarPacientes(q.trim())]);
      setItems([...ps, ...ms]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar paciente o mascota por nombre / expediente…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
      />
      <div className="mt-2 flex flex-col gap-1">
        {items.map((s) => (
          <button
            key={`${s.tipo}:${s.id}`}
            type="button"
            onClick={() => onSelect(s)}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            <span className="font-medium text-slate-800">
              {s.tipo === "mascota" ? "🐾" : "👤"} {s.nombre}
            </span>
            <span className="text-slate-400 text-xs capitalize">
              {s.subtitulo} · {s.numeroExpediente}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
