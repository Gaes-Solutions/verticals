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
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre"
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-marca focus:outline-none"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Correo"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-marca focus:outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña (mín. 8)"
          required
          minLength={8}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-marca focus:outline-none"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded-lg bg-marca py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {cargando ? "…" : modo === "registro" ? "Crear cuenta" : "Entrar"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
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
