import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  ApiError,
  type AreaCatalogo,
  type PermisoMeta,
  type RolePlantilla,
  crearRolePlantilla,
  editarRolePlantilla,
  esSuperadmin,
  listCatalogoPermisos,
  listRolePlantillas,
  listVerticales,
} from "../lib/api.js";

export function RolesPredefinidosPage() {
  const [verticales, setVerticales] = useState<{ value: string; label: string }[]>([]);
  const [vertical, setVertical] = useState<string>("todas");
  const [roles, setRoles] = useState<RolePlantilla[]>([]);
  const [catalogo, setCatalogo] = useState<AreaCatalogo[]>([]);
  const [editar, setEditar] = useState<RolePlantilla | "nuevo" | null>(null);

  useEffect(() => {
    listVerticales()
      .then(setVerticales)
      .catch(() => setVerticales([]));
    listCatalogoPermisos()
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  const cargar = useCallback(() => {
    listRolePlantillas(vertical)
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [vertical]);
  useEffect(() => cargar(), [cargar]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Roles predefinidos</h1>
          <p className="text-slate-500 text-sm">
            Los gobiernas tú por vertical; cada negocio ve los de su vertical (solo lectura).
          </p>
        </div>
        {esSuperadmin() && (
          <button type="button" onClick={() => setEditar("nuevo")} className="gx-btn-primary">
            + Nuevo rol predefinido
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {verticales.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setVertical(v.value)}
            className={`rounded-full px-3 py-1 text-sm ${
              vertical === v.value
                ? "bg-brand text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Rol</th>
              <th className="gx-th">Código</th>
              <th className="gx-th">Permisos</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td className="gx-td text-slate-400" colSpan={5}>
                  Sin roles para esta vertical.
                </td>
              </tr>
            ) : (
              roles.map((r) => (
                <tr key={r.id} className={r.activo ? "" : "opacity-50"}>
                  <td className="gx-td font-medium">{r.nombre}</td>
                  <td className="gx-td text-slate-500">{r.codigo}</td>
                  <td className="gx-td">
                    {r.permisos.includes("*") ? "todos" : r.permisos.length}
                  </td>
                  <td className="gx-td">
                    <span className={r.activo ? "gx-badge-ok" : "gx-badge-info"}>
                      {r.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="gx-td text-right">
                    <button
                      type="button"
                      onClick={() => setEditar(r)}
                      className="font-semibold text-brand text-sm hover:underline"
                    >
                      {esSuperadmin() ? "Editar" : "Ver"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editar && (
        <RolPlantillaModal
          rol={editar === "nuevo" ? null : editar}
          verticalActual={vertical}
          verticales={verticales}
          catalogo={catalogo}
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

function RolPlantillaModal({
  rol,
  verticalActual,
  verticales,
  catalogo,
  onClose,
  onSaved,
}: {
  rol: RolePlantilla | null;
  verticalActual: string;
  verticales: { value: string; label: string }[];
  catalogo: AreaCatalogo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const soloLectura = !esSuperadmin();
  const [vertical, setVertical] = useState(rol?.vertical ?? verticalActual);
  const [codigo, setCodigo] = useState(rol?.codigo ?? "");
  const [nombre, setNombre] = useState(rol?.nombre ?? "");
  const [permisos, setPermisos] = useState<Set<string>>(new Set(rol?.permisos ?? []));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tieneWildcard = permisos.has("*");

  function togglePermiso(code: string) {
    setPermisos((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }
  function toggleCategoria(perms: PermisoMeta[], todos: boolean) {
    setPermisos((prev) => {
      const next = new Set(prev);
      for (const p of perms) todos ? next.add(p.code) : next.delete(p.code);
      return next;
    });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const lista = [...permisos];
      if (rol) {
        await editarRolePlantilla(rol.id, { nombre, permisos: lista });
      } else {
        await crearRolePlantilla({ vertical, codigo, nombre, permisos: lista });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <form onSubmit={guardar} className="gx-modal-panel max-w-2xl">
        <h2 className="mb-4 font-bold text-lg text-slate-800">
          {rol
            ? soloLectura
              ? `Rol ${rol.nombre}`
              : `Editar ${rol.nombre}`
            : "Nuevo rol predefinido"}
        </h2>

        {!rol && (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="gx-label">Vertical</span>
              <select
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                className="gx-input"
              >
                {verticales.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="gx-label">Código</span>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="gx-input"
              />
            </label>
            <label className="block">
              <span className="gx-label">Nombre</span>
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

        {tieneWildcard ? (
          <p className="rounded-lg bg-info-light p-3 text-info text-sm">
            Este rol tiene <strong>todos los permisos</strong> (acceso total).
          </p>
        ) : (
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {catalogo.map((area) => (
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

        {error && <p className="mt-3 text-danger text-sm">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            {soloLectura ? "Cerrar" : "Cancelar"}
          </button>
          {!soloLectura && (
            <button
              type="submit"
              disabled={guardando || !nombre || (!rol && !codigo)}
              className="gx-btn-primary"
            >
              {guardando ? "Guardando…" : "Guardar (propaga a todos)"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

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
  const [abierto, setAbierto] = useState(area.area === "general");
  const todas = area.categorias.flatMap((c) => c.permisos);
  const marcadas = todas.filter((p) => permisos.has(p.code)).length;

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
