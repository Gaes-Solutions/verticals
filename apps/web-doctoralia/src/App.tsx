import { useCallback, useEffect, useState } from "react";
import { PerfilView } from "./components/PerfilView.js";
import { type BusquedaResultado, type ProfesionalCard, api } from "./lib/api.js";

const TIPOS: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "medico", label: "Médicos" },
  { value: "veterinario", label: "Veterinarios" },
];

function estrellas(score: number | null): string {
  if (!score) return "Nuevo";
  return `★ ${score.toFixed(1)}`;
}

export function App() {
  const [q, setQ] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [tipo, setTipo] = useState("");
  const [items, setItems] = useState<ProfesionalCard[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [slugSel, setSlugSel] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (ciudad.trim()) params.set("ciudad", ciudad.trim());
      if (tipo) params.set("tipo", tipo);
      const res = await api<BusquedaResultado>(`/doctoralia/buscar?${params.toString()}`);
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setCargando(false);
    }
  }, [q, ciudad, tipo]);

  useEffect(() => {
    const t = setTimeout(buscar, 300);
    return () => clearTimeout(t);
  }, [buscar]);

  if (slugSel) {
    return <PerfilView slug={slugSel} onVolver={() => setSlugSel(null)} />;
  }

  return (
    <div className="min-h-full">
      <header className="bg-brand px-4 py-4 text-white">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-xl font-bold">Directorio de salud</h1>
          <p className="text-sm text-teal-100">Encuentra médicos y veterinarios cerca de ti</p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Especialidad, nombre o padecimiento…"
            className="rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
          <input
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            placeholder="Ciudad"
            className="rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <p className="mb-3 text-sm text-slate-500">
          {cargando ? "Buscando…" : `${total} profesional${total === 1 ? "" : "es"}`}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSlugSel(p.slugSeo)}
              className="flex flex-col rounded-xl bg-white p-4 text-left shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                {p.fotoPerfilUrl ? (
                  <img
                    src={p.fotoPerfilUrl}
                    alt={p.nombrePublico}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 font-bold text-brand">
                    {p.nombrePublico.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{p.nombrePublico}</p>
                  <p className="truncate text-xs text-slate-500">
                    {p.especialidades.slice(0, 2).join(" · ") || p.tipo}
                  </p>
                </div>
              </div>
              {p.bioCorta && (
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.bioCorta}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-amber-500">{estrellas(p.scorePromedio)}</span>
                {p.totalResenas > 0 && <span className="text-slate-400">({p.totalResenas})</span>}
                {p.validadaSsaAt && (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                    Cédula verificada
                  </span>
                )}
                {p.aceptaTelemedicina && (
                  <span className="rounded bg-sky-50 px-2 py-0.5 text-sky-700">Telemedicina</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {!cargando && items.length === 0 && (
          <p className="mt-10 text-center text-slate-400">
            Sin resultados. Prueba otra especialidad o ciudad.
          </p>
        )}
      </div>
    </div>
  );
}
