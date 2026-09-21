"use client";

import { type FormEvent, useState } from "react";

interface Me {
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
}

/** Editar perfil + cambiar contraseña desde la cuenta del cliente. */
export function PerfilCuenta({ me }: { me: Me }) {
  const [nombre, setNombre] = useState(me.nombre);
  const [apellidos, setApellidos] = useState(me.apellidos ?? "");
  const [telefono, setTelefono] = useState(me.telefono ?? "");
  const [perfilMsg, setPerfilMsg] = useState<string | null>(null);

  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function guardarPerfil(e: FormEvent) {
    e.preventDefault();
    setPerfilMsg(null);
    const res = await fetch("/api/cuenta/perfil", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        apellidos: apellidos || undefined,
        telefono: telefono || undefined,
      }),
    });
    setPerfilMsg(res.ok ? "✓ Datos guardados" : "No se pudo guardar");
  }

  async function cambiarPassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    const res = await fetch("/api/cuenta/cambiar-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actual, nueva }),
    });
    if (res.ok) {
      setPwMsg({ ok: true, texto: "✓ Contraseña actualizada" });
      setActual("");
      setNueva("");
    } else {
      const d = (await res.json().catch(() => ({}))) as { message?: string };
      setPwMsg({ ok: false, texto: d.message ?? "No se pudo cambiar" });
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
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Apellidos</span>
            <input
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Teléfono</span>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="gx-input"
            />
          </label>
          <p className="text-slate-400 text-xs">Correo: {me.email}</p>
        </div>
        <button type="submit" className="gx-btn-primary mt-3">
          Guardar
        </button>
        {perfilMsg && <p className="mt-2 text-slate-500 text-sm">{perfilMsg}</p>}
      </form>

      <form onSubmit={cambiarPassword} className="gx-card !p-4">
        <h3 className="mb-3 font-medium">Cambiar contraseña</h3>
        <div className="space-y-2">
          <label className="block">
            <span className="gx-label">Contraseña actual</span>
            <input
              type="password"
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
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              required
              minLength={8}
              className="gx-input"
            />
          </label>
        </div>
        <button type="submit" className="gx-btn-secondary mt-3">
          Actualizar
        </button>
        {pwMsg && (
          <p className={`mt-2 text-sm ${pwMsg.ok ? "text-ok" : "text-danger"}`}>{pwMsg.texto}</p>
        )}
      </form>
    </div>
  );
}
