import { type FormEvent, useState } from "react";
import type { Session } from "../App.js";
import { ApiError, api, setToken } from "../lib/api.js";
import { resolverSession } from "../lib/session.js";
import type { LoginResponse } from "../lib/types.js";

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<LoginResponse>("/auth/tenant/login", {
        auth: false,
        body: { tenantSlug, email, password },
      });
      setToken(res.accessToken);
      onLogin(await resolverSession(res.user.nombre));
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
        <h1 className="mb-1 text-2xl font-bold text-brand">GaesSoft POS</h1>
        <p className="mb-6 text-sm text-slate-500">Inicia sesión para vender</p>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Negocio (slug)</span>
          <input
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            autoCapitalize="none"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            placeholder="mi-negocio"
            required
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            required
          />
        </label>

        <label className="mb-5 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            required
          />
        </label>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

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
