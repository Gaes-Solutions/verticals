"use client";

import type { CompraResenable } from "@/lib/cliente";
import { comprimirImagen } from "@/lib/imagen";
import Link from "next/link";
import { type ChangeEvent, useState } from "react";

const MAX_FOTOS = 3;

/** "Califica tus compras": estrellas + comentario por producto entregado. */
export function ResenasCuenta({ inicial }: { inicial: CompraResenable[] }) {
  const pendientes = inicial.filter((i) => !i.yaResenado);
  if (pendientes.length === 0) {
    return <p className="text-sm text-slate-500">No tienes compras pendientes de reseñar.</p>;
  }
  return (
    <div className="space-y-3">
      {pendientes.map((i) => (
        <FormResena key={`${i.pedidoId}:${i.productoPublicadoId}`} item={i} />
      ))}
    </div>
  );
}

function FormResena({ item }: { item: CompraResenable }) {
  const [rating, setRating] = useState(0);
  const [comentario, setComentario] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviada">("idle");
  const [error, setError] = useState<string | null>(null);

  async function agregarFotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    try {
      const nuevas: string[] = [];
      for (const f of files.slice(0, MAX_FOTOS - fotos.length)) {
        nuevas.push(await comprimirImagen(f));
      }
      setFotos((prev) => [...prev, ...nuevas].slice(0, MAX_FOTOS));
    } catch {
      setError("No se pudo procesar una de las fotos");
    }
  }

  async function enviar() {
    if (rating === 0) {
      setError("Elige una calificación");
      return;
    }
    setEstado("enviando");
    setError(null);
    const res = await fetch("/api/cuenta/resenas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pedidoId: item.pedidoId,
        productoPublicadoId: item.productoPublicadoId,
        rating,
        ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
        ...(fotos.length ? { imagenes: fotos } : {}),
      }),
    });
    if (res.ok) {
      setEstado("enviada");
    } else {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setError(data.message ?? "No se pudo enviar la reseña");
      setEstado("idle");
    }
  }

  if (estado === "enviada") {
    return (
      <div className="gx-card !p-4 text-sm text-ok">
        ¡Gracias por reseñar <strong>{item.tituloPublico}</strong>!
        {comentario.trim() && " Tu comentario se publicará tras revisión."}
      </div>
    );
  }

  return (
    <div className="gx-card !p-4">
      <div className="mb-2 flex items-center justify-between">
        <Link href={`/producto/${item.slugSeo}`} className="text-sm font-medium hover:text-marca">
          {item.tituloPublico}
        </Link>
        <span className="text-xs text-slate-400">{item.folioPublico}</span>
      </div>
      <div className="mb-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} estrellas`}
            className={`text-2xl ${n <= rating ? "text-warn" : "text-slate-300"} hover:text-warn`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Cuéntanos tu experiencia (opcional)"
        rows={2}
        className="gx-input mb-2"
      />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {fotos.map((src, i) => (
          <div key={src.slice(-16)} className="relative">
            <img src={src} alt="reseña" className="h-14 w-14 rounded object-cover" />
            <button
              type="button"
              onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
              className="-right-2 -top-2 absolute flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-white text-xs"
              aria-label="Quitar foto"
            >
              ✕
            </button>
          </div>
        ))}
        {fotos.length < MAX_FOTOS && (
          <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded border border-slate-300 border-dashed text-slate-400 text-xl hover:border-marca hover:text-marca">
            +
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={agregarFotos}
              className="hidden"
            />
          </label>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={enviar}
        disabled={estado === "enviando"}
        className="gx-btn-primary"
      >
        {estado === "enviando" ? "Enviando…" : "Enviar reseña"}
      </button>
    </div>
  );
}
