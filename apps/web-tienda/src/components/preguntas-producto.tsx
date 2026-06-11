"use client";

import { type FormEvent, useState } from "react";

interface PreguntaPublica {
  id: string;
  pregunta: string;
  respuesta: string | null;
}

/** Q&A público del producto: muestra preguntas respondidas + permite preguntar. */
export function PreguntasProducto({
  productoPublicadoId,
  preguntas,
}: {
  productoPublicadoId: string;
  preguntas: PreguntaPublica[];
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function preguntar(e: FormEvent) {
    e.preventDefault();
    if (texto.trim().length < 5) {
      setError("Escribe una pregunta más completa");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/cuenta/productos/${productoPublicadoId}/preguntas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta: texto.trim() }),
    });
    setEnviando(false);
    if (res.status === 401) {
      setError("Inicia sesión para preguntar.");
      return;
    }
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { message?: string };
      setError(d.message ?? "No se pudo enviar");
      return;
    }
    setTexto("");
    setEnviada(true);
  }

  return (
    <section className="mt-12">
      <h2 className="mb-4 font-bold text-lg">Preguntas y respuestas</h2>

      <form onSubmit={preguntar} className="mb-6 flex flex-wrap gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Pregúntale algo al vendedor…"
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-marca px-4 py-2 font-semibold text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          Preguntar
        </button>
      </form>
      {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
      {enviada && (
        <p className="mb-3 text-gray-500 text-sm">
          ✓ Tu pregunta se envió. La verás aquí cuando la tienda responda.
        </p>
      )}

      {preguntas.length === 0 ? (
        <p className="text-gray-400 text-sm">Aún no hay preguntas. ¡Haz la primera!</p>
      ) : (
        <div className="space-y-4">
          {preguntas.map((p) => (
            <div key={p.id} className="rounded-lg border bg-white p-4">
              <p className="font-medium text-gray-800 text-sm">P: {p.pregunta}</p>
              {p.respuesta && <p className="mt-1 text-gray-600 text-sm">R: {p.respuesta}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
