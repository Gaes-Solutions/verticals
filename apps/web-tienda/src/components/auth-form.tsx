"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthForm({ modo }: { modo: "login" | "registro" }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await fetch(`/api/cuenta/${modo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          modo === "registro" ? { nombre, email, password } : { email, password },
        ),
      });
      if (!res.ok) {
        const d = (await res.json()) as { message?: string };
        setError(d.message ?? "No se pudo continuar");
        return;
      }
      router.push("/cuenta");
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">
        {modo === "registro" ? "Crear cuenta" : "Iniciar sesión"}
      </h1>
      <form onSubmit={submit} className="space-y-3">
        {modo === "registro" && (
          <label className="block">
            <span className="gx-label">Tu nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="gx-input"
            />
          </label>
        )}
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
        <label className="block">
          <span className="gx-label">Contraseña (mín. 8)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="gx-input"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={cargando} className="gx-btn-primary w-full">
          {cargando ? "…" : modo === "registro" ? "Crear cuenta" : "Entrar"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        {modo === "registro" ? (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/cuenta/login" className="font-medium text-marca">
              Inicia sesión
            </Link>
          </>
        ) : (
          <>
            ¿No tienes cuenta?{" "}
            <Link href="/cuenta/registro" className="font-medium text-marca">
              Regístrate
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
