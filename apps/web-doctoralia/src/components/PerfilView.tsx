import { useEffect, useState } from "react";
import { type PerfilPublico, api } from "../lib/api.js";

export function PerfilView({ slug, onVolver }: { slug: string; onVolver: () => void }) {
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<PerfilPublico>(`/doctoralia/profesionales/${slug}`)
      .then(setPerfil)
      .catch(() => setError(true));
  }, [slug]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <p className="text-slate-500">No se encontró el perfil.</p>
        <button type="button" onClick={onVolver} className="mt-4 text-brand hover:underline">
          ← Volver al directorio
        </button>
      </div>
    );
  }

  if (!perfil) {
    return <p className="py-10 text-center text-slate-400">Cargando…</p>;
  }

  return (
    <div className="min-h-full">
      <header className="bg-brand px-4 py-4 text-white">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={onVolver}
            className="text-sm text-teal-100 hover:text-white"
          >
            ← Directorio
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          {perfil.fotoPerfilUrl ? (
            <img
              src={perfil.fotoPerfilUrl}
              alt={perfil.nombrePublico}
              className="h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand/10 text-2xl font-bold text-brand">
              {perfil.nombrePublico.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{perfil.nombrePublico}</h1>
            <p className="text-slate-500">{perfil.especialidades.join(" · ") || perfil.tipo}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {perfil.scorePromedio ? (
                <span className="font-semibold text-amber-500">
                  ★ {perfil.scorePromedio.toFixed(1)} ({perfil.totalResenas})
                </span>
              ) : (
                <span className="text-slate-400">Sin reseñas aún</span>
              )}
              {perfil.validadaSsaAt && (
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                  Cédula verificada
                </span>
              )}
              {perfil.aceptaTelemedicina && (
                <span className="rounded bg-sky-50 px-2 py-0.5 text-sky-700">Telemedicina</span>
              )}
            </div>
          </div>
        </div>

        {perfil.bioLarga && (
          <p className="mt-6 whitespace-pre-line text-slate-700">{perfil.bioLarga}</p>
        )}

        {perfil.ubicaciones.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold text-slate-800">Ubicaciones</h2>
            <div className="space-y-2">
              {perfil.ubicaciones.map((u) => (
                <div key={u.id} className="rounded-lg bg-white p-3 shadow-sm">
                  {u.nombre && <p className="font-medium text-slate-800">{u.nombre}</p>}
                  <p className="text-sm text-slate-500">
                    {[u.direccion, u.ciudad, u.estado].filter(Boolean).join(", ")}
                  </p>
                  {u.telefono && <p className="text-sm text-slate-500">Tel. {u.telefono}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-800">
            Reseñas {perfil.reviews.length > 0 && `(${perfil.reviews.length})`}
          </h2>
          {perfil.reviews.length === 0 ? (
            <p className="text-slate-400">Aún no hay reseñas.</p>
          ) : (
            <div className="space-y-3">
              {perfil.reviews.map((r) => (
                <div key={r.id} className="rounded-lg bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-amber-500">★ {r.ratingGeneral}</span>
                    {r.verificada && (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        Verificada
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {new Date(r.publicadaAt).toLocaleDateString("es-MX")}
                    </span>
                  </div>
                  {r.comentario && <p className="mt-2 text-slate-700">{r.comentario}</p>}
                  {r.respuestaMedico && (
                    <div className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-600">
                      <span className="font-medium">Respuesta: </span>
                      {r.respuestaMedico}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
