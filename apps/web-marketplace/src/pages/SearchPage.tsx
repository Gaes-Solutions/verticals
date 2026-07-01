import { BadgeCheck, Search, Star, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { navegar } from "../App.js";
import { api } from "../lib/api.js";

export const TIPO_LABEL: Record<string, string> = {
  medico_humano: "Médico",
  veterinario: "Veterinario",
  dentista: "Dentista",
  nutriologo: "Nutriólogo",
  psicologo: "Psicólogo",
};

interface Profesional {
  id: string;
  slugSeo: string;
  nombrePublico: string;
  tipo: string;
  especialidades: string[];
  fotoPerfilUrl?: string | null;
  bioCorta?: string | null;
  scorePromedio: string;
  totalResenas: number;
  validadaSsaAt?: string | null;
  aceptaTelemedicina: boolean;
}

export function Estrellas({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500">
      <Star size={15} fill="currentColor" />
      <span className="font-semibold text-slate-700 text-sm">{score.toFixed(1)}</span>
    </span>
  );
}

export function SearchPage() {
  const [q, setQ] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [soloTele, setSoloTele] = useState(false);
  const [items, setItems] = useState<Profesional[]>([]);
  const [cargando, setCargando] = useState(true);

  const buscar = useCallback(() => {
    setCargando(true);
    const p = new URLSearchParams({ pageSize: "24" });
    if (q.trim()) p.set("q", q.trim());
    if (ciudad.trim()) p.set("ciudad", ciudad.trim());
    if (soloTele) p.set("aceptaTelemedicina", "true");
    api<{ items: Profesional[] }>(`/marketplace/buscar?${p.toString()}`)
      .then((r) => setItems(r.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  }, [q, ciudad, soloTele]);
  useEffect(() => {
    const t = setTimeout(buscar, 250);
    return () => clearTimeout(t);
  }, [buscar]);

  return (
    <div>
      <div className="mb-6 rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-6 text-white shadow-sm sm:p-8">
        <h1 className="font-bold text-2xl sm:text-3xl">
          Encuentra a tu especialista y agenda en línea
        </h1>
        <p className="mt-1 text-white/80 text-sm">
          Médicos y veterinarios verificados. Reserva tu cita en minutos.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <div className="relative">
            <Search size={18} className="absolute top-3 left-3 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Especialidad, nombre o padecimiento…"
              className="w-full rounded-lg border-0 py-2.5 pr-3 pl-10 text-slate-800 focus:outline-none focus:ring-2 focus:ring-white/60"
            />
          </div>
          <input
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            placeholder="Ciudad"
            className="rounded-lg border-0 px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-white/60"
          />
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/15 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={soloTele}
              onChange={(e) => setSoloTele(e.target.checked)}
              className="h-4 w-4 accent-white"
            />
            <Video size={16} /> Telemedicina
          </label>
        </div>
      </div>

      {cargando ? (
        <p className="text-slate-400">Buscando…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm">
          No encontramos profesionales con esos criterios.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => navegar(`/p/${encodeURIComponent(p.slugSeo)}`)}
              className="flex gap-4 rounded-xl bg-white p-4 text-left shadow-sm transition hover:ring-1 hover:ring-brand"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 font-bold text-slate-400 text-xl">
                {p.fotoPerfilUrl ? (
                  <img
                    src={p.fotoPerfilUrl}
                    alt={p.nombrePublico}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  p.nombrePublico.slice(0, 1)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold text-slate-800">{p.nombrePublico}</span>
                  {p.validadaSsaAt && <BadgeCheck size={16} className="shrink-0 text-brand" />}
                </div>
                <p className="text-slate-500 text-sm">
                  {TIPO_LABEL[p.tipo] ?? p.tipo}
                  {p.especialidades?.[0] ? ` · ${p.especialidades[0]}` : ""}
                </p>
                <div className="mt-1 flex items-center gap-3">
                  {p.totalResenas > 0 ? (
                    <span className="flex items-center gap-1">
                      <Estrellas score={Number(p.scorePromedio)} />
                      <span className="text-slate-400 text-xs">({p.totalResenas})</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs">Sin reseñas aún</span>
                  )}
                  {p.aceptaTelemedicina && (
                    <span className="flex items-center gap-1 text-brand text-xs">
                      <Video size={13} /> Telemedicina
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
