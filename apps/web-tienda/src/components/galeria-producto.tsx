"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

function Imagen({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [fallo, setFallo] = useState(false);
  if (fallo)
    return <ImageOff aria-label={`${alt} no disponible`} className="m-auto text-slate-300" />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFallo(true)}
      className={className}
    />
  );
}

export function GaleriaProducto({
  fotos,
  alt,
  zoom,
}: {
  fotos: string[];
  alt: string;
  zoom: boolean;
}) {
  const [activa, setActiva] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  if (fotos.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg border bg-white">
        <ImageOff size={56} strokeWidth={1.5} className="text-slate-300" />
      </div>
    );
  }

  const principal = fotos[activa] ?? fotos[0];

  return (
    <div>
      <button
        type="button"
        onClick={() => zoom && setLightbox(true)}
        className={`block aspect-square w-full overflow-hidden rounded-lg border bg-white ${
          zoom ? "cursor-zoom-in" : "cursor-default"
        }`}
      >
        <Imagen src={principal} alt={alt} className="h-full w-full object-cover" />
      </button>

      {fotos.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {fotos.map((f, i) => (
            <button
              key={f}
              type="button"
              onClick={() => setActiva(i)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                i === activa ? "border-marca" : "border-transparent"
              }`}
            >
              <Imagen src={f} alt={`${alt} ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="gx-modal-overlay cursor-zoom-out"
          role="presentation"
          onClick={() => setLightbox(false)}
          onKeyDown={(e) => e.key === "Escape" && setLightbox(false)}
        >
          <div className="gx-modal-panel !max-w-3xl bg-transparent p-2 text-center shadow-none">
            <Imagen
              src={principal}
              alt={alt}
              className="mx-auto max-h-[80vh] max-w-full rounded-lg"
            />
            <button
              type="button"
              onClick={() => setLightbox(false)}
              onKeyDown={(e) => e.key === "Escape" && setLightbox(false)}
              className="gx-btn-secondary mt-3"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
