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

  const input = "w-full rounded-lg border px-3 py-2 text-sm";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <form onSubmit={guardarPerfil} className="rounded-lg border bg-white p-4">
        <h3 className="mb-3 font-medium">Mis datos</h3>
        <div className="space-y-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre"
            required
            className={input}
          />
          <input
            value={apellidos}
            onChange={(e) => setApellidos(e.target.value)}
            placeholder="Apellidos"
            className={input}
          />
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Teléfono"
            className={input}
          />
          <p className="text-gray-400 text-xs">Correo: {me.email}</p>
        </div>
        <button
          type="submit"
          className="mt-3 rounded-lg bg-marca px-4 py-2 font-semibold text-sm text-white hover:opacity-90"
        >
          Guardar
        </button>
        {perfilMsg && <p className="mt-2 text-gray-500 text-sm">{perfilMsg}</p>}
      </form>

      <form onSubmit={cambiarPassword} className="rounded-lg border bg-white p-4">
        <h3 className="mb-3 font-medium">Cambiar contraseña</h3>
        <div className="space-y-2">
          <input
            type="password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            placeholder="Contraseña actual"
            required
            className={input}
          />
          <input
            type="password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            placeholder="Nueva (mín. 8)"
            required
            minLength={8}
            className={input}
          />
        </div>
        <button
          type="submit"
          className="mt-3 rounded-lg border border-marca px-4 py-2 font-semibold text-marca text-sm hover:bg-marca/5"
        >
          Actualizar
        </button>
        {pwMsg && (
          <p className={`mt-2 text-sm ${pwMsg.ok ? "text-emerald-600" : "text-red-600"}`}>
            {pwMsg.texto}
          </p>
        )}
      </form>
    </div>
  );
}
