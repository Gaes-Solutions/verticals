"use client";

import { type ResultadoMapa, camposDireccionMapa } from "@/lib/direccion-mapa";
import { Check, House, LocateFixed, MapPin, Pencil, Plus, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

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
  const dialog = useRef<HTMLDialogElement>(null);
  const [dirs, setDirs] = useState<Direccion[]>([]);
  const [form, setForm] = useState({ ...VACIA });
  const [editId, setEditId] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [busquedaMapa, setBusquedaMapa] = useState("");
  const [mapa, setMapa] = useState<{ lat: number; lon: number } | null>(null);
  const [cargandoMapa, setCargandoMapa] = useState(false);
  const [avisoMapa, setAvisoMapa] = useState<string | null>(null);
  const [errorMapa, setErrorMapa] = useState<string | null>(null);

  useEffect(() => {
    if (abierto && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [abierto]);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/cuenta/direcciones", { cache: "no-store" });
      if (!res.ok) throw new Error("No pudimos cargar tus direcciones. Reintenta.");
      const r = await res.json();
      if (!Array.isArray(r)) throw new Error("No pudimos cargar tus direcciones. Reintenta.");
      setDirs(r as Direccion[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No hay conexión. Tus datos se conservan.");
    }
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
    setErrorMapa(null);
    setAvisoMapa(null);
    setAbierto(true);
  }

  function aplicarResultadoMapa(item: ResultadoMapa) {
    setMapa({ lat: Number(item.lat), lon: Number(item.lon) });
    const campos = camposDireccionMapa(item);
    setForm((actual) => ({
      ...actual,
      ...campos,
    }));
    setBusquedaMapa(item.display_name ?? "");
    const faltantes = Object.entries(campos)
      .filter(([, valor]) => !valor)
      .map(
        ([key]) =>
          ({
            calle: "calle",
            numeroExterior: "número exterior",
            colonia: "colonia",
            municipio: "municipio",
            estado: "estado",
            codigoPostal: "código postal",
          })[key as keyof typeof campos],
      );
    setAvisoMapa(
      faltantes.length
        ? `Completamos los datos disponibles. Revisa la dirección y agrega: ${faltantes.join(", ")}.`
        : "Dirección completada. Revisa los datos antes de guardar.",
    );
  }

  async function consultarMapa(url: string) {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const resultado = await res.json();
    if (!res.ok) throw new Error(resultado.message || "No pudimos consultar el mapa.");
    aplicarResultadoMapa(resultado as ResultadoMapa);
  }

  async function buscarEnMapa() {
    const consulta = busquedaMapa.trim();
    if (!consulta) return;
    setCargandoMapa(true);
    setErrorMapa(null);
    setAvisoMapa(null);
    try {
      await consultarMapa(`/api/cuenta/ubicacion?q=${encodeURIComponent(consulta)}`);
    } catch (err) {
      setErrorMapa(
        err instanceof Error
          ? err.message
          : "No pudimos consultar el mapa. Puedes llenar los campos manualmente.",
      );
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
    setAvisoMapa(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setMapa({ lat: coords.latitude, lon: coords.longitude });
        try {
          await consultarMapa(
            `/api/cuenta/ubicacion?lat=${coords.latitude}&lon=${coords.longitude}`,
          );
          if (coords.accuracy > 100)
            setAvisoMapa(
              (aviso) =>
                `${aviso ?? ""} Tu ubicación es aproximada; confirma que sea tu domicilio.`,
            );
        } catch (err) {
          setErrorMapa(
            err instanceof Error ? err.message : "No pudimos leer la dirección de tu ubicación.",
          );
        } finally {
          setCargandoMapa(false);
        }
      },
      (err) => {
        setErrorMapa(
          err.code === 1
            ? "Permite el acceso a ubicación en la configuración de este sitio y vuelve a intentarlo."
            : err.code === 3
              ? "Tu dispositivo tardó en obtener la ubicación. Vuelve a intentar o busca tu calle."
              : "No pudimos obtener tu ubicación. Activa la ubicación del dispositivo o busca tu calle.",
        );
        setCargandoMapa(false);
      },
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 60_000 },
    );
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    setError(null);
    setGuardando(true);
    const url = editId ? `/api/cuenta/direcciones/${editId}` : "/api/cuenta/direcciones";
    try {
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          res.status === 401
            ? "Tu sesión venció. Inicia sesión en otra pestaña y vuelve a guardar; tus campos permanecen aquí."
            : (data.message ?? "Revisa los datos (CP de 5 dígitos, estado y calle)."),
        );
        return;
      }
      setAbierto(false);
      setEditId(null);
      setForm({ ...VACIA });
      await cargar();
    } catch {
      setError(
        "No pudimos confirmar que se guardó. Tus campos se conservan; revisa la lista antes de reintentar.",
      );
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/cuenta/direcciones/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No pudimos eliminar la dirección. Reintenta.");
      setConfirmandoId(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No hay conexión. La dirección se conserva.");
    }
  }

  return (
    <div>
      {!abierto && error && (
        <div role="alert" className="mb-4 rounded-lg bg-danger-light p-3 text-sm text-danger">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              cargar();
            }}
            className="mt-2 underline"
          >
            Volver a cargar direcciones
          </button>
        </div>
      )}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="tienda-section-title">Mis direcciones</h2>
          <p className="mt-1 text-slate-500 text-sm">
            Guarda tus ubicaciones para comprar más rápido.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditId(null);
            setForm({ ...VACIA });
            setMapa(null);
            setBusquedaMapa("");
            setErrorMapa(null);
            setAvisoMapa(null);
            setAbierto(true);
          }}
          className="gx-btn-primary shrink-0 shadow-sm shadow-marca/20"
        >
          <Plus size={16} strokeWidth={2.5} /> Agregar
        </button>
      </div>

      {dirs.length === 0 ? (
        <div className="tienda-surface flex flex-col items-center px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-marca/10 text-marca">
            <MapPin size={26} />
          </span>
          <p className="mt-4 font-semibold text-slate-800">Aún no tienes direcciones guardadas</p>
          <p className="mt-1 max-w-sm text-slate-500 text-sm">
            Agrega tu domicilio y en tus próximas compras solo tendrás que seleccionarlo.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {dirs.map((d) => (
            <div
              key={d.id}
              className="tienda-surface group !p-5 text-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <House size={16} className="text-marca" />
                  {d.etiqueta}
                </span>
                {d.isDefaultEnvio && (
                  <span className="gx-badge-ok">
                    <Check size={12} className="mr-1 inline" />
                    Predeterminada
                  </span>
                )}
              </div>
              <p className="mt-1 text-slate-600">
                {d.calle} {d.numeroExterior}, {d.colonia}, {d.municipio}, {d.estado} CP{" "}
                {d.codigoPostal}
              </p>
              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => editar(d)} className="gx-btn-ghost !px-3">
                  <Pencil size={14} />
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
        <dialog
          ref={dialog}
          aria-labelledby="direccion-modal-title"
          onClose={() => setAbierto(false)}
          onCancel={(event) => {
            if (guardando) event.preventDefault();
          }}
          className="gx-modal-panel !m-auto w-[calc(100%-2rem)] !max-h-[calc(100dvh-2rem)] !overflow-hidden !max-w-2xl !rounded-2xl !border-0 !p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
        >
          <form onSubmit={guardar} className="flex max-h-[calc(100dvh-2rem)] flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 id="direccion-modal-title" className="font-bold text-lg">
                  {editId ? "Editar" : "Nueva"} dirección
                </h3>
                <p className="mt-0.5 text-slate-500 text-xs">
                  Encuentra tu domicilio y revisa los datos antes de guardar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={guardando}
                className="gx-btn-ghost !h-9 !w-9 !rounded-full !p-0"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-4">
              <div className="mx-6 rounded-2xl border border-marca/15 bg-gradient-to-br from-marca/5 to-slate-50 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-marca text-white">
                    <MapPin size={17} />
                  </span>
                  <div>
                    <p className="font-semibold text-sm">Encuentra tu dirección</p>
                    <p className="mt-0.5 text-slate-500 text-xs">
                      Busca una calle o usa la ubicación de tu dispositivo.
                    </p>
                  </div>
                </div>
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
                    className="gx-input flex-1 !rounded-xl !bg-white"
                    aria-label="Buscar dirección en el mapa"
                  />
                  <button
                    type="button"
                    onClick={buscarEnMapa}
                    className="gx-btn-secondary !rounded-xl !px-3"
                    disabled={cargandoMapa}
                  >
                    Buscar
                  </button>
                </div>
                <button
                  type="button"
                  onClick={usarUbicacion}
                  className="gx-btn-ghost w-full !rounded-xl !border !border-slate-200 !bg-white"
                  disabled={cargandoMapa}
                >
                  <LocateFixed size={16} />{" "}
                  {cargandoMapa ? "Buscando…" : "Usar mi ubicación actual"}
                </button>
                {mapa && (
                  <iframe
                    title="Ubicación seleccionada"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapa.lon - 0.005}%2C${mapa.lat - 0.005}%2C${mapa.lon + 0.005}%2C${mapa.lat + 0.005}&layer=mapnik&marker=${mapa.lat}%2C${mapa.lon}`}
                    className="h-48 w-full rounded-xl border border-slate-200 shadow-sm"
                    loading="lazy"
                  />
                )}
                {avisoMapa && <output className="block text-sm text-marca">{avisoMapa}</output>}
                {errorMapa && <p className="text-danger text-xs">{errorMapa}</p>}
                <p className="text-xs text-slate-500">
                  Puedes corregir cualquier campo antes de guardar. Datos del mapa:{" "}
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    © OpenStreetMap
                  </a>
                  .
                </p>
              </div>
              <div className="grid gap-3 px-6 sm:grid-cols-2">
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
                      className="gx-input !rounded-xl"
                    />
                  </label>
                ))}
              </div>
              <label className="mx-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.isDefaultEnvio}
                  onChange={(e) => setForm((f) => ({ ...f, isDefaultEnvio: e.target.checked }))}
                />
                Usar como predeterminada
              </label>
            </div>
            <div className="shrink-0 space-y-3 border-t border-slate-100 px-6 py-4">
              {error && (
                <p role="alert" className="text-danger text-sm">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  disabled={guardando}
                  className="gx-btn-ghost"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="gx-btn-primary min-w-32 disabled:opacity-50"
                >
                  <Check size={16} /> {guardando ? "Guardando…" : "Guardar dirección"}
                </button>
              </div>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
