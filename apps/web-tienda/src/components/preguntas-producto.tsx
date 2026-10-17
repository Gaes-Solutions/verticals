"use client";
import { preguntaValida, reciboPregunta } from "@/lib/producto-registro-contract";
import { usePropietarioPregunta } from "@/lib/use-propietario-pregunta";
import { useRegistroProducto } from "@/lib/use-registro-producto";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
interface PreguntaPublica {
  id: string;
  pregunta: string;
  respuesta: string | null;
}
export function PreguntasProducto(props: {
  productoPublicadoId: string;
  preguntas: PreguntaPublica[];
}) {
  return <PreguntasContexto key={props.productoPublicadoId} {...props} />;
}
function PreguntasContexto({
  productoPublicadoId,
  preguntas,
}: { productoPublicadoId: string; preguntas: PreguntaPublica[] }) {
  const p = usePropietarioPregunta(productoPublicadoId);
  const pathname = usePathname();
  return (
    <section className="mt-12" aria-label="Preguntas y respuestas">
      <h2 className="mb-4 font-bold text-lg">Preguntas y respuestas</h2>
      {p.verificando && (
        <output className="mb-3 block text-slate-500 text-sm">
          Comprobando tu sesión para preguntar…
        </output>
      )}
      {!p.verificando && p.error && (
        <div role="alert" className="mb-3 text-sm">
          <p>No pudimos verificar tu sesión. Tu pregunta se conserva en esta página.</p>
          <button
            type="button"
            onClick={() => void p.cargar()}
            className="gx-btn-secondary mt-2 min-h-11"
          >
            Verificar sesión
          </button>
        </div>
      )}
      {!p.verificando && !p.error && !p.owner && (
        <Link
          href={`/cuenta/login?next=${encodeURIComponent(pathname)}`}
          className="gx-btn-secondary mb-4 min-h-11"
        >
          Iniciar sesión para preguntar
        </Link>
      )}
      {p.owner && (
        <div hidden={p.verificando || p.error}>
          <FormularioPregunta
            key={p.owner}
            productoId={productoPublicadoId}
            owner={p.owner}
            revisarSesion={() => void p.cargar()}
          />
        </div>
      )}
      {preguntas.length === 0 ? (
        <p className="text-slate-400 text-sm">Aún no hay preguntas. ¡Haz la primera!</p>
      ) : (
        <div className="space-y-4">
          {preguntas.map((q) => (
            <div key={q.id} className="gx-card !p-4">
              <p className="font-medium text-slate-800 text-sm">P: {q.pregunta}</p>
              {q.respuesta && <p className="mt-1 text-slate-600 text-sm">R: {q.respuesta}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function FormularioPregunta({
  productoId,
  owner,
  revisarSesion,
}: { productoId: string; owner: string; revisarSesion: () => void }) {
  const [texto, setTexto] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const solicitud = useRef<string | null>(null);
  const id = useId();
  const r = useRegistroProducto();
  const ocupado = r.fase === "enviando";
  return (
    <div className="mb-6">
      {r.fase !== "enviado" ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!preguntaValida(texto)) {
              setErrorLocal("Escribe una pregunta de 5 a 500 caracteres.");
              return;
            }
            setErrorLocal(null);
            solicitud.current ??= crypto.randomUUID();
            const id = solicitud.current;
            const ok = await r.enviar(
              `/api/cuenta/productos/${encodeURIComponent(productoId)}/preguntas`,
              { pregunta: texto.trim(), solicitudId: id, clienteIdEsperado: owner },
              (data) => reciboPregunta(data, id),
              (failure) => {
                if (failure.status === 401 || failure.code === "SESSION_CHANGED") revisarSesion();
              },
            );
            if (ok) setTexto("");
          }}
          aria-busy={ocupado}
          className="flex flex-wrap gap-2"
        >
          <div className="min-w-0 flex-1 basis-52">
            <label htmlFor={`${id}-pregunta`} className="sr-only">
              Pregunta
            </label>
            <textarea
              id={`${id}-pregunta`}
              aria-describedby={errorLocal || r.error ? `${id}-error` : undefined}
              value={texto}
              disabled={!r.listo}
              readOnly={ocupado || r.fase === "incierto"}
              onChange={(e) => {
                setTexto(e.target.value);
                solicitud.current = null;
                setErrorLocal(null);
                r.limpiar();
              }}
              maxLength={500}
              rows={2}
              placeholder="Pregúntale algo al vendedor…"
              className="gx-input min-h-11 w-full"
            />
          </div>
          <button
            type="submit"
            disabled={!r.listo || ocupado}
            className="gx-btn-primary min-h-11 self-start disabled:opacity-50"
          >
            {ocupado
              ? "Enviando…"
              : r.fase === "incierto"
                ? "Reintentar esta pregunta"
                : "Preguntar"}
          </button>
        </form>
      ) : (
        <div>
          <output className="block text-ok text-sm">
            ✓ Tu pregunta quedó registrada. La verás aquí cuando la tienda responda.
          </output>
          <button
            type="button"
            onClick={() => {
              solicitud.current = null;
              r.limpiar();
            }}
            className="gx-btn-secondary mt-2 min-h-11"
          >
            Hacer otra pregunta
          </button>
        </div>
      )}
      {(errorLocal || r.error) && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-danger text-sm">
          {errorLocal ?? r.error}
        </p>
      )}
      {r.fase === "incierto" && (
        <p className="mt-2 text-slate-600 text-sm">
          Tu pregunta se conserva. Reintenta esta misma solicitud para comprobarla sin crear otra.
        </p>
      )}
    </div>
  );
}
