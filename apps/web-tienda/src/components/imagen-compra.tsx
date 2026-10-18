"use client";
import { ImageOff } from "lucide-react";
import { useState } from "react";

/** A failed URL only affects that URL; a replacement image gets another chance. */
export function ImagenCompra({
  src,
  alt,
  className = "h-full w-full object-contain",
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  return <Imagen key={src ?? ""} src={src} alt={alt} className={className} />;
}
function Imagen({ src, alt, className }: { src?: string; alt: string; className: string }) {
  const [fallo, setFallo] = useState(false);
  if (!src || fallo)
    return (
      <span
        className="flex h-full w-full items-center justify-center text-slate-300"
        role="img"
        aria-label={alt ? `Imagen no disponible: ${alt}` : "Imagen no disponible"}
      >
        <ImageOff size={24} aria-hidden="true" />
      </span>
    );
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
