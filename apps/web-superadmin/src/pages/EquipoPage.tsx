import { PLATFORM_PERMISSIONS, platformPermissions } from "@gaespos/permissions";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface Admin {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  extraPermissions: string[];
  mfaVerifiedAt: string | null;
  lastLoginAt: string | null;
}

const ROLES = [
  { value: "superadmin", label: "Super-admin" },
  { value: "support", label: "Soporte" },
  { value: "billing", label: "Cobranza" },
];
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

export function EquipoPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [editar, setEditar] = useState<Admin | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<Admin[]>("/admin/team")
      .then(setAdmins)
      .catch(() => setAdmins([]));
  }, []);

  useEffect(() => cargar(), [cargar]);

  async function resetPassword(a: Admin) {
    const pwd = window.prompt(`Nueva contraseña para ${a.email} (mín. 10 caracteres):`);
    if (!pwd) return;
    try {
      await api(`/admin/team/${a.id}/reset-password`, { body: { password: pwd } });
      setError(null);
      window.alert("Contraseña actualizada.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al resetear contraseña");
    }
  }

  async function resetMfa(a: Admin) {
    if (!window.confirm(`¿Resetear el 2FA de ${a.email}? Tendrá que re-enrolar al entrar.`)) return;
    try {
      await api(`/admin/team/${a.id}/reset-mfa`, { method: "POST" });
      setError(null);
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al resetear 2FA");
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-slate-800">Equipo GaesSoft</h1>
        <button type="button" onClick={() => setNuevo(true)} className="gx-btn-primary">
          + Nuevo admin
        </button>
      </div>

      {error && <p className="mb-4 text-danger text-sm">{error}</p>}

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Nombre</th>
              <th className="gx-th">Correo</th>
              <th className="gx-th">Rol</th>
              <th className="gx-th">2FA</th>
              <th className="gx-th">Último acceso</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className={a.active ? "" : "opacity-50"}>
                <td className="gx-td font-medium">{a.name}</td>
                <td className="gx-td">{a.email}</td>
                <td className="gx-td">
                  <span className="gx-badge-info">{ROLE_LABEL[a.role] ?? a.role}</span>
                </td>
                <td className="gx-td">
                  {a.mfaVerifiedAt ? (
                    <span className="gx-badge-ok">Activo</span>
                  ) : (
                    <span className="gx-badge-warn">Pendiente</span>
                  )}
                </td>
                <td className="gx-td text-slate-500">
                  {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleDateString("es-MX") : "—"}
                </td>
                <td className="gx-td">
                  <div className="flex flex-wrap justify-end gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setEditar(a)}
                      className="font-semibold text-brand hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => resetPassword(a)}
                      className="text-slate-500 hover:underline"
                    >
                      Contraseña
                    </button>
                    <button
                      type="button"
                      onClick={() => resetMfa(a)}
                      className="text-slate-500 hover:underline"
                    >
                      Reset 2FA
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nuevo && (
        <AdminModal
          onClose={() => setNuevo(false)}
          onDone={() => {
            setNuevo(false);
            setError(null);
            cargar();
          }}
        />
      )}
      {editar && (
        <AdminModal
          admin={editar}
          onClose={() => setEditar(null)}
          onDone={() => {
            setEditar(null);
            setError(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function AdminModal({
  admin,
  onClose,
  onDone,
}: {
  admin?: Admin;
  onClose: () => void;
  onDone: () => void;
}) {
  const esEdicion = Boolean(admin);
  const [email, setEmail] = useState(admin?.email ?? "");
  const [name, setName] = useState(admin?.name ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(admin?.role ?? "support");
  const [extraPermissions, setExtraPermissions] = useState<string[]>(admin?.extraPermissions ?? []);
  const [active, setActive] = useState(admin?.active ?? true);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setErr(null);
    try {
      if (esEdicion && admin) {
        await api(`/admin/team/${admin.id}`, {
          method: "PATCH",
          body: { name, role, active, extraPermissions },
        });
      } else {
        await api("/admin/team", { body: { email, name, password, role, extraPermissions } });
      }
      onDone();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Error al guardar");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <form onSubmit={guardar} className="gx-modal-panel max-h-[90dvh] overflow-y-auto">
        <h2 className="mb-4 font-bold text-lg text-slate-800">
          {esEdicion ? "Editar admin" : "Nuevo admin"}
        </h2>

        {!esEdicion && (
          <label className="mb-3 block">
            <span className="gx-label">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="gx-input"
              required
            />
          </label>
        )}
        <label className="mb-3 block">
          <span className="gx-label">Nombre</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="gx-input"
            required
          />
        </label>
        {!esEdicion && (
          <label className="mb-3 block">
            <span className="gx-label">Contraseña (mín. 10)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              className="gx-input"
              required
            />
          </label>
        )}
        <label className="mb-3 block">
          <span className="gx-label">Rol</span>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setExtraPermissions([]);
            }}
            className="gx-input"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="mb-4 rounded-xl border border-slate-200 p-3">
          <legend className="px-1 font-semibold text-sm">Accesos adicionales</legend>
          <p className="mb-3 text-slate-500 text-xs">
            El rol incluye sus permisos mínimos. Solo un superadministrador puede añadir o retirar
            estos accesos. Al cambiar de rol se limpian los accesos adicionales.
          </p>
          {role === "superadmin" ? (
            <p className="text-sm">Acceso completo a la plataforma.</p>
          ) : (
            <div className="space-y-3">
              {PLATFORM_PERMISSIONS.map((permission) => {
                const base = platformPermissions(role).includes(permission.code);
                const included = platformPermissions(role, extraPermissions).includes(
                  permission.code,
                );
                const implied = included && !base && !extraPermissions.includes(permission.code);
                return (
                  <label key={permission.code} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={base || implied || guardando}
                      checked={included}
                      onChange={(e) =>
                        setExtraPermissions((values) =>
                          e.target.checked
                            ? [...values, permission.code]
                            : values.filter((value) => value !== permission.code),
                        )
                      }
                    />
                    <span>
                      <span className="font-medium">
                        {permission.label}
                        {base ? " · incluido en el rol" : ""}
                      </span>
                      <span className="block text-slate-500 text-xs">{permission.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-slate-500 text-xs">
            Administrar el equipo, consultar la auditoría y aprobar incidentes requiere el rol
            Superadministrador.
          </p>
        </fieldset>
        {esEdicion && (
          <label className="mb-3 flex items-center gap-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span className="text-slate-700 text-sm">Activo</span>
          </label>
        )}

        {err && <p className="mb-3 text-danger text-sm">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="gx-btn-primary">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
