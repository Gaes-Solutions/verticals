import { useCallback, useEffect, useState } from "react";
import {
  type TourDef,
  deshabilitarTour,
  marcarTourVisto,
  tourDeshabilitado,
  tourPorId,
  tourVisto,
} from "../lib/tours.js";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;

/**
 * Recorrido guiado tipo coach-marks: resalta el elemento real (por su
 * `data-tour`) y explica el paso en una tarjeta inferior. Se lanza con el evento
 * "gaes-tour". El tour de bienvenida se ofrece una sola vez y respeta si el
 * usuario lo deshabilita.
 */
export function Tour() {
  const [tour, setTour] = useState<TourDef | null>(null);
  const [paso, setPaso] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const iniciar = useCallback((def: TourDef) => {
    setTour(def);
    setPaso(0);
  }, []);

  const cerrar = useCallback(() => {
    if (tour) marcarTourVisto(tour.id);
    setTour(null);
    setRect(null);
  }, [tour]);

  // Lanzamiento bajo demanda desde cualquier parte de la app.
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const def = tourPorId(id);
      if (def) iniciar(def);
    };
    window.addEventListener("gaes-tour", h);
    return () => window.removeEventListener("gaes-tour", h);
  }, [iniciar]);

  // Oferta automática (una vez) del recorrido de bienvenida.
  useEffect(() => {
    const auto = tourPorId("bienvenida");
    if (auto?.autoOnce && !tourVisto(auto.id) && !tourDeshabilitado(auto.id)) {
      const t = setTimeout(() => iniciar(auto), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [iniciar]);

  // Navega a la sección del paso y localiza el elemento a resaltar.
  useEffect(() => {
    if (!tour) return;
    const step = tour.pasos[paso];
    if (!step) return;
    if (step.seccion) {
      window.dispatchEvent(new CustomEvent("gaes-nav", { detail: step.seccion }));
    }
    if (!step.anchor) {
      setRect(null);
      return;
    }
    let intentos = 0;
    let raf = 0;
    const buscar = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return;
      }
      if (intentos++ < 20) raf = window.setTimeout(buscar, 80);
      else setRect(null);
    };
    buscar();
    return () => window.clearTimeout(raf);
  }, [tour, paso]);

  // Reposiciona el resaltado si cambia el tamaño de la ventana.
  useEffect(() => {
    if (!tour) return;
    const step = tour.pasos[paso];
    if (!step?.anchor) return;
    const onResize = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tour, paso]);

  if (!tour) return null;
  const step = tour.pasos[paso];
  if (!step) return null;
  const total = tour.pasos.length;
  const esUltimo = paso === total - 1;
  const esPrimero = paso === 0;

  return (
    <div className="fixed inset-0 z-[60]" aria-label={tour.nombre}>
      {/* Capa oscura que atrapa toques fuera del resaltado */}
      <button
        type="button"
        aria-label="Cerrar recorrido"
        onClick={cerrar}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-900/55"
      />

      {/* Resaltado del elemento */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-4 ring-brand ring-offset-2 ring-offset-transparent transition-all"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.55)",
          }}
        />
      )}

      {/* Tarjeta guía (abajo, cómoda en móvil) */}
      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
        <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex gap-1">
              {tour.pasos.map((p, i) => (
                <span
                  key={`${tour.id}-${p.titulo}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === paso ? "w-5 bg-brand" : "w-1.5 bg-slate-200"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={cerrar}
              className="text-slate-400 text-sm hover:text-slate-600"
            >
              Salir ✕
            </button>
          </div>

          <h3 className="font-bold text-slate-800 text-lg">{step.titulo}</h3>
          <p className="mt-1 text-slate-600 text-sm">{step.texto}</p>

          <div className="mt-4 flex items-center justify-between gap-2">
            {tour.autoOnce && esPrimero ? (
              <button
                type="button"
                onClick={() => {
                  deshabilitarTour(tour.id);
                  cerrar();
                }}
                className="text-slate-400 text-xs hover:text-slate-600"
              >
                No volver a mostrar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPaso((p) => Math.max(0, p - 1))}
                disabled={esPrimero}
                className="rounded-lg px-3 py-2 text-slate-600 text-sm disabled:opacity-0"
              >
                ← Atrás
              </button>
            )}
            <button
              type="button"
              onClick={() => (esUltimo ? cerrar() : setPaso((p) => p + 1))}
              className="rounded-lg bg-brand px-5 py-2 font-semibold text-sm text-white hover:bg-brand-dark"
            >
              {esUltimo ? "¡Entendido!" : "Siguiente →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
