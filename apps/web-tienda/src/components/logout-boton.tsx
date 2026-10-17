"use client";

import { borrarBorradorCompra } from "@/lib/checkout-draft";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function LogoutBoton() {
  const router = useRouter();
  const pendiente = useRef(false);
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function salir() {
    if (pendiente.current) return;
    pendiente.current = true;
    setSaliendo(true);
    setError(null);
    try {
      const res = await fetch("/api/cuenta/logout", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error("logout");
      borrarBorradorCompra();
      router.push("/");
      router.refresh();
    } catch {
      setError("No se pudo cerrar la sesión. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      pendiente.current = false;
      setSaliendo(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={salir} disabled={saliendo} className="gx-btn-ghost">
        {saliendo ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
