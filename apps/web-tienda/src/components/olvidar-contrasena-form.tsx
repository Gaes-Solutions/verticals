"use client";

import Link from "next/link";
import { useState } from "react";

/** Formulario "¿Olvidaste tu contraseña?": pide el email y muestra siempre el
 *  mensaje genérico de éxito, exista o no la cuenta (anti-enumeración). */
export function OlvidarContrasenaForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/cuenta/olvidar-contrasena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // 200 aunque el correo no exista; otro status es un fallo de red/servicio
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(d?.message ?? "No se pudo enviar el enlace. Inténtalo de nuevo en un momento.");
        return;
      }
      setEnviado(true);
    } catch {
      setError("Error de conexión. Inténtalo de nuevo en un momento.");
    } finally {
      setCargando(false);
    }
  }

  if (enviado) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <h1 className="mb-4 text-2xl font-bold">Revisa tu correo</h1>
        <p className="text-slate-600">
          Si el correo existe en esta tienda, te enviamos un enlace para restablecer tu contraseña.
          Vence en 1 hora.
        </p>
        <p className="mt-6 text-sm text-slate-500">
          ¿Ya la recordaste?{" "}
          <Link href="/cuenta/login" className="font-medium text-marca">
            Inicia sesión
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">¿Olvidaste tu contraseña?</h1>
      <p className="mb-4 text-sm text-slate-600">
        Escribe el correo de tu cuenta y te enviaremos un enlace para restablecerla.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="gx-label">Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="gx-input"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={cargando} className="gx-btn-primary w-full">
          {cargando ? "…" : "Enviar enlace"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/cuenta/login" className="font-medium text-marca">
          ← Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
