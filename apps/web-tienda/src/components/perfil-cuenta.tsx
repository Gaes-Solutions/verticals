"use client";

import { errorPerfil, esGuardadoCuenta } from "@/lib/perfil-contract";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

interface Me {
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
}

/** A password timeout is ambiguous: never retry it automatically. */
function useGuardarCuenta(password: boolean) {
  const configuracion = password
    ? { endpoint: "cambiar-password", method: "POST", exito: "Contraseña actualizada" }
    : { endpoint: "perfil", method: "PUT", exito: "Datos guardados" };
  const pendiente = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [incierto, setIncierto] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(
    () => () => {
      pendiente.current?.abort();
      pendiente.current = null;
    },
    [],
  );
  function reportarFallo(c: AbortController, status: number) {
    if (!c.signal.aborted && pendiente.current === c) {
      setMsg({ ok: false, texto: errorPerfil(status, password) });
      if (password && status !== 400 && status !== 401 && status !== 403 && status !== 429)
        setIncierto(true);
    }
  }
  async function guardar(body: Record<string, string>) {
    if (pendiente.current || incierto) return false;
    const c = new AbortController();
    pendiente.current = c;
    setBusy(true);
    setMsg(null);
    let status = 503;
    try {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(20000)]);
      const res = await fetch(`/api/cuenta/${configuracion.endpoint}`, {
        method: configuracion.method,
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal,
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => null);
      signal.throwIfAborted();
      status = res.ok ? 502 : res.status;
      if (!res.ok || !esGuardadoCuenta(data)) throw new Error("unconfirmed");
      setMsg({ ok: true, texto: configuracion.exito });
      return true;
    } catch {
      reportarFallo(c, status);
      return false;
    } finally {
      if (pendiente.current === c) {
        pendiente.current = null;
        setBusy(false);
      }
    }
  }
  return { busy, incierto, msg, guardar };
}

/** Editar perfil + cambiar contraseña desde la cuenta del cliente. */
export function PerfilCuenta({ me }: { me: Me }) {
  const router = useRouter();
  const perfil = useGuardarCuenta(false);
  const pw = useGuardarCuenta(true);
  const { busy: perfilBusy, msg: perfilMsg } = perfil;
  const { busy: pwBusy, msg: pwMsg } = pw;
  const [nombre, setNombre] = useState(me.nombre);
  const [apellidos, setApellidos] = useState(me.apellidos ?? "");
  const [telefono, setTelefono] = useState(me.telefono ?? "");
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  async function guardarPerfil(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    if (
      await perfil.guardar({
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
        telefono: telefono.trim(),
      })
    ) {
      // Refresh is separate from persistence: a failed refresh must not negate a confirmed save.
      try {
        router.refresh();
      } catch {
        /* The confirmed receipt remains visible. */
      }
    }
  }
  async function cambiarPassword(e: FormEvent) {
    e.preventDefault();
    if (nueva !== confirmacion) return;
    if (await pw.guardar({ actual, nueva })) {
      setActual("");
      setNueva("");
      setConfirmacion("");
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
              onChange={(e) => {
                setNombre(e.target.value);
                e.target.setCustomValidity(e.target.value.trim() ? "" : "Escribe tu nombre.");
              }}
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
          className="gx-btn-primary mt-3 min-h-11 disabled:opacity-50"
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
              disabled={pwBusy || pw.incierto}
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
              disabled={pwBusy || pw.incierto}
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              required
              minLength={8}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Confirma la nueva contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              maxLength={100}
              disabled={pwBusy || pw.incierto}
              value={confirmacion}
              required
              minLength={8}
              onChange={(e) => {
                setConfirmacion(e.target.value);
                e.target.setCustomValidity(
                  e.target.value === nueva ? "" : "Las contraseñas no coinciden.",
                );
              }}
              ref={(el) => {
                if (el)
                  el.setCustomValidity(
                    confirmacion === nueva ? "" : "Las contraseñas no coinciden.",
                  );
              }}
              className="gx-input"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={pwBusy || pw.incierto}
          className="gx-btn-secondary mt-3 min-h-11 disabled:opacity-50"
        >
          {pwBusy ? "Actualizando…" : "Actualizar"}
        </button>
        {pw.incierto && (
          <a
            href="/cuenta/login?next=%2Fcuenta"
            className="mt-3 flex min-h-11 items-center underline"
          >
            Verificar mi acceso
          </a>
        )}
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
