"use client";
import type { CompraResenable } from "@/lib/cliente";
import { comprimirImagen } from "@/lib/imagen";
import { fotoResenaValida, listaResenables, reciboResena } from "@/lib/preferencias-contract";
import { ErrorPreferencia, fetchPreferencia, useSolicitudCuenta } from "@/lib/use-solicitud-cuenta";
import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
export function ResenasCuenta({ inicial }: { inicial: CompraResenable[] }) {
  if (!listaResenables(inicial))
    return <p role="alert">No pudimos verificar las compras pendientes de reseñar.</p>;
  const pendientes = inicial.filter((i) => !i.yaResenado);
  if (!pendientes.length)
    return <p className="text-sm text-slate-500">No tienes compras pendientes de reseñar.</p>;
  return (
    <div className="space-y-3">
      {pendientes.map((i) => (
        <FormResena key={JSON.stringify([i.pedidoId, i.productoPublicadoId])} item={i} />
      ))}
    </div>
  );
}
function FormResena({ item }: { item: CompraResenable }) {
  const [rating, setRating] = useState(0);
  const [comentario, setComentario] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [incierto, setIncierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const { ocupado, error, ejecutar } = useSolicitudCuenta();
  const vivo = useRef(false);
  const photoController = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoLock = useRef(false);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      photoController.current?.abort();
    };
  }, []);
  function reportarErrorFotos(c: AbortController) {
    if (vivo.current && !c.signal.aborted)
      setErrorLocal(
        "No pudimos procesar las fotos. Usa JPG, PNG o WebP de hasta 12 MB y vuelve a intentarlo.",
      );
  }
  async function agregarFotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || photoLock.current || ocupado) return;
    if (files.length + fotos.length > 3) {
      setErrorLocal("Puedes adjuntar hasta 3 fotos. Selecciona menos imágenes.");
      return;
    }
    photoLock.current = true;
    setProcesando(true);
    setErrorLocal(null);
    const c = new AbortController();
    photoController.current = c;
    try {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(20000)]);
      const nuevas = await comprimirFotos(files, signal);
      if (vivo.current && !c.signal.aborted) setFotos((prev) => [...prev, ...nuevas]);
    } catch {
      reportarErrorFotos(c);
    } finally {
      photoLock.current = false;
      if (vivo.current) setProcesando(false);
    }
  }
  function enviar(e: FormEvent) {
    e.preventDefault();
    if (procesando || photoLock.current || incierto) return;
    if (!rating) {
      setErrorLocal("Elige una calificación.");
      return;
    }
    setErrorLocal(null);
    void ejecutar(
      async (signal) => {
        const { data } = await fetchPreferencia("/api/cuenta/resenas", signal, {
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
        if (!reciboResena(data)) throw new ErrorPreferencia(502);
        setConfirmacion(
          data.estado === "pendiente"
            ? "Tu reseña fue recibida y está pendiente de revisión."
            : "Tu calificación fue publicada.",
        );
      },
      () => setIncierto(true),
    );
  }
  function consultar() {
    setErrorLocal(null);
    void ejecutar(async (signal) => {
      const { data } = await fetchPreferencia("/api/cuenta/resenas", signal);
      if (!listaResenables(data)) throw new ErrorPreferencia(502);
      const compra = data.find(
        (i) => i.pedidoId === item.pedidoId && i.productoPublicadoId === item.productoPublicadoId,
      );
      if (!compra) throw new ErrorPreferencia(404);
      if (compra.yaResenado) setConfirmacion("Ya hay una reseña registrada para esta compra.");
      else setIncierto(false);
    });
  }
  if (confirmacion)
    return (
      <output className="gx-card block !p-4 text-sm text-ok">
        {confirmacion} <strong className="break-words">{item.tituloPublico}</strong>
      </output>
    );
  return (
    <form onSubmit={enviar} className="gx-card !p-4" aria-label={`Reseñar ${item.tituloPublico}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/producto/${encodeURIComponent(item.slugSeo)}`}
          className="min-w-0 break-words text-sm font-medium hover:text-marca"
        >
          {item.tituloPublico}
        </Link>
        <span className="break-all text-xs text-slate-500">{item.folioPublico}</span>
      </div>
      <fieldset disabled={ocupado || procesando} className="mb-2">
        <legend className="text-sm text-slate-600">Califica tu compra</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
              aria-pressed={rating === n}
              className={`min-h-11 min-w-11 rounded text-2xl ${n <= rating ? "text-warn" : "text-slate-400"} hover:text-warn`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <textarea
        value={comentario}
        disabled={ocupado || procesando}
        maxLength={2000}
        aria-label="Comentario de la reseña"
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Cuéntanos tu experiencia (opcional)"
        rows={2}
        className="gx-input mb-2"
      />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {fotos.map((src, i) => (
          <div key={`${i}:${src.slice(-16)}`} className="relative p-2">
            <img
              src={src}
              alt={`Foto ${i + 1} de la reseña`}
              className="h-16 w-16 rounded object-cover"
            />
            <button
              type="button"
              disabled={ocupado || procesando}
              onClick={() => setFotos((prev) => prev.filter((_, j) => i !== j))}
              aria-label={`Quitar foto ${i + 1}`}
              className="absolute -right-1 -top-1 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-slate-700 text-white"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {fotos.length < 3 && (
        <div className="mb-3">
          <button
            type="button"
            disabled={ocupado || procesando}
            onClick={() => fileInput.current?.click()}
            className="gx-btn-secondary min-h-11"
          >
            Adjuntar fotos ({fotos.length}/3)
          </button>
          <p className="mt-1 text-xs text-slate-500">JPG, PNG o WebP. Hasta 12 MB por foto.</p>
          <input
            ref={fileInput}
            type="file"
            aria-label="Añadir fotos"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={ocupado || procesando}
            onChange={agregarFotos}
            className="hidden"
          />
        </div>
      )}
      {procesando && <output className="mb-2 block text-sm">Preparando fotos…</output>}
      {(errorLocal || error) && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {errorLocal || error}
        </p>
      )}
      {incierto && (
        <button
          type="button"
          onClick={consultar}
          disabled={ocupado || procesando}
          className="gx-btn-secondary mb-2 min-h-11"
        >
          Consultar estado de reseña
        </button>
      )}
      <button
        type="submit"
        disabled={ocupado || procesando || incierto}
        className="gx-btn-primary min-h-11"
      >
        {ocupado ? "Comprobando…" : "Enviar reseña"}
      </button>
    </form>
  );
}

async function comprimirFotos(files: File[], signal: AbortSignal) {
  const nuevas: string[] = [];
  for (const file of files) {
    const foto = await comprimirImagen(file, 1024, 0.7, signal);
    if (!fotoResenaValida(foto)) throw new Error("Foto no válida");
    nuevas.push(foto);
  }
  return nuevas;
}
