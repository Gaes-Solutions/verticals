"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

/** Canjea el ?token= del email de recuperación y fija la nueva contraseña.
 *  Token inválido/expirado/usado → mensaje claro con opción de pedir otro enlace. */
export function RestablecerContrasenaForm() {
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setCargando(true);
    try {
      const res = await fetch("/api/cuenta/restablecer-contrasena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nuevaContrasena: password }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(d?.message ?? "No se pudo restablecer la contraseña. Inténtalo de nuevo.");
        return;
      }
      setListo(true);
    } catch {
      setError("Error de conexión. Inténtalo de nuevo en un momento.");
    } finally {
      setCargando(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <h1 className="mb-4 text-2xl font-bold">Enlace incompleto</h1>
        <p className="text-slate-600">
          Este enlace no trae el código de restablecimiento. Usa el botón del correo que recibiste o
          pide uno nuevo.
        </p>
        <Link href="/cuenta/olvidar-contrasena" className="gx-btn-primary mt-6 inline-block">
          Pedir un nuevo enlace
        </Link>
      </div>
    );
  }

  if (listo) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <h1 className="mb-4 text-2xl font-bold">Contraseña actualizada</h1>
        <p className="text-slate-600">Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <Link href="/cuenta/login" className="gx-btn-primary mt-6 inline-block">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Nueva contraseña</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="gx-label">Nueva contraseña (mín. 8)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="gx-input"
          />
        </label>
        <label className="block">
          <span className="gx-label">Confirma tu nueva contraseña</span>
          <input
            type="password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            required
            minLength={8}
            className="gx-input"
          />
        </label>
        {error && (
          <div>
            <p className="text-sm text-danger">{error}</p>
            <p className="mt-1 text-sm">
              <Link href="/cuenta/olvidar-contrasena" className="font-medium text-marca">
                Pedir un nuevo enlace
              </Link>
            </p>
          </div>
        )}
        <button type="submit" disabled={cargando} className="gx-btn-primary w-full">
          {cargando ? "…" : "Guardar contraseña"}
        </button>
      </form>
    </div>
  );
}
