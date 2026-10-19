"use client";

import { type ResultadoMapa, camposDireccionMapa } from "@/lib/direccion-mapa";
import { Check, House, LocateFixed, MapPin, Pencil, Plus, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import {
  type DireccionGuardada as Direccion,
  direccionConfirmada,
  esListaDirecciones,
  esObjeto,
} from "@/lib/direcciones-contract";
export type { DireccionGuardada as Direccion } from "@/lib/direcciones-contract";

type ConsultaMapa = { controller: AbortController; ediciones: Record<string, number> };

function resultadoMapa(value: unknown): value is ResultadoMapa {
  if (!esObjeto(value) || typeof value.lat !== "string" || typeof value.lon !== "string")
    return false;
  const lat = Number(value.lat);
  const lon = Number(value.lon);
  if (
    !value.lat.trim() ||
    !value.lon.trim() ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return false;
  if (value.display_name !== undefined && typeof value.display_name !== "string") return false;
  return (
    value.address === undefined ||
    (esObjeto(value.address) &&
      Object.values(value.address).every((item) => typeof item === "string"))
  );
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
  const consultaMapa = useRef<ConsultaMapa | null>(null);
  const ediciones = useRef<Record<string, number>>({});
  const carga = useRef<AbortController | null>(null);
  const escritura = useRef<AbortController | null>(null);
  const ocupado = useRef(false);
  const montado = useRef(true);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [dirs, setDirs] = useState<Direccion[]>([]);
  const [form, setForm] = useState({ ...VACIA });
  const formActual = useRef(form);
  formActual.current = form;
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

  const cancelarMapa = useCallback(() => {
    consultaMapa.current?.controller.abort();
    consultaMapa.current = null;
    setCargandoMapa(false);
  }, []);

  function cerrar() {
    cancelarMapa();
    setAbierto(false);
  }

  const cargaVigente = useCallback(
    (controller: AbortController) => !controller.signal.aborted && montado.current,
    [],
  );
  const cargar = useCallback(async () => {
    carga.current?.abort();
    const controller = new AbortController();
    carga.current = controller;
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch("/api/cuenta/direcciones", {
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      });
      if (!res.ok) throw new Error("load");
      const data = await res.json();
      if (!esListaDirecciones(data)) throw new Error("invalid");
      if (cargaVigente(controller)) setDirs(data);
    } catch {
      if (cargaVigente(controller))
        setErrorCarga("No pudimos cargar tus direcciones. Reintenta; tus datos se conservan.");
    } finally {
      if (cargaVigente(controller)) setCargando(false);
    }
  }, [cargaVigente]);

  useEffect(() => {
    montado.current = true;
    void cargar();
    return () => {
      montado.current = false;
      carga.current?.abort();
      escritura.current?.abort();
      consultaMapa.current?.controller.abort();
      consultaMapa.current = null;
    };
  }, [cargar]);

  function editar(d: Direccion) {
    cancelarMapa();
    setError(null);
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

  function vigente(consulta: ConsultaMapa) {
    return consultaMapa.current === consulta && !consulta.controller.signal.aborted;
  }

  function iniciarMapa(): ConsultaMapa | null {
    if (ocupado.current) return null;
    cancelarMapa();
    const consulta = { controller: new AbortController(), ediciones: { ...ediciones.current } };
    consultaMapa.current = consulta;
    setCargandoMapa(true);
    setErrorMapa(null);
    setAvisoMapa(null);
    return consulta;
  }

  function terminarMapa(consulta: ConsultaMapa) {
    if (!vigente(consulta)) return;
    consultaMapa.current = null;
    setCargandoMapa(false);
  }

  function aplicarResultadoMapa(item: ResultadoMapa, consulta: ConsultaMapa) {
    if (!vigente(consulta)) return;
    setMapa({ lat: Number(item.lat), lon: Number(item.lon) });
    const campos = camposDireccionMapa(item);
    const cambios = Object.fromEntries(
      Object.entries(campos).filter(
        ([key]) => (ediciones.current[key] ?? 0) === (consulta.ediciones[key] ?? 0),
      ),
    );
    const completos = { ...formActual.current, ...cambios };
    setForm((actual) => ({ ...actual, ...cambios }));
    setBusquedaMapa(item.display_name ?? "");
    const faltantes = Object.entries(campos)
      .map(([key]) => [key, completos[key as keyof typeof completos]])
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

  async function consultarMapa(url: string, consulta: ConsultaMapa) {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.any([consulta.controller.signal, AbortSignal.timeout(20_000)]),
    });
    const resultado = await res.json();
    if (!res.ok || !resultadoMapa(resultado))
      throw new Error("No pudimos consultar el mapa. Puedes llenar los campos manualmente.");
    aplicarResultadoMapa(resultado, consulta);
  }

  async function buscarEnMapa() {
    const texto = busquedaMapa.trim();
    if (!texto) return;
    const consulta = iniciarMapa();
    if (!consulta) return;
    try {
      await consultarMapa(`/api/cuenta/ubicacion?q=${encodeURIComponent(texto)}`, consulta);
    } catch {
      if (vigente(consulta))
        setErrorMapa("No pudimos consultar el mapa. Puedes llenar los campos manualmente.");
    } finally {
      terminarMapa(consulta);
    }
  }

  function usarUbicacion() {
    if (!navigator.geolocation) {
      setErrorMapa("Tu dispositivo no permite obtener la ubicación.");
      return;
    }
    const consulta = iniciarMapa();
    if (!consulta) return;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (!vigente(consulta)) return;
        setMapa({ lat: coords.latitude, lon: coords.longitude });
        try {
          await consultarMapa(
            `/api/cuenta/ubicacion?lat=${coords.latitude}&lon=${coords.longitude}`,
            consulta,
          );
          if (vigente(consulta) && coords.accuracy > 100)
            setAvisoMapa(
              (aviso) =>
                `${aviso ?? ""} Tu ubicación es aproximada; confirma que sea tu domicilio.`,
            );
        } catch {
          if (vigente(consulta))
            setErrorMapa(
              "No pudimos leer la dirección de tu ubicación. Puedes completar los campos manualmente.",
            );
        } finally {
          terminarMapa(consulta);
        }
      },
      (err) => {
        if (!vigente(consulta)) return;
        setErrorMapa(
          err.code === 1
            ? "Permite el acceso a ubicación en la configuración de este sitio y vuelve a intentarlo."
            : "No pudimos obtener tu ubicación. Actívala o busca tu calle.",
        );
        terminarMapa(consulta);
      },
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 60_000 },
    );
  }

  async function confirmarGuardado(res: Response, data: unknown) {
    if (!montado.current) return;
    if (!res.ok) {
      setError(
        res.status === 401
          ? "Tu sesión venció. Inicia sesión en otra pestaña y vuelve a guardar; tus campos permanecen aquí."
          : esObjeto(data) && typeof data.message === "string"
            ? data.message
            : "Revisa los datos (CP de 5 dígitos, estado y calle).",
      );
      return;
    }
    if (!direccionConfirmada(data, !!editId)) throw new Error("unconfirmed");
    cerrar();
    setEditId(null);
    setForm({ ...VACIA });
    await cargar();
  }
  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (ocupado.current) return;
    ocupado.current = true;
    cancelarMapa();
    const controller = new AbortController();
    escritura.current = controller;
    setError(null);
    setGuardando(true);
    const url = editId
      ? `/api/cuenta/direcciones/${encodeURIComponent(editId)}`
      : "/api/cuenta/direcciones";
    try {
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      await confirmarGuardado(res, data);
    } catch {
      setError(
        "No pudimos confirmar que se guardó. Tus campos se conservan; revisa la lista antes de reintentar.",
      );
    } finally {
      ocupado.current = false;
      escritura.current = null;
      if (montado.current) setGuardando(false);
    }
  }

  function finalizarBorrado() {
    ocupado.current = false;
    escritura.current = null;
    if (montado.current) setBorrando(null);
  }
  async function borrar(id: string) {
    if (ocupado.current) return;
    ocupado.current = true;
    setBorrando(id);
    setError(null);
    const controller = new AbortController();
    escritura.current = controller;
    try {
      const res = await fetch(`/api/cuenta/direcciones/${encodeURIComponent(id)}`, {
        method: "DELETE",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      });
      if (!montado.current) return;
      if (res.status === 401) {
        setError(
          "Tu sesión venció. Inicia sesión en otra pestaña y vuelve a consultar tus direcciones.",
        );
        return;
      }
      if (res.status !== 204) throw new Error("unconfirmed");
      setConfirmandoId(null);
      await cargar();
    } catch {
      if (montado.current)
        setError("No pudimos confirmar la eliminación. Revisa la lista antes de reintentar.");
    } finally {
      finalizarBorrado();
    }
  }

  return (
    <div>
      {!abierto && (error || errorCarga) && (
        <div role="alert" className="mb-4 rounded-lg bg-danger-light p-3 text-sm text-danger">
          <p>{error || errorCarga}</p>
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
          disabled={guardando || !!borrando}
          onClick={() => {
            cancelarMapa();
            setError(null);
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

      <ListaDirecciones
        dirs={dirs}
        cargando={cargando}
        errorCarga={errorCarga}
        guardando={guardando}
        borrando={borrando}
        confirmandoId={confirmandoId}
        editar={editar}
        borrar={borrar}
        confirmar={setConfirmandoId}
      />

      {abierto && (
        <dialog
          ref={dialog}
          aria-labelledby="direccion-modal-title"
          onClose={cerrar}
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
                onClick={cerrar}
                disabled={guardando}
                className="gx-btn-ghost !h-11 !w-11 !rounded-full !p-0"
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
                    disabled={guardando}
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
                    disabled={cargandoMapa || guardando}
                  >
                    Buscar
                  </button>
                </div>
                <button
                  type="button"
                  onClick={usarUbicacion}
                  className="gx-btn-ghost w-full !rounded-xl !border !border-slate-200 !bg-white"
                  disabled={cargandoMapa || guardando}
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
                {errorMapa && (
                  <p role="alert" className="text-danger text-xs">
                    {errorMapa}
                  </p>
                )}
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
                      disabled={guardando}
                      value={form[key] as string}
                      onChange={(e) => {
                        ediciones.current[key] = (ediciones.current[key] ?? 0) + 1;
                        setForm((f) => ({ ...f, [key]: e.target.value }));
                      }}
                      required={["etiqueta", "calle", "estado", "codigoPostal"].includes(key)}
                      className="gx-input !rounded-xl"
                    />
                  </label>
                ))}
              </div>
              <label className="mx-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  disabled={guardando}
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
                  onClick={cerrar}
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

function ListaDirecciones({
  dirs,
  cargando,
  errorCarga,
  guardando,
  borrando,
  confirmandoId,
  editar,
  borrar,
  confirmar,
}: {
  dirs: Direccion[];
  cargando: boolean;
  errorCarga: string | null;
  guardando: boolean;
  borrando: string | null;
  confirmandoId: string | null;
  editar: (d: Direccion) => void;
  borrar: (id: string) => void;
  confirmar: (id: string) => void;
}) {
  return (
    <>
      {dirs.length === 0 && (cargando || errorCarga) ? (
        <output className="block py-8 text-center text-slate-500 text-sm">
          {cargando ? "Cargando direcciones…" : "No pudimos consultar tu lista de direcciones."}
        </output>
      ) : dirs.length === 0 ? (
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
                <button
                  type="button"
                  disabled={guardando || !!borrando}
                  onClick={() => editar(d)}
                  className="gx-btn-ghost !px-3"
                >
                  <Pencil size={14} />
                  Editar
                </button>
                {confirmandoId === d.id ? (
                  <button
                    type="button"
                    disabled={guardando || !!borrando}
                    onClick={() => borrar(d.id)}
                    className="gx-btn-danger"
                  >
                    {borrando === d.id ? "Eliminando…" : "¿Seguro? Sí, eliminar"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={guardando || !!borrando}
                    onClick={() => confirmar(d.id)}
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
    </>
  );
}
