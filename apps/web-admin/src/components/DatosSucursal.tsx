import { type FormEvent, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";
import { FormField } from "./FormField.js";

interface SucursalContacto {
  id: string;
  nombre: string;
  isDefault: boolean;
  isActive: boolean;
  telefono: string | null;
  emailContacto: string | null;
  direccion: Record<string, unknown> | null;
}
const CAMPOS = [
  ["calle", "Calle"],
  ["numero", "Número exterior e interior"],
  ["colonia", "Colonia"],
  ["municipio", "Municipio / alcaldía"],
  ["ciudad", "Ciudad"],
  ["estado", "Estado"],
  ["cp", "Código postal"],
] as const;

export function DatosSucursal() {
  const [sucursales, setSucursales] = useState<SucursalContacto[] | null>(null);
  const [seleccion, setSeleccion] = useState("");
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reintento vuelve a cargar la misma URL
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError(false);
    api<SucursalContacto[]>("/t/sucursales", { signal: controller.signal })
      .then((rows) => {
        if (!active) return;
        const disponibles = rows.filter((row) => row.isActive);
        setSucursales(disponibles);
        setSeleccion(disponibles.find((row) => row.isDefault)?.id ?? disponibles[0]?.id ?? "");
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [intento]);
  const sucursal = sucursales?.find((row) => row.id === seleccion);
  return (
    <section className="rounded-xl border bg-white p-6">
      <h2 className="font-bold text-lg text-slate-800">Dirección y contacto de la sucursal</h2>
      <p className="mb-4 text-slate-500 text-sm">
        Captura dónde recoger los pedidos y cómo contactar a tu negocio. Estos datos también se usan
        en las políticas de la tienda.
      </p>
      {error ? (
        <div>
          <p role="alert" className="text-danger text-sm">
            No pudimos cargar las sucursales.
          </p>
          <button
            type="button"
            onClick={() => setIntento((n) => n + 1)}
            className="gx-btn-secondary mt-2"
          >
            Reintentar sucursales
          </button>
        </div>
      ) : sucursales === null ? (
        <output>Cargando sucursales…</output>
      ) : sucursales.length === 0 ? (
        <p className="text-slate-500 text-sm">No hay sucursales activas disponibles.</p>
      ) : (
        <>
          {sucursales.length > 1 && (
            <FormField label="Sucursal a configurar">
              <select
                value={seleccion}
                onChange={(e) => setSeleccion(e.target.value)}
                className="gx-input mb-4"
              >
                {sucursales.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.nombre}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          {sucursal && (
            <FormularioSucursal
              key={sucursal.id}
              sucursal={sucursal}
              onSaved={(saved) =>
                setSucursales(
                  (rows) => rows?.map((row) => (row.id === saved.id ? saved : row)) ?? null,
                )
              }
            />
          )}
        </>
      )}
    </section>
  );
}

function FormularioSucursal({
  sucursal,
  onSaved,
}: { sucursal: SucursalContacto; onSaved: (saved: SucursalContacto) => void }) {
  const [nombre, setNombre] = useState(sucursal.nombre);
  const [telefono, setTelefono] = useState(sucursal.telefono ?? "");
  const [email, setEmail] = useState(sucursal.emailContacto ?? "");
  const [direccion, setDireccion] = useState<Record<string, unknown>>(sucursal.direccion ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const editable = puede("sucursales.actualizar");
  const texto = (key: string) =>
    typeof direccion[key] === "string" ? (direccion[key] as string) : "";
  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (!editable || busy) return;
    setBusy(true);
    setGuardado(false);
    setError(null);
    try {
      const saved = await api<SucursalContacto>(`/t/sucursales/${sucursal.id}`, {
        method: "PATCH",
        body: {
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          emailContacto: email.trim() || null,
          direccion,
        },
      });
      onSaved(saved);
      setGuardado(true);
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error.message
          : "No se pudo guardar la sucursal. Tus cambios siguen aquí para reintentar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={guardar} onChange={() => setGuardado(false)}>
      <fieldset disabled={!editable || busy} className="space-y-3 disabled:opacity-70">
        <FormField label="Nombre de la sucursal">
          <input
            required
            maxLength={200}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="gx-input"
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Teléfono de contacto">
            <input
              type="tel"
              autoComplete="tel"
              maxLength={50}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="gx-input"
            />
          </FormField>
          <FormField label="Correo de contacto">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="gx-input"
            />
          </FormField>
          {CAMPOS.map(([key, label]) => (
            <FormField key={key} label={label}>
              <input
                value={texto(key)}
                maxLength={key === "cp" ? 5 : 200}
                pattern={key === "cp" ? "[0-9]{5}" : undefined}
                inputMode={key === "cp" ? "numeric" : undefined}
                autoComplete={key === "cp" ? "postal-code" : "off"}
                onChange={(e) => setDireccion((d) => ({ ...d, [key]: e.target.value }))}
                className="gx-input"
              />
            </FormField>
          ))}
        </div>
        {editable && (
          <button type="submit" disabled={busy || !nombre.trim()} className="gx-btn-primary">
            {busy ? "Guardando…" : "Guardar sucursal"}
          </button>
        )}
      </fieldset>
      {!editable && (
        <p className="mt-3 text-slate-500 text-sm">
          Tu rol puede consultar estos datos. Para modificarlos necesitas permiso de actualización
          de sucursales.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-danger text-sm">
          {error}
        </p>
      )}
      {guardado && (
        <output className="mt-3 block text-ok text-sm">Dirección y contacto guardados.</output>
      )}
    </form>
  );
}
