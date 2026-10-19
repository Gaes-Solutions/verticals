"use client";

import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  X,
} from "lucide-react";
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

function Imagen({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [fallo, setFallo] = useState(false);
  if (fallo)
    return <ImageOff aria-label={`${alt} no disponible`} className="m-auto text-slate-300" />;
  return (
    <img
      src={src}
      alt={alt}
      decoding="async"
      onError={() => setFallo(true)}
      className={className}
      draggable={false}
    />
  );
}

export function GaleriaProducto({
  fotos,
  alt,
  zoom,
}: { fotos: string[]; alt: string; zoom: boolean }) {
  return <Galeria key={JSON.stringify([alt, fotos, zoom])} fotos={fotos} alt={alt} zoom={zoom} />;
}

function Galeria({ fotos, alt, zoom }: { fotos: string[]; alt: string; zoom: boolean }) {
  const [activa, setActiva] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [escala, setEscala] = useState(1);
  const [angulo, setAngulo] = useState(0);
  const [tamano, setTamano] = useState({ width: 1, height: 1 });
  const dialog = useRef<HTMLDialogElement>(null);
  const visor = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ distancia: number; escala: number } | null>(null);
  const escalaActual = useRef(1);

  const limpiarGesto = useCallback(() => {
    for (const id of pointers.current.keys()) {
      if (visor.current?.hasPointerCapture(id)) visor.current.releasePointerCapture(id);
    }
    pointers.current.clear();
    gesto.current = null;
  }, []);

  function cambiarEscala(valor: number) {
    const next = Math.max(1, Math.min(4, valor));
    const previous = escalaActual.current;
    const viewport = visor.current;
    const centerX = viewport ? viewport.scrollLeft + viewport.clientWidth / 2 : 0;
    const centerY = viewport ? viewport.scrollTop + viewport.clientHeight / 2 : 0;
    escalaActual.current = next;
    setEscala(next);
    requestAnimationFrame(() => {
      if (!viewport || escalaActual.current !== next) return;
      viewport.scrollLeft = (centerX * next) / previous - viewport.clientWidth / 2;
      viewport.scrollTop = (centerY * next) / previous - viewport.clientHeight / 2;
    });
  }
  function seleccionar(indice: number) {
    limpiarGesto();
    setActiva(indice);
    cambiarEscala(1);
    setAngulo(0);
    if (visor.current) visor.current.scrollTo(0, 0);
  }

  useEffect(() => {
    if (!lightbox) {
      limpiarGesto();
      dialog.current?.close();
      return;
    }
    dialog.current?.showModal();
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setTamano({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    if (visor.current) observer.observe(visor.current);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      limpiarGesto();
      document.body.style.overflow = anterior;
      observer.disconnect();
    };
  }, [lightbox, limpiarGesto]);

  function distancia() {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
  function iniciar(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2)
      gesto.current = { distancia: distancia(), escala: escalaActual.current };
  }
  function mover(e: PointerEvent<HTMLDivElement>) {
    const anterior = pointers.current.get(e.pointerId);
    if (!anterior) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && gesto.current && gesto.current.distancia > 0) {
      cambiarEscala((gesto.current.escala * distancia()) / gesto.current.distancia);
    } else if (visor.current && escalaActual.current > 1) {
      visor.current.scrollLeft += anterior.x - e.clientX;
      visor.current.scrollTop += anterior.y - e.clientY;
    }
  }
  function terminar(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    gesto.current = null;
  }

  if (!fotos.length)
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl border bg-white">
        <ImageOff size={56} className="text-slate-300" />
      </div>
    );
  const principal = fotos[activa] ?? fotos[0];
  return (
    <div>
      <button
        type="button"
        disabled={!zoom}
        aria-label={zoom ? `Ampliar imagen de ${alt}` : alt}
        onClick={() => {
          if (zoom) {
            cambiarEscala(1);
            setAngulo(0);
            setLightbox(true);
          }
        }}
        className={`relative block aspect-square w-full overflow-hidden rounded-xl border bg-white ${zoom ? "cursor-zoom-in" : "cursor-default"}`}
      >
        <Imagen
          key={principal}
          src={principal}
          alt={alt}
          className="h-full w-full object-contain p-4"
        />
        {zoom && (
          <span className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full border bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm">
            <Maximize2 size={14} /> Toca para ampliar
          </span>
        )}
      </button>
      {fotos.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {fotos.map((f, i) => (
            <button
              key={`${i}:${f}`}
              type="button"
              aria-label={`Ver foto ${i + 1}`}
              aria-pressed={i === activa}
              onClick={() => seleccionar(i)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white ${i === activa ? "border-marca" : "border-slate-200"}`}
            >
              <Imagen
                src={f}
                alt={`${alt}, foto ${i + 1}`}
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}
      <dialog
        ref={dialog}
        aria-label={`Fotos de ${alt}`}
        onCancel={() => setLightbox(false)}
        onClose={() => setLightbox(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            seleccionar(
              (activa + (event.key === "ArrowRight" ? 1 : -1) + fotos.length) % fotos.length,
            );
          }
        }}
        className="store-image-dialog"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{alt}</p>
            <p className="mt-1 text-xs text-slate-500">
              Foto {activa + 1} de {fotos.length} · Pellizca para acercar o usa los botones
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar imágenes"
            onClick={() => setLightbox(false)}
            className="min-h-11 min-w-11 rounded-full p-2 hover:bg-slate-100"
          >
            <X size={22} />
          </button>
        </div>
        <div
          ref={visor}
          className="h-[60dvh] min-h-0 touch-none overflow-auto bg-white"
          onPointerDown={iniciar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          onLostPointerCapture={terminar}
          style={{ cursor: escala > 1 ? "grab" : "zoom-in" }}
        >
          <div
            style={{
              width: `${escala * 100}%`,
              height: `${escala * 100}%`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                transform: `rotate(${angulo}deg) scale(${angulo % 180 ? Math.min(tamano.width / tamano.height, tamano.height / tamano.width) : 1})`,
              }}
            >
              <Imagen
                key={principal}
                src={principal}
                alt={alt}
                className="h-full w-full select-none object-contain p-3"
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t p-3">
          {fotos.length > 1 && (
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={() => seleccionar((activa + fotos.length - 1) % fotos.length)}
              className="min-h-11 min-w-11 rounded-full p-2 hover:bg-slate-100"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <button
            type="button"
            aria-label="Alejar imagen"
            disabled={escala <= 1}
            onClick={() => cambiarEscala(escala - 0.5)}
            className="min-h-11 min-w-11 rounded-full border p-2 disabled:opacity-30"
          >
            <Minus size={20} />
          </button>
          <output className="w-12 text-center text-sm" aria-label="Nivel de zoom">
            {Math.round(escala * 100)}%
          </output>
          <button
            type="button"
            aria-label="Acercar imagen"
            disabled={escala >= 4}
            onClick={() => cambiarEscala(escala + 0.5)}
            className="min-h-11 min-w-11 rounded-full border p-2 disabled:opacity-30"
          >
            <Plus size={20} />
          </button>
          <button
            type="button"
            aria-label="Restablecer imagen"
            onClick={() => {
              cambiarEscala(1);
              setAngulo(0);
              visor.current?.scrollTo(0, 0);
            }}
            className="min-h-11 min-w-11 rounded-full p-2 hover:bg-slate-100"
          >
            <RotateCcw size={18} />
          </button>
          <button
            type="button"
            aria-label="Girar imagen 90 grados"
            onClick={() => {
              setAngulo((value) => (value + 90) % 360);
              visor.current?.scrollTo(0, 0);
            }}
            className="flex min-h-11 items-center gap-2 rounded-full px-3 py-2 hover:bg-slate-100"
          >
            <RotateCw size={18} /> <span className="text-sm">Girar foto</span>
          </button>
          {fotos.length > 1 && (
            <button
              type="button"
              aria-label="Foto siguiente"
              onClick={() => seleccionar((activa + 1) % fotos.length)}
              className="min-h-11 min-w-11 rounded-full p-2 hover:bg-slate-100"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      </dialog>
    </div>
  );
}
