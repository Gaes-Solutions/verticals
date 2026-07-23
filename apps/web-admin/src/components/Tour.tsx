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
 * Recorrido guiado tipo coach-marks: navega a la sección, abre el diálogo si el
 * paso lo pide (`abrir`), resalta el elemento real (`anchor`, botón o campo) con
 * un aro que pulsa, y explica el paso en una tarjeta inferior con progreso,
 * Atrás/Siguiente, Salir y Repetir. Se lanza con el evento "gaes-tour".
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
    // Si el recorrido dejó un diálogo abierto, lo cerramos con su botón Cancelar.
    const cancelar = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.offsetParent !== null && b.textContent?.trim() === "Cancelar",
    );
    cancelar?.click();
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

  // Navega a la sección, abre el diálogo si aplica, y localiza el elemento.
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
    let clicado = false;
    let timer = 0;
    const buscar = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return;
      }
      // Si el elemento aún no existe y el paso pide abrir un diálogo, lo abrimos.
      if (step.abrir && !clicado) {
        clicado = true;
        document.querySelector<HTMLElement>(`[data-tour="${step.abrir}"]`)?.click();
      }
      if (intentos++ < 30) timer = window.setTimeout(buscar, 100);
      else setRect(null);
    };
    buscar();
    return () => window.clearTimeout(timer);
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
      <style>
        {
          "@keyframes gaesTourPulse{0%,100%{box-shadow:0 0 0 3px #0f766e,0 0 0 7px rgba(15,118,110,.30)}50%{box-shadow:0 0 0 3px #0f766e,0 0 0 13px rgba(15,118,110,.12)}}"
        }
      </style>

      {/* Capa oscura que atrapa toques fuera del resaltado */}
      <button
        type="button"
        aria-label="Cerrar recorrido"
        onClick={cerrar}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-900/60"
      />

      {rect && (
        <>
          {/* Recorte de la zona resaltada (deja ver el elemento real, sin oscurecer) */}
          <div
            className="pointer-events-none absolute rounded-xl"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              boxShadow: "0 0 0 9999px rgba(15,23,42,0.60)",
            }}
          />
          {/* Aro que pulsa */}
          <div
            className="pointer-events-none absolute rounded-xl transition-all"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              animation: "gaesTourPulse 1.4s ease-in-out infinite",
            }}
          />
        </>
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
              className="rounded-lg px-2 py-1 font-medium text-slate-400 text-sm hover:bg-slate-100 hover:text-slate-600"
            >
              Salir ✕
            </button>
          </div>

          <h3 className="font-bold text-lg text-slate-800">{step.titulo}</h3>
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

            {esUltimo ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaso(0)}
                  className="rounded-lg border border-brand px-4 py-2 font-semibold text-brand text-sm hover:bg-brand/5"
                >
                  ↻ Repetir
                </button>
                <button
                  type="button"
                  onClick={cerrar}
                  className="rounded-lg bg-brand px-5 py-2 font-semibold text-sm text-white hover:bg-brand-dark"
                >
                  ¡Entendido!
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPaso((p) => p + 1)}
                className="rounded-lg bg-brand px-5 py-2 font-semibold text-sm text-white hover:bg-brand-dark"
              >
                Siguiente →
              </button>
            )}
          </div>

          <p className="mt-3 border-slate-100 border-t pt-2 text-center text-[11px] text-slate-400">
            Puedes <b>Salir ✕</b> cuando quieras y repetir este recorrido desde <b>Ayuda</b>.
          </p>
        </div>
      </div>
    </div>
  );
}
