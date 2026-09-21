"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

export interface Direccion {
  id: string;
  etiqueta: string;
  calle: string;
  numeroExterior: string | null;
  colonia: string | null;
  municipio: string | null;
  estado: string | null;
  codigoPostal: string | null;
  referencias: string | null;
  isDefaultEnvio: boolean;
}

const VACIA = {
  etiqueta: "",
  calle: "",
  numeroExterior: "",
  colonia: "",
  municipio: "",
  estado: "",
  codigoPostal: "",
  referencias: "",
  isDefaultEnvio: false,
};

/** CRUD de direcciones guardadas del cliente (checkout rápido). */
export function DireccionesCuenta() {
  const [dirs, setDirs] = useState<Direccion[]>([]);
  const [form, setForm] = useState({ ...VACIA });
  const [editId, setEditId] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = (await fetch("/api/cuenta/direcciones").then((x) => x.json())) as Direccion[];
    setDirs(Array.isArray(r) ? r : []);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function editar(d: Direccion) {
    setEditId(d.id);
    setForm({
      etiqueta: d.etiqueta,
      calle: d.calle,
      numeroExterior: d.numeroExterior ?? "",
      colonia: d.colonia ?? "",
      municipio: d.municipio ?? "",
      estado: d.estado ?? "",
      codigoPostal: d.codigoPostal ?? "",
      referencias: d.referencias ?? "",
      isDefaultEnvio: d.isDefaultEnvio,
    });
    setAbierto(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const url = editId ? `/api/cuenta/direcciones/${editId}` : "/api/cuenta/direcciones";
    const res = await fetch(url, {
      method: editId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setError("Revisa los datos (CP de 5 dígitos, estado y calle).");
      return;
    }
    setAbierto(false);
    setEditId(null);
    setForm({ ...VACIA });
    cargar();
  }

  async function borrar(id: string) {
    await fetch(`/api/cuenta/direcciones/${id}`, { method: "DELETE" });
    setConfirmandoId(null);
    cargar();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-lg">Mis direcciones</h2>
        <button
          type="button"
          onClick={() => {
            setEditId(null);
            setForm({ ...VACIA });
            setAbierto(true);
          }}
          className="gx-btn-primary"
        >
          + Agregar
        </button>
      </div>

      {dirs.length === 0 ? (
        <p className="text-slate-500 text-sm">Aún no guardas direcciones.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {dirs.map((d) => (
            <div key={d.id} className="gx-card !p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{d.etiqueta}</span>
                {d.isDefaultEnvio && <span className="gx-badge-info">Predeterminada</span>}
              </div>
              <p className="mt-1 text-slate-600">
                {d.calle} {d.numeroExterior}, {d.colonia}, {d.municipio}, {d.estado} CP{" "}
                {d.codigoPostal}
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => editar(d)} className="gx-btn-ghost">
                  Editar
                </button>
                {confirmandoId === d.id ? (
                  <button type="button" onClick={() => borrar(d.id)} className="gx-btn-danger">
                    ¿Seguro? Sí, eliminar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmandoId(d.id)}
                    className="gx-btn-danger"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {abierto && (
        <div className="gx-modal-overlay">
          <form onSubmit={guardar} className="gx-modal-panel space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{editId ? "Editar" : "Nueva"} dirección</h3>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="gx-btn-ghost !px-2"
              >
                ✕
              </button>
            </div>
            {(
              [
                ["etiqueta", "Etiqueta (Casa, Oficina…)"],
                ["calle", "Calle"],
                ["numeroExterior", "Número"],
                ["colonia", "Colonia"],
                ["municipio", "Ciudad / Municipio"],
                ["estado", "Estado"],
                ["codigoPostal", "Código postal"],
                ["referencias", "Referencias (opcional)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="gx-label">{label}</span>
                <input
                  value={form[key] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  required={["etiqueta", "calle", "estado", "codigoPostal"].includes(key)}
                  className="gx-input"
                />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefaultEnvio}
                onChange={(e) => setForm((f) => ({ ...f, isDefaultEnvio: e.target.checked }))}
              />
              Usar como predeterminada
            </label>
            {error && <p className="text-danger text-sm">{error}</p>}
            <button type="submit" className="gx-btn-primary w-full">
              Guardar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
