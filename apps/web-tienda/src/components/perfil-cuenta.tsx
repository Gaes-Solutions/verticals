"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

interface Me {
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
}

/** Editar perfil + cambiar contraseña desde la cuenta del cliente. */
export function PerfilCuenta({ me }: { me: Me }) {
  const router = useRouter();
  const perfilPending = useRef(false);
  const pwPending = useRef(false);
  const [perfilBusy, setPerfilBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [nombre, setNombre] = useState(me.nombre);
  const [apellidos, setApellidos] = useState(me.apellidos ?? "");
  const [telefono, setTelefono] = useState(me.telefono ?? "");
  const [perfilMsg, setPerfilMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function guardarPerfil(e: FormEvent) {
    e.preventDefault();
    if (perfilPending.current) return;
    perfilPending.current = true;
    setPerfilBusy(true);
    setPerfilMsg(null);
    try {
      const res = await fetch("/api/cuenta/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          nombre: nombre.trim(),
          apellidos: apellidos.trim(),
          telefono: telefono.trim(),
        }),
      });
      if (!res.ok)
        throw new Error(
          res.status === 401
            ? "Tu sesión venció. Inicia sesión de nuevo para guardar."
            : "No pudimos guardar tus datos. Vuelve a intentarlo.",
        );
      setPerfilMsg({ ok: true, texto: "Datos guardados" });
      router.refresh();
    } catch (error) {
      setPerfilMsg({
        ok: false,
        texto:
          error instanceof Error && error.name === "Error"
            ? error.message
            : "No pudimos confirmar el guardado. Revisa tu conexión y vuelve a intentarlo.",
      });
    } finally {
      perfilPending.current = false;
      setPerfilBusy(false);
    }
  }

  async function cambiarPassword(e: FormEvent) {
    e.preventDefault();
    if (pwPending.current) return;
    pwPending.current = true;
    setPwBusy(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/cuenta/cambiar-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ actual, nueva }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setPwMsg({
          ok: false,
          texto:
            res.status === 401
              ? "Tu sesión venció. Inicia sesión de nuevo."
              : typeof d?.message === "string"
                ? d.message
                : "No pudimos cambiar la contraseña. Verifica tu contraseña actual.",
        });
        return;
      }
      setPwMsg({ ok: true, texto: "Contraseña actualizada" });
      setActual("");
      setNueva("");
    } catch {
      setPwMsg({
        ok: false,
        texto: "No pudimos confirmar el cambio. Revisa tu conexión y vuelve a intentarlo.",
      });
    } finally {
      pwPending.current = false;
      setPwBusy(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <form onSubmit={guardarPerfil} className="gx-card !p-4">
        <h3 className="mb-3 font-medium">Mis datos</h3>
        <div className="space-y-2">
          <label className="block">
            <span className="gx-label">Nombre</span>
            <input
              autoComplete="given-name"
              maxLength={120}
              disabled={perfilBusy}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Apellidos</span>
            <input
              autoComplete="family-name"
              maxLength={120}
              disabled={perfilBusy}
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Teléfono</span>
            <input
              type="tel"
              autoComplete="tel"
              maxLength={20}
              disabled={perfilBusy}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="gx-input"
            />
          </label>
          <p className="break-all text-slate-400 text-xs">Correo: {me.email}</p>
        </div>
        <button
          type="submit"
          disabled={perfilBusy}
          className="gx-btn-primary mt-3 disabled:opacity-50"
        >
          {perfilBusy ? "Guardando…" : "Guardar"}
        </button>
        {perfilMsg && (
          <p
            role={perfilMsg.ok ? "status" : "alert"}
            className={`mt-2 text-sm ${perfilMsg.ok ? "text-ok" : "text-danger"}`}
          >
            {perfilMsg.texto}
          </p>
        )}
      </form>

      <form onSubmit={cambiarPassword} className="gx-card !p-4">
        <h3 className="mb-3 font-medium">Cambiar contraseña</h3>
        <div className="space-y-2">
          <label className="block">
            <span className="gx-label">Contraseña actual</span>
            <input
              type="password"
              autoComplete="current-password"
              disabled={pwBusy}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              required
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Nueva (mín. 8)</span>
            <input
              type="password"
              autoComplete="new-password"
              maxLength={100}
              disabled={pwBusy}
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              required
              minLength={8}
              className="gx-input"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={pwBusy}
          className="gx-btn-secondary mt-3 disabled:opacity-50"
        >
          {pwBusy ? "Actualizando…" : "Actualizar"}
        </button>
        {pwMsg && (
          <p
            role={pwMsg.ok ? "status" : "alert"}
            className={`mt-2 text-sm ${pwMsg.ok ? "text-ok" : "text-danger"}`}
          >
            {pwMsg.texto}
          </p>
        )}
      </form>
    </div>
  );
}
