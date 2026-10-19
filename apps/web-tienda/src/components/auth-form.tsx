"use client";

import { destinoTrasLogin } from "@/lib/auth-return";
import { ArrowRight, Eye, EyeOff, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PasskeyLogin } from "./customer-passkeys";

export function AuthForm({
  modo,
  destino,
}: { modo: "login" | "registro"; destino?: string | undefined }) {
  const router = useRouter();
  const pending = useRef(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const passkeyPending = useRef(false);
  function handlePasskeyBusy(busy: boolean) {
    passkeyPending.current = busy;
    setPasskeyBusy(busy);
  }
  const siguiente = destinoTrasLogin(destino);
  const retorno = siguiente === "/cuenta" ? "" : `?next=${encodeURIComponent(siguiente)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current || passkeyPending.current) return;
    pending.current = true;
    setError(null);
    setCargando(true);
    try {
      const res = await fetch(`/api/cuenta/${modo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(
          modo === "registro" ? { nombre, email, password } : { email, password },
        ),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || typeof d?.cliente?.id !== "string" || !d.cliente.id) {
        setError(
          typeof d?.message === "string"
            ? d.message
            : "No pudimos confirmar el acceso. Inténtalo de nuevo.",
        );
        return;
      }
      router.push(siguiente);
      router.refresh();
    } catch {
      setError("No pudimos confirmar el acceso. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      pending.current = false;
      setCargando(false);
    }
  }

  return (
    <div className="store-auth">
      <aside className="store-auth-story">
        <ShoppingBag size={42} strokeWidth={1.3} />
        <p className="store-eyebrow">TU ESPACIO EN LA TIENDA</p>
        <h2>
          Tus favoritos. <br />
          Tus pedidos. <br />
          Todo contigo.
        </h2>
        <p>Guarda tus direcciones, consulta tus compras y retoma lo que te gusta cuando quieras.</p>
        <Link href="/">
          Seguir explorando <ArrowRight size={17} />
        </Link>
      </aside>
      <div className="store-auth-form">
        <p className="store-kicker">{modo === "registro" ? "EMPECEMOS" : "QUÉ BUENO VERTE"}</p>
        <h1 className="mb-6 text-2xl font-bold">
          {modo === "registro" ? "Crear cuenta" : "Iniciar sesión"}
        </h1>
        {siguiente === "/checkout" && (
          <p className="mb-5 text-sm text-slate-600">
            Inicia sesión para retomar tu compra. Conservamos tu carrito y los datos de este
            formulario durante 30 minutos en esta pestaña.
          </p>
        )}
        <form onSubmit={submit} className="space-y-5">
          {modo === "registro" && (
            <label className="block">
              <span className="gx-label">Tu nombre</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                disabled={cargando || passkeyBusy}
                autoComplete="name"
                className="gx-input"
              />
            </label>
          )}
          <label className="block">
            <span className="gx-label">Correo</span>
            <input
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={cargando || passkeyBusy}
              className="gx-input"
            />
          </label>
          <div>
            <label htmlFor="account-password" className="gx-label">
              Contraseña
            </label>
            <span className="relative block">
              <input
                id="account-password"
                type={mostrarPassword ? "text" : "password"}
                autoComplete={modo === "registro" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={cargando || passkeyBusy}
                minLength={8}
                className="gx-input !pr-12"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword(!mostrarPassword)}
                aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-1 top-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500"
              >
                {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
            {modo === "registro" && (
              <span className="mt-1 block text-xs text-slate-500">Usa al menos 8 caracteres.</span>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={cargando || passkeyBusy}
            className="gx-btn-primary w-full"
          >
            {cargando ? "Procesando…" : modo === "registro" ? "Crear cuenta" : "Entrar"}
          </button>
          {modo === "login" && (
            <p className="text-right text-sm">
              <Link href="/cuenta/olvidar-contrasena" className="font-medium text-marca">
                ¿Olvidaste tu contraseña?
              </Link>
            </p>
          )}
        </form>
        {modo === "login" && (
          <PasskeyLogin destino={destino} disabled={cargando} onBusyChange={handlePasskeyBusy} />
        )}
        <p className="mt-4 text-center text-sm text-slate-500">
          {modo === "registro" ? (
            <>
              ¿Ya tienes cuenta?{" "}
              <Link href={`/cuenta/login${retorno}`} className="font-medium text-marca">
                Inicia sesión
              </Link>
            </>
          ) : (
            <>
              ¿No tienes cuenta?{" "}
              <Link href={`/cuenta/registro${retorno}`} className="font-medium text-marca">
                Regístrate
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
