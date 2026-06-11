"use client";

import { useState } from "react";

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
      <div className="flex aspect-square items-center justify-center rounded-lg border bg-white text-6xl">
        📦
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
        <img src={principal} alt={alt} className="h-full w-full object-cover" />
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
              <img src={f} alt={`${alt} ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <button
          type="button"
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
        >
          <img src={principal} alt={alt} className="max-h-[90vh] max-w-full rounded-lg" />
        </button>
      )}
    </div>
  );
}
