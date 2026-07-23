import { useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";

interface Rol {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  isPreset: boolean;
  isActive: boolean;
  permisos: string[];
}

interface Usuario {
  id: string;
  email: string;
  nombre: string;
  isActive: boolean;
  roles: { id: string; codigo: string; nombre: string }[];
}

type PermisoMeta = { code: string; category: string; description: string };
interface AreaCatalogo {
  area: string;
  label: string;
  aplica: boolean;
  categorias: { categoria: string; permisos: PermisoMeta[] }[];
}
interface Catalogo {
  verticalActual: string | null;
  areas: AreaCatalogo[];
}
interface Plantilla {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  area: string;
  permisos: string[];
}

const AREA_LABEL_UI: Record<string, string> = {
  general: "General",
  tienda: "Tienda",
  abarrotes: "Abarrotes",
  salud: "Salud",
  despacho: "Despacho",
};

export function UsuariosRolesPage() {
  const [tab, setTab] = useState<"usuarios" | "roles">("usuarios");
  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Usuarios y permisos</h1>
      <p className="mb-6 text-sm text-slate-500">
        Da de alta a tu equipo (cajeros, vendedores…), asígnales roles y define qué puede hacer cada
        rol.
      </p>
      <div className="mb-6 flex flex-wrap gap-2">
        <BotonTab activo={tab === "usuarios"} onClick={() => setTab("usuarios")} label="Usuarios" />
        <BotonTab
          activo={tab === "roles"}
          onClick={() => setTab("roles")}
          label="Roles y permisos"
        />
      </div>
      {tab === "usuarios" ? <UsuariosTab /> : <RolesTab />}
    </div>
  );
}

function BotonTab({
  activo,
  onClick,
  label,
}: {
  activo: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm font-medium ${
        activo
          ? "border-brand bg-brand/5 text-brand"
          : "border-slate-200 text-slate-600 hover:border-brand"
      }`}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Usuarios
// ─────────────────────────────────────────────────────────────────────────────

function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [rolesDe, setRolesDe] = useState<Usuario | null>(null);

  const cargar = useCallback(() => {
    api<Usuario[]>("/t/usuarios")
      .then(setUsuarios)
      .catch(() => setUsuarios([]));
    api<Rol[]>("/t/roles")
      .then(setRoles)
      .catch(() => setRoles([]));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function toggleActivo(u: Usuario) {
    setError(null);
    try {
      if (u.isActive) await api(`/t/usuarios/${u.id}`, { method: "DELETE" });
      else await api(`/t/usuarios/${u.id}`, { method: "PATCH", body: { isActive: true } });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error");
    }
  }

  async function resetPassword(u: Usuario) {
    const newPassword = window.prompt(`Nueva contraseña para ${u.nombre} (mínimo 8 caracteres):`);
    if (!newPassword) return;
    setError(null);
    try {
      await api(`/t/usuarios/${u.id}/reset-password`, { body: { newPassword } });
      window.alert("Contraseña actualizada.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error");
    }
  }

  return (
    <div>
      {puede("usuarios.crear") && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            data-tour="user-nuevo"
            onClick={() => setCreando(true)}
            className="gx-btn-primary"
          >
            + Nuevo usuario
          </button>
        </div>
      )}
      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Nombre</th>
              <th className="gx-th">Correo</th>
              <th className="gx-th">Roles</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td className="gx-td font-medium">{u.nombre}</td>
                <td className="gx-td text-slate-500">{u.email}</td>
                <td className="gx-td">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span key={r.id} className="gx-badge-info">
                        {r.nombre}
                      </span>
                    ))}
                    {u.roles.length === 0 && (
                      <span className="text-xs text-slate-400">sin rol</span>
                    )}
                  </div>
                </td>
                <td className="gx-td">
                  <span className={u.isActive ? "gx-badge-ok" : "gx-badge-danger"}>
                    {u.isActive ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="gx-td text-right">
                  <div className="flex flex-wrap justify-end gap-2 text-xs">
                    {puede("usuarios.asignar_rol") && (
                      <button
                        type="button"
                        onClick={() => setRolesDe(u)}
                        className="text-brand hover:underline"
                      >
                        Roles
                      </button>
                    )}
                    {puede("usuarios.reset_password") && (
                      <button
                        type="button"
                        onClick={() => resetPassword(u)}
                        className="text-brand hover:underline"
                      >
                        Contraseña
                      </button>
                    )}
                    {puede("usuarios.archivar") && (
                      <button
                        type="button"
                        onClick={() => toggleActivo(u)}
                        className={
                          u.isActive ? "text-danger hover:underline" : "text-ok hover:underline"
                        }
                      >
                        {u.isActive ? "Desactivar" : "Activar"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="gx-td py-8 text-center text-slate-400">
                  Sin usuarios todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {creando && (
        <NuevoUsuarioModal
          roles={roles}
          onClose={() => setCreando(false)}
          onCreado={() => {
            setCreando(false);
            cargar();
          }}
        />
      )}
      {rolesDe && (
        <RolesUsuarioModal
          usuario={rolesDe}
          roles={roles}
          onClose={() => setRolesDe(null)}
          onChanged={() => {
            setRolesDe(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function NuevoUsuarioModal({
  roles,
  onClose,
  onCreado,
}: {
  roles: Rol[];
  onClose: () => void;
  onCreado: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rolId, setRolId] = useState(roles.find((r) => r.codigo === "cajero")?.id ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setGuardando(true);
    setError(null);
    try {
      await api("/t/usuarios", {
        body: { nombre, email, password, rolIds: rolId ? [rolId] : [] },
      });
      onCreado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear usuario");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-4 text-lg font-bold text-slate-800">Nuevo usuario</h2>
        <label className="mb-3 block">
          <span className="gx-label">Nombre</span>
          <input
            data-tour="user-f-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="gx-input"
          />
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Correo</span>
          <input
            type="email"
            data-tour="user-f-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="gx-input"
          />
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Contraseña (mínimo 8)</span>
          <input
            type="text"
            data-tour="user-f-pass"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="gx-input"
          />
        </label>
        <label className="mb-4 block">
          <span className="gx-label">Rol</span>
          <select value={rolId} onChange={(e) => setRolId(e.target.value)} className="gx-input">
            <option value="">— Sin rol —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-ghost">
            Cancelar
          </button>
          <button
            type="button"
            data-tour="user-f-crear"
            onClick={crear}
            disabled={guardando || !nombre || !email || password.length < 8}
            className="gx-btn-primary"
          >
            {guardando ? "Creando…" : "Crear usuario"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RolesUsuarioModal({
  usuario,
  roles,
  onClose,
  onChanged,
}: {
  usuario: Usuario;
  roles: Rol[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [asignados, setAsignados] = useState<Set<string>>(new Set(usuario.roles.map((r) => r.id)));
  const [guardando, setGuardando] = useState(false);

  async function toggle(rolId: string, checked: boolean) {
    setGuardando(true);
    try {
      if (checked) {
        await api(`/t/usuarios/${usuario.id}/roles`, { body: { rolId } });
        setAsignados((prev) => new Set(prev).add(rolId));
      } else {
        await api(`/t/usuarios/${usuario.id}/roles/${rolId}`, { method: "DELETE" });
        setAsignados((prev) => {
          const next = new Set(prev);
          next.delete(rolId);
          return next;
        });
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-1 text-lg font-bold text-slate-800">Roles de {usuario.nombre}</h2>
        <p className="mb-4 text-sm text-slate-500">Marca los roles que tendrá este usuario.</p>
        <div className="space-y-2">
          {roles.map((r) => (
            <label
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-slate-100 p-2 text-sm"
            >
              <input
                type="checkbox"
                checked={asignados.has(r.id)}
                disabled={guardando}
                onChange={(e) => toggle(r.id, e.target.checked)}
              />
              <span className="font-medium">{r.nombre}</span>
              <span className="text-xs text-slate-400">{r.codigo}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onChanged} className="gx-btn-primary">
            Listo
          </button>
          <button type="button" onClick={onClose} className="ml-2 gx-btn-ghost">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Roles
// ─────────────────────────────────────────────────────────────────────────────

function RolesTab() {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [catalogo, setCatalogo] = useState<Catalogo>({ verticalActual: null, areas: [] });
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [editar, setEditar] = useState<Rol | "nuevo" | null>(null);

  const cargar = useCallback(() => {
    api<Rol[]>("/t/roles")
      .then(setRoles)
      .catch(() => setRoles([]));
    api<Catalogo>("/t/roles/catalogo-permisos")
      .then(setCatalogo)
      .catch(() => setCatalogo({ verticalActual: null, areas: [] }));
    api<Plantilla[]>("/t/roles/plantillas")
      .then(setPlantillas)
      .catch(() => setPlantillas([]));
  }, []);
  useEffect(() => cargar(), [cargar]);

  return (
    <div>
      {puede("roles.crear") && (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => setEditar("nuevo")} className="gx-btn-primary">
            + Nuevo rol
          </button>
        </div>
      )}
      <div className="space-y-2">
        {roles.map((r) => {
          const total = r.permisos.includes("*") ? "todos" : String(r.permisos.length);
          return (
            <div
              key={r.id}
              className="gx-card flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{r.nombre}</span>
                  <span className={r.isPreset ? "gx-badge-info" : "gx-badge-ok"}>
                    {r.isPreset ? "Predefinido" : "Personalizado"}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {r.codigo} · {total} permiso(s)
                </p>
              </div>
              {(r.isPreset || puede("roles.actualizar")) && (
                <button
                  type="button"
                  onClick={() => setEditar(r)}
                  className={r.isPreset ? "gx-btn-ghost" : "gx-btn-secondary"}
                >
                  {r.isPreset ? "Ver permisos" : "Editar"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editar && (
        <RolModal
          rol={editar === "nuevo" ? null : editar}
          catalogo={catalogo}
          plantillas={plantillas}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function RolModal({
  rol,
  catalogo,
  plantillas,
  onClose,
  onSaved,
}: {
  rol: Rol | null;
  catalogo: Catalogo;
  plantillas: Plantilla[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const soloLectura = rol?.isPreset ?? false;
  const tieneWildcard = rol?.permisos.includes("*") ?? false;
  const [codigo, setCodigo] = useState(rol?.codigo ?? "");
  const [nombre, setNombre] = useState(rol?.nombre ?? "");
  const [permisos, setPermisos] = useState<Set<string>>(new Set(rol?.permisos ?? []));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function aplicarPlantilla(p: Plantilla) {
    if (!codigo) setCodigo(`${p.codigo}-custom`);
    if (!nombre) setNombre(p.nombre);
    setPermisos(new Set(p.permisos));
  }

  function togglePermiso(code: string) {
    setPermisos((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleCategoria(perms: PermisoMeta[], todos: boolean) {
    setPermisos((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (todos) next.add(p.code);
        else next.delete(p.code);
      }
      return next;
    });
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const lista = [...permisos];
      if (rol) {
        await api(`/t/roles/${rol.id}`, { method: "PATCH", body: { nombre, permisos: lista } });
      } else {
        await api("/t/roles", { body: { codigo, nombre, permisos: lista } });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar el rol");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-w-2xl">
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          {rol ? (soloLectura ? `Permisos de ${rol.nombre}` : `Editar ${rol.nombre}`) : "Nuevo rol"}
        </h2>

        {!rol && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="gx-label">Código (ej. cajero-senior)</span>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="gx-input"
              />
            </label>
            <label className="block">
              <span className="gx-label">Nombre visible</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="gx-input"
              />
            </label>
          </div>
        )}
        {rol && !soloLectura && (
          <label className="mb-4 block">
            <span className="gx-label">Nombre visible</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="gx-input"
            />
          </label>
        )}

        {!rol && plantillas.length > 0 && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 font-medium text-slate-600 text-xs">
              Empieza desde una plantilla (luego la puedes ajustar y mezclar):
            </p>
            <div className="flex flex-wrap gap-2">
              {plantillas.map((p) => (
                <button
                  key={p.codigo}
                  type="button"
                  onClick={() => aplicarPlantilla(p)}
                  title={p.descripcion ?? undefined}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-600 text-xs hover:border-brand hover:text-brand"
                >
                  {p.nombre} · {AREA_LABEL_UI[p.area] ?? p.area}
                </button>
              ))}
            </div>
          </div>
        )}

        {tieneWildcard ? (
          <p className="rounded-lg bg-info-light p-3 text-sm text-info">
            Este rol tiene <strong>todos los permisos</strong> (acceso total).
          </p>
        ) : (
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {catalogo.areas.map((area) => (
              <AreaBloque
                key={area.area}
                area={area}
                permisos={permisos}
                soloLectura={soloLectura}
                onTogglePermiso={togglePermiso}
                onToggleCategoria={toggleCategoria}
              />
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-ghost">
            {soloLectura ? "Cerrar" : "Cancelar"}
          </button>
          {!soloLectura && (
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || !nombre || (!rol && !codigo)}
              className="gx-btn-primary"
            >
              {guardando ? "Guardando…" : "Guardar rol"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Bloque colapsable de un área de negocio con sus categorías de permisos. */
function AreaBloque({
  area,
  permisos,
  soloLectura,
  onTogglePermiso,
  onToggleCategoria,
}: {
  area: AreaCatalogo;
  permisos: Set<string>;
  soloLectura: boolean;
  onTogglePermiso: (code: string) => void;
  onToggleCategoria: (perms: PermisoMeta[], todos: boolean) => void;
}) {
  // Las áreas del vertical del negocio abren por defecto; las demás (para mezclar)
  // empiezan colapsadas para no abrumar.
  const [abierto, setAbierto] = useState(area.aplica);
  const todasLasPerms = area.categorias.flatMap((c) => c.permisos);
  const marcadas = todasLasPerms.filter((p) => permisos.has(p.code)).length;

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-slate-400 text-xs">{abierto ? "▼" : "▶"}</span>
          <span className="font-bold text-slate-700 text-sm">{area.label}</span>
          {!area.aplica && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
              mezclar
            </span>
          )}
        </span>
        {marcadas > 0 && (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] text-brand">
            {marcadas} activo(s)
          </span>
        )}
      </button>

      {abierto && (
        <div className="space-y-4 border-slate-100 border-t px-3 py-3">
          {area.categorias.map(({ categoria, permisos: perms }) => {
            const todosMarcados = perms.every((p) => permisos.has(p.code));
            return (
              <div key={categoria}>
                <div className="mb-1 flex items-center justify-between">
                  <h4 className="font-semibold text-slate-600 text-xs capitalize">{categoria}</h4>
                  {!soloLectura && (
                    <button
                      type="button"
                      onClick={() => onToggleCategoria(perms, !todosMarcados)}
                      className="text-brand text-xs hover:underline"
                    >
                      {todosMarcados ? "Quitar todos" : "Marcar todos"}
                    </button>
                  )}
                </div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {perms.map((p) => (
                    <label key={p.code} className="flex items-start gap-2 text-slate-600 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={permisos.has(p.code)}
                        disabled={soloLectura}
                        onChange={() => onTogglePermiso(p.code)}
                      />
                      <span title={p.code}>{p.description}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
