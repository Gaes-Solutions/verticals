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
  const [busquedaMapa, setBusquedaMapa] = useState("");
  const [mapa, setMapa] = useState<{ lat: number; lon: number } | null>(null);
  const [cargandoMapa, setCargandoMapa] = useState(false);
  const [errorMapa, setErrorMapa] = useState<string | null>(null);

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
    setMapa(null);
    setBusquedaMapa("");
    setAbierto(true);
  }

  function aplicarResultadoMapa(item: {
    lat: string;
    lon: string;
    address?: Record<string, string | undefined>;
    display_name?: string;
  }) {
    const address = item.address ?? {};
    setMapa({ lat: Number(item.lat), lon: Number(item.lon) });
    setForm((actual) => ({
      ...actual,
      calle: [address.road, address.pedestrian].find(Boolean) ?? actual.calle,
      numeroExterior: address.house_number ?? actual.numeroExterior,
      colonia: address.neighbourhood ?? address.suburb ?? address.city_district ?? actual.colonia,
      municipio: address.city ?? address.town ?? address.municipality ?? actual.municipio,
      estado: address.state ?? actual.estado,
      codigoPostal: address.postcode ?? actual.codigoPostal,
      referencias: actual.referencias || item.display_name || "",
    }));
    setBusquedaMapa(item.display_name ?? "");
  }

  async function buscarEnMapa() {
    const consulta = busquedaMapa.trim();
    if (!consulta) return;
    setCargandoMapa(true);
    setErrorMapa(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=mx&limit=1&q=${encodeURIComponent(consulta)}`,
        { headers: { Accept: "application/json" } },
      );
      const resultados = (await res.json()) as Array<{
        lat: string;
        lon: string;
        address?: Record<string, string | undefined>;
        display_name?: string;
      }>;
      if (!res.ok || resultados.length === 0) {
        setErrorMapa("No encontramos esa dirección. Prueba con calle, ciudad y estado.");
        return;
      }
      aplicarResultadoMapa(resultados[0]);
    } catch {
      setErrorMapa("No pudimos consultar el mapa. Puedes llenar los campos manualmente.");
    } finally {
      setCargandoMapa(false);
    }
  }

  function usarUbicacion() {
    if (!navigator.geolocation) {
      setErrorMapa("Tu dispositivo no permite obtener la ubicación.");
      return;
    }
    setCargandoMapa(true);
    setErrorMapa(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${coords.latitude}&lon=${coords.longitude}`,
            { headers: { Accept: "application/json" } },
          );
          const resultado = (await res.json()) as {
            lat: string;
            lon: string;
            address?: Record<string, string | undefined>;
            display_name?: string;
          };
          if (!res.ok || !resultado.address) throw new Error("reverse geocoding failed");
          aplicarResultadoMapa(resultado);
        } catch {
          setErrorMapa("No pudimos leer la dirección de tu ubicación.");
        } finally {
          setCargandoMapa(false);
        }
      },
      () => {
        setErrorMapa("Permite la ubicación en tu navegador para usar este botón.");
        setCargandoMapa(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
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
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-sm font-semibold">Encuentra tu dirección en el mapa</p>
              <div className="flex gap-2">
                <input
                  value={busquedaMapa}
                  onChange={(e) => setBusquedaMapa(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      buscarEnMapa();
                    }
                  }}
                  placeholder="Calle, ciudad y estado"
                  className="gx-input flex-1"
                  aria-label="Buscar dirección en el mapa"
                />
                <button
                  type="button"
                  onClick={buscarEnMapa}
                  className="gx-btn-ghost"
                  disabled={cargandoMapa}
                >
                  Buscar
                </button>
              </div>
              <button
                type="button"
                onClick={usarUbicacion}
                className="gx-btn-ghost w-full"
                disabled={cargandoMapa}
              >
                {cargandoMapa ? "Buscando…" : "Usar mi ubicación actual"}
              </button>
              {mapa && (
                <iframe
                  title="Ubicación seleccionada"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapa.lon - 0.005}%2C${mapa.lat - 0.005}%2C${mapa.lon + 0.005}%2C${mapa.lat + 0.005}&layer=mapnik&marker=${mapa.lat}%2C${mapa.lon}`}
                  className="h-44 w-full rounded-lg border-0"
                  loading="lazy"
                />
              )}
              {errorMapa && <p className="text-danger text-xs">{errorMapa}</p>}
              <p className="text-xs text-slate-500">
                Puedes corregir cualquier campo antes de guardar.
              </p>
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
