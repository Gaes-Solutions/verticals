import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface Perfil {
  id: string;
  nombrePublico: string;
  tipo: string;
  cedulaProfesional?: string | null;
  especialidades: string[];
  bioCorta?: string | null;
  updatedAt: string;
}
interface Resena {
  id: string;
  ratingGeneral: number;
  comentario?: string | null;
  moderacionStatus: string;
  createdAt: string;
}

const TIPO_LABEL: Record<string, string> = {
  medico_humano: "Médico",
  veterinario: "Veterinario",
  dentista: "Dentista",
  nutriologo: "Nutriólogo",
  psicologo: "Psicólogo",
};

export function MarketplacePage() {
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api<{ perfiles: Perfil[]; resenas: Resena[] }>("/marketplace/admin/pendientes")
      .then((r) => {
        setPerfiles(r.perfiles ?? []);
        setResenas(r.resenas ?? []);
      })
      .catch(() => {
        setPerfiles([]);
        setResenas([]);
      })
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function validar(id: string, aprobar: boolean) {
    setBusy(id);
    setMsg(null);
    const motivoRechazo = aprobar ? undefined : window.prompt("Motivo del rechazo:") || "No cumple";
    try {
      await api(`/marketplace/admin/perfiles/${id}/validar`, {
        method: "POST",
        body: { cedulaValidaSsa: aprobar, aprobar, ...(motivoRechazo ? { motivoRechazo } : {}) },
      });
      setMsg(aprobar ? "Perfil publicado." : "Perfil rechazado.");
      cargar();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "No se pudo validar");
    } finally {
      setBusy(null);
    }
  }

  async function moderar(id: string, aprobar: boolean) {
    setBusy(id);
    setMsg(null);
    try {
      await api(`/marketplace/admin/resenas/${id}/moderar`, {
        method: "POST",
        body: { aprobar },
      });
      cargar();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "No se pudo moderar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <h1 className="font-bold text-2xl text-slate-800">Marketplace</h1>
        <p className="text-slate-500 text-sm">
          Validación de perfiles y moderación de reseñas escaladas.
        </p>
      </div>
      {msg && (
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-slate-600 text-sm shadow-sm">
          {msg}
        </p>
      )}

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-semibold text-slate-700">
              Perfiles en revisión ({perfiles.length})
            </h2>
            {perfiles.length === 0 ? (
              <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
                No hay perfiles pendientes.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {perfiles.map((p) => (
                  <div key={p.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-800">{p.nombrePublico}</p>
                        <p className="text-slate-500 text-sm">
                          {TIPO_LABEL[p.tipo] ?? p.tipo}
                          {p.cedulaProfesional ? ` · cédula ${p.cedulaProfesional}` : ""}
                          {p.especialidades?.length ? ` · ${p.especialidades.join(", ")}` : ""}
                        </p>
                        {p.bioCorta && <p className="mt-1 text-slate-500 text-xs">{p.bioCorta}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy === p.id}
                          onClick={() => validar(p.id, false)}
                          className="gx-btn-secondary"
                        >
                          Rechazar
                        </button>
                        <button
                          type="button"
                          disabled={busy === p.id}
                          onClick={() => validar(p.id, true)}
                          className="gx-btn-primary"
                        >
                          Validar y publicar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-slate-700">
              Reseñas escaladas ({resenas.length})
            </h2>
            {resenas.length === 0 ? (
              <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
                No hay reseñas por moderar.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {resenas.map((r) => (
                  <div key={r.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-amber-500 text-sm">{"★".repeat(r.ratingGeneral)}</p>
                        <p className="text-slate-600 text-sm">
                          {r.comentario ?? "(sin comentario)"}
                        </p>
                        <p className="mt-0.5 text-slate-400 text-xs">{r.moderacionStatus}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => moderar(r.id, false)}
                          className="gx-btn-secondary"
                        >
                          Rechazar
                        </button>
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => moderar(r.id, true)}
                          className="gx-btn-primary"
                        >
                          Publicar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
