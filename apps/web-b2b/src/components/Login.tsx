import { type FormEvent, useState } from "react";
import type { B2bSession } from "../App.js";
import { ApiError, api, setToken } from "../lib/api.js";
import type { Marca } from "../lib/marca.js";
import type { LoginResponse } from "../lib/types.js";

const SLUG_KEY = "gaespos_b2b_slug";

/** En producción el slug sale del subdominio (negocio.gaessoft.mx); en localhost/IP se pide. */
function tenantDeSubdominio(): string | null {
  const host = window.location.hostname;
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split(".");
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (!sub || ["www", "admin", "app", "b2b", "mayoreo"].includes(sub)) return null;
  return sub;
}

export function Login({
  onLogin,
  marca,
}: {
  onLogin: (s: B2bSession) => void;
  marca: Marca | null;
}) {
  const slugFijo = marca?.tenantSlug ?? tenantDeSubdominio();
  const titulo = marca?.nombre ?? "Portal Mayorista";
  const [tenantSlug, setTenantSlug] = useState(slugFijo ?? localStorage.getItem(SLUG_KEY) ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<LoginResponse>("/auth/cliente-b2b/login", {
        auth: false,
        body: { tenantSlug, email, password },
      });
      setToken(res.accessToken);
      localStorage.setItem(SLUG_KEY, tenantSlug);
      onLogin({
        nombre: res.usuario.nombre,
        rol: res.usuario.rol,
        empresa: res.empresa.razonSocial,
      });
    } catch (err) {
      setToken(null);
      setError(
        err instanceof ApiError && err.status === 401
          ? "Credenciales inválidas"
          : err instanceof Error
            ? err.message
            : "Error al iniciar sesión",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-2xl font-bold text-brand">{titulo}</h1>
        <p className="mb-6 text-sm text-slate-500">Acceso para clientes</p>

        {slugFijo ? (
          marca ? null : (
            <p className="mb-4 rounded-lg bg-brand/5 px-3 py-2 text-sm text-slate-600">
              Negocio: <span className="font-semibold text-brand">{slugFijo}</span>
            </p>
          )
        ) : (
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Negocio (slug)</span>
            <input
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              autoCapitalize="none"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            />
          </label>
        )}
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
        </label>

        {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
