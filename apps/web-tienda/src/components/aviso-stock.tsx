"use client";
import { emailAvisoValido, reciboAviso } from "@/lib/producto-registro-contract";
import { useRegistroProducto } from "@/lib/use-registro-producto";
import { useId, useState } from "react";
export function AvisoStock({ productoPublicadoId }: { productoPublicadoId: string }) {
  return <FormularioAviso key={productoPublicadoId} productoPublicadoId={productoPublicadoId} />;
}
function FormularioAviso({ productoPublicadoId }: { productoPublicadoId: string }) {
  const [email, setEmail] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const r = useRegistroProducto();
  const id = useId();
  const ocupado = r.fase === "enviando";
  if (r.fase === "enviado")
    return (
      <output className="mt-4 block rounded-lg bg-ok-light p-3 text-ok text-sm">
        ✓ Aviso registrado. Te avisaremos por correo cuando vuelva a estar disponible.
      </output>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!emailAvisoValido(email.trim())) {
          setErrorLocal("Escribe un correo válido.");
          return;
        }
        setErrorLocal(null);
        void r.enviar(
          "/api/avisos-stock",
          { productoPublicadoId, email: email.trim() },
          reciboAviso,
        );
      }}
      aria-busy={ocupado}
      className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <p className="mb-2 font-medium text-slate-700 text-sm">
        Producto agotado. ¿Quieres que te avisemos?
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="min-w-0 flex-1 basis-40">
          <span className="sr-only">Tu correo</span>
          <input
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={email}
            disabled={!r.listo}
            readOnly={ocupado || r.fase === "incierto"}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrorLocal(null);
              r.limpiar();
            }}
            aria-describedby={errorLocal || r.error ? `${id}-error` : undefined}
            placeholder="Tu correo"
            className="gx-input min-h-11 w-full"
          />
        </label>
        <button
          type="submit"
          disabled={!r.listo || ocupado}
          className="gx-btn-primary min-h-11 disabled:opacity-50"
        >
          {ocupado ? "Registrando…" : r.fase === "incierto" ? "Reintentar aviso" : "Avísame"}
        </button>
      </div>
      {(errorLocal || r.error) && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-danger text-sm">
          {errorLocal ?? r.error}
        </p>
      )}
      {r.fase === "incierto" && (
        <p className="mt-2 text-slate-600 text-sm">
          Reintentaremos el mismo aviso. Se conserva tu correo para evitar registrar otro diferente.
        </p>
      )}
    </form>
  );
}
