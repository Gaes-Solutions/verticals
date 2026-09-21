"use client";

import { type FormEvent, useState } from "react";

/** "Avísame cuando haya stock": el cliente deja su correo en un producto agotado. */
export function AvisoStock({ productoPublicadoId }: { productoPublicadoId: string }) {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function avisar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/avisos-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productoPublicadoId, email }),
    });
    if (res.ok) setEnviado(true);
    else setError("No se pudo registrar. Revisa tu correo.");
  }

  if (enviado) {
    return (
      <p className="mt-4 rounded-lg bg-ok-light p-3 text-ok text-sm">
        ✓ Te avisaremos por correo cuando vuelva a estar disponible.
      </p>
    );
  }

  return (
    <form onSubmit={avisar} className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 font-medium text-slate-700 text-sm">
        Producto agotado. ¿Quieres que te avisemos?
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="flex-1">
          <span className="sr-only">Tu correo</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Tu correo"
            className="gx-input"
          />
        </label>
        <button type="submit" className="gx-btn-primary">
          Avísame
        </button>
      </div>
      {error && <p className="mt-2 text-danger text-sm">{error}</p>}
    </form>
  );
}
