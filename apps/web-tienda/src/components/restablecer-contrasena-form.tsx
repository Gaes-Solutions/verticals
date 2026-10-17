"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

/** Canjea el ?token= del email de recuperación y fija la nueva contraseña.
 *  Token inválido/expirado/usado → mensaje claro con opción de pedir otro enlace. */
export function RestablecerContrasenaForm() {
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const pending = useRef(false);
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    pending.current = true;
    setCargando(true);
    try {
      const res = await fetch("/api/cuenta/restablecer-contrasena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ token, nuevaContrasena: password }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || typeof d?.mensaje !== "string" || !d.mensaje.trim()) {
        setError(
          typeof d?.message === "string"
            ? d.message
            : "No se pudo confirmar el cambio de contraseña. Inténtalo de nuevo.",
        );
        return;
      }
      setListo(true);
    } catch {
      setError("Error de conexión. Inténtalo de nuevo en un momento.");
    } finally {
      pending.current = false;
      setCargando(false);
    }
  }

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <h1 className="mb-4 text-2xl font-bold">
          {token ? "Enlace inválido" : "Enlace incompleto"}
        </h1>
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={cargando}
            className="gx-input"
          />
        </label>
        <label className="block">
          <span className="gx-label">Confirma tu nueva contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            required
            minLength={8}
            disabled={cargando}
            className="gx-input"
          />
        </label>
        {error && (
          <div>
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
            <p className="mt-1 text-sm">
              <Link href="/cuenta/olvidar-contrasena" className="font-medium text-marca">
                Pedir un nuevo enlace
              </Link>
            </p>
          </div>
        )}
        <button type="submit" disabled={cargando} className="gx-btn-primary w-full">
          {cargando ? "Guardando contraseña…" : "Guardar contraseña"}
        </button>
      </form>
    </div>
  );
}
