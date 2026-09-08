import { Copy, Monitor, Plus, Power } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, puede } from "../lib/api.js";

interface Sucursal {
  id: string;
  nombre: string;
  codigo: string;
}

interface Kiosko {
  id: string;
  nombre: string;
  sucursalId: string;
  activo: boolean;
  ultimoVisto: string | null;
  createdAt: string;
}

interface KioskoConfig {
  reposoSegundos: number;
  precioSegundos: number;
  contenidoReposo: "promociones" | "destacados" | "ambos";
  slideSegundos: number;
  mostrarExistencia: boolean;
  sonidoBeep: boolean;
  mensajeBienvenida: string;
  colorAcento: string;
  idioma: "es" | "en";
}

const CONTENIDO: Array<{ value: KioskoConfig["contenidoReposo"]; label: string }> = [
  { value: "ambos", label: "Promociones + destacados" },
  { value: "promociones", label: "Solo promociones" },
  { value: "destacados", label: "Solo productos destacados" },
];

export function KioskosPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-bold text-2xl text-slate-800">Kioskos verificadores de precio</h1>
        <p className="text-slate-500 text-sm">
          Tablets en piso de venta: el cliente escanea y ve el precio (el mismo que en caja). Sin
          uso, muestran tus promociones y productos destacados.
        </p>
      </div>
      <Dispositivos />
      <Configuracion />
    </div>
  );
}

function fmtVisto(iso: string | null): string {
  if (!iso) return "Nunca conectado";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return "En línea";
  if (min < 60) return `Hace ${min} min`;
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

function Dispositivos() {
  const [kioskos, setKioskos] = useState<Kiosko[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [alta, setAlta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editar = puede("configuracion.actualizar");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const mutation = useRef(false);
  const cargar = useCallback(async () => {
    const current = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const timeout = setTimeout(() => request.abort(), 12_000);
    setLoading(true);
    setLoadError(null);
    try {
      const [devices, branches] = await Promise.all([
        api<Kiosko[]>("/t/kioskos", { signal: request.signal }),
        api<Sucursal[]>("/t/sucursales", { signal: request.signal }),
      ]);
      if (!Array.isArray(devices) || !Array.isArray(branches))
        throw new Error("Respuesta inválida");
      if (current !== generation.current) return;
      setKioskos(devices);
      setSucursales(branches);
      setSucursalId((prev) =>
        branches.some((branch) => branch.id === prev) ? prev : (branches[0]?.id ?? ""),
      );
    } catch {
      if (current === generation.current)
        setLoadError("No se pudieron cargar los kioskos y sus sucursales. Vuelve a intentar.");
    } finally {
      clearTimeout(timeout);
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void cargar();
    return () => {
      mounted.current = false;
      generation.current++;
      controller.current?.abort();
    };
  }, [cargar]);

  const blocked = loading || !!loadError || busy;
  const cannotCreate = blocked || !nombre.trim() || !sucursalId;
  const nombreSucursal = (id: string) => sucursales.find((s) => s.id === id)?.nombre ?? "—";

  async function crear() {
    if (!editar || loading || loadError || mutation.current || !nombre.trim() || !sucursalId)
      return;
    mutation.current = true;
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ token: string }>("/t/kioskos", {
        body: { nombre: nombre.trim(), sucursalId },
      });
      if (!mounted.current) return;
      setCopiado(false);
      setToken(r.token);
      setNombre("");
      cargar();
    } catch {
      if (mounted.current)
        setError("No se pudo confirmar el alta. Consulta la lista antes de crear otro kiosko.");
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function desactivar(k: Kiosko) {
    if (!editar || loading || loadError || mutation.current) return;
    if (
      !window.confirm(
        `¿Desactivar "${k.nombre}"? Se bloqueará su acceso en la siguiente consulta al servidor.`,
      )
    )
      return;
    mutation.current = true;
    setBusy(true);
    setError(null);
    try {
      await api(`/t/kioskos/${encodeURIComponent(k.id)}`, { method: "DELETE" });
      if (mounted.current) void cargar();
    } catch {
      if (mounted.current)
        setError(
          "No se pudo confirmar la desactivación. Actualiza la lista para verificar el estado antes de intentarlo de nuevo.",
        );
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function copiar() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      if (mounted.current) setCopiado(true);
    } catch {
      if (mounted.current)
        setError("No se pudo copiar. Selecciona el token y cópialo manualmente antes de cerrar.");
    }
  }

  function cerrarAlta() {
    if (mutation.current) return;
    setAlta(false);
    setToken(null);
    setError(null);
  }

  return (
    <section className="gx-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg text-slate-800">Dispositivos</h2>
          <p className="text-slate-500 text-sm">Cada tablet se registra con su propio token.</p>
        </div>
        {editar && (
          <button
            type="button"
            disabled={blocked || !sucursales.length}
            onClick={() => {
              setError(null);
              setAlta(true);
            }}
            className="gx-btn-primary"
          >
            <Plus size={16} /> Nuevo kiosko
          </button>
        )}
      </div>

      {error && !alta && (
        <div role="alert" className="space-y-2 text-danger">
          <p>{error}</p>
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              setError(null);
              void cargar();
            }}
            className="gx-btn-secondary"
          >
            Actualizar lista
          </button>
        </div>
      )}
      {!loading && !loadError && sucursales.length === 0 && (
        <p className="text-slate-600 text-sm">
          No hay sucursales disponibles para registrar un kiosko.
        </p>
      )}
      <DispositivosResultado
        loading={loading}
        error={loadError}
        retry={cargar}
        kioskos={kioskos}
        editar={editar}
        busy={busy}
        nombreSucursal={nombreSucursal}
        onDeactivate={desactivar}
      />

      {alta && (
        <div className="gx-modal-overlay">
          <div className="gx-modal-panel space-y-4">
            {error && (
              <p role="alert" className="text-danger text-sm">
                {error}
              </p>
            )}
            {token ? (
              <>
                <h3 className="font-bold text-lg text-slate-800">Kiosko creado</h3>
                <p className="text-slate-600 text-sm">
                  Copia este token y pégalo en la app del kiosko en la tablet.{" "}
                  <strong>Solo se muestra una vez</strong>; si lo pierdes, desactiva el kiosko y
                  crea otro.
                </p>
                <div className="break-all rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-slate-800 text-sm">
                  {token}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={copiar} className="gx-btn-secondary">
                    <Copy size={16} /> {copiado ? "Copiado ✓" : "Copiar token"}
                  </button>
                  <button type="button" onClick={cerrarAlta} className="gx-btn-primary">
                    Listo
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-bold text-lg text-slate-800">Nuevo kiosko</h3>
                <label className="block">
                  <span className="gx-label">Nombre</span>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Pasillo 3"
                    maxLength={80}
                    className="gx-input"
                  />
                </label>
                <label className="block">
                  <span className="gx-label">Sucursal</span>
                  <select
                    value={sucursalId}
                    onChange={(e) => setSucursalId(e.target.value)}
                    className="gx-input"
                  >
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={cerrarAlta}
                    className="gx-btn-ghost"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={crear}
                    disabled={cannotCreate}
                    className="gx-btn-primary"
                  >
                    {busy ? "Creando…" : "Crear y obtener token"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function DispositivosResultado(props: {
  loading: boolean;
  error: string | null;
  retry: () => Promise<void>;
  kioskos: Kiosko[];
  editar: boolean;
  busy: boolean;
  nombreSucursal: (id: string) => string;
  onDeactivate: (kiosko: Kiosko) => Promise<void>;
}) {
  if (props.loading) return <output>Cargando kioskos y sucursales…</output>;
  if (props.error)
    return (
      <div role="alert" className="space-y-2 text-danger">
        <p>{props.error}</p>
        <button type="button" onClick={() => void props.retry()} className="gx-btn-secondary">
          Volver a intentar
        </button>
      </div>
    );
  if (!props.kioskos.length)
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-slate-400">
        <Monitor size={36} />
        <p className="text-sm">Aún no tienes kioskos registrados.</p>
      </div>
    );
  return <DispositivosTabla {...props} />;
}

function DispositivosTabla({
  kioskos,
  editar,
  busy,
  nombreSucursal,
  onDeactivate,
}: {
  kioskos: Kiosko[];
  editar: boolean;
  busy: boolean;
  nombreSucursal: (id: string) => string;
  onDeactivate: (kiosko: Kiosko) => Promise<void>;
}) {
  return (
    <div className="gx-table-wrap">
      <table className="gx-table">
        <thead>
          <tr>
            <th className="gx-th">Nombre</th>
            <th className="gx-th">Sucursal</th>
            <th className="gx-th">Estado</th>
            <th className="gx-th">Última conexión</th>
            {editar && <th className="gx-th" />}
          </tr>
        </thead>
        <tbody>
          {kioskos.map((k) => (
            <tr key={k.id}>
              <td className="gx-td font-medium text-slate-800">{k.nombre}</td>
              <td className="gx-td">{nombreSucursal(k.sucursalId)}</td>
              <td className="gx-td">
                {k.activo ? (
                  <span className="gx-badge-ok">Activo</span>
                ) : (
                  <span className="gx-badge-danger">Desactivado</span>
                )}
              </td>
              <td className="gx-td">{k.activo ? fmtVisto(k.ultimoVisto) : "—"}</td>
              {editar && (
                <td className="gx-td text-right">
                  {k.activo && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDeactivate(k)}
                      className="gx-btn-ghost text-danger"
                      title="Desactivar"
                    >
                      <Power size={16} /> Desactivar
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Configuracion() {
  const [cfg, setCfg] = useState<KioskoConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const editar = puede("configuracion.actualizar");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const mutation = useRef(false);
  const cargar = useCallback(async () => {
    const current = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const timeout = setTimeout(() => request.abort(), 12_000);
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api<KioskoConfig>("/t/kioskos/config", { signal: request.signal });
      if (
        !result ||
        !Number.isFinite(result.reposoSegundos) ||
        !CONTENIDO.some((item) => item.value === result.contenidoReposo)
      )
        throw new Error("Configuración inválida");
      if (current === generation.current) setCfg(result);
    } catch {
      if (current === generation.current)
        setLoadError("No se pudo cargar la configuración. No se han aplicado valores por defecto.");
    } finally {
      clearTimeout(timeout);
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void cargar();
    return () => {
      mounted.current = false;
      generation.current++;
      controller.current?.abort();
    };
  }, [cargar]);

  if (loading || loadError || !cfg)
    return (
      <section className="gx-card space-y-3">
        <h2 className="font-bold text-lg">Comportamiento de los kioskos</h2>
        {loading ? (
          <output>Cargando configuración…</output>
        ) : (
          <div role="alert" className="space-y-2 text-danger">
            <p>{loadError ?? "Configuración no disponible"}</p>
            <button type="button" onClick={() => void cargar()} className="gx-btn-secondary">
              Volver a intentar
            </button>
          </div>
        )}
      </section>
    );
  const set = <K extends keyof KioskoConfig>(k: K, v: KioskoConfig[K]) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));

  async function guardar() {
    if (!cfg || !editar || loading || loadError || mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const saved = await api<KioskoConfig>("/t/kioskos/config", { method: "PUT", body: cfg });
      if (!mounted.current) return;
      setCfg(saved);
      setMsg("Guardado ✓ Los kioskos aplican el cambio al reconectar.");
    } catch {
      if (mounted.current)
        setMsg("No se pudo confirmar el guardado. Recarga la configuración para verificarla.");
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const num = (
    k: "reposoSegundos" | "precioSegundos" | "slideSegundos",
    label: string,
    hint: string,
  ) => (
    <label className="block">
      <span className="gx-label">{label}</span>
      <input
        type="number"
        min={2}
        max={600}
        value={cfg[k]}
        disabled={!editar || busy}
        onChange={(e) => set(k, Number(e.target.value))}
        className="gx-input disabled:bg-slate-50"
      />
      <span className="text-slate-400 text-xs">{hint}</span>
    </label>
  );

  return (
    <section className="gx-card space-y-4">
      <div>
        <h2 className="font-bold text-lg text-slate-800">Comportamiento de los kioskos</h2>
        <p className="text-slate-500 text-sm">Aplica a todos los kioskos de tu negocio.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {num(
          "reposoSegundos",
          "Segundos para pasar a anuncios",
          "Sin uso → modo comercial (5–600)",
        )}
        {num("precioSegundos", "Segundos que se muestra el precio", "Tras escanear (2–60)")}
        {num("slideSegundos", "Segundos por anuncio", "Duración de cada slide (2–60)")}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="gx-label">Contenido en modo comercial</span>
          <select
            value={cfg.contenidoReposo}
            disabled={!editar || busy}
            onChange={(e) =>
              set("contenidoReposo", e.target.value as KioskoConfig["contenidoReposo"])
            }
            className="gx-input disabled:bg-slate-50"
          >
            {CONTENIDO.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="gx-label">Idioma</span>
          <select
            value={cfg.idioma}
            disabled={!editar || busy}
            onChange={(e) => set("idioma", e.target.value as KioskoConfig["idioma"])}
            className="gx-input disabled:bg-slate-50"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="gx-label">Mensaje de bienvenida</span>
          <input
            value={cfg.mensajeBienvenida}
            maxLength={120}
            disabled={!editar || busy}
            onChange={(e) => set("mensajeBienvenida", e.target.value)}
            className="gx-input disabled:bg-slate-50"
          />
        </label>
        <label className="block">
          <span className="gx-label">Color de acento</span>
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={cfg.colorAcento}
              disabled={!editar || busy}
              onChange={(e) => set("colorAcento", e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
            />
            <span className="font-mono text-slate-500 text-sm">{cfg.colorAcento}</span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-slate-700 text-sm">
          <input
            type="checkbox"
            checked={cfg.mostrarExistencia}
            disabled={!editar || busy}
            onChange={(e) => set("mostrarExistencia", e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Mostrar existencia al cliente
        </label>
        <label className="flex items-center gap-2 text-slate-700 text-sm">
          <input
            type="checkbox"
            checked={cfg.sonidoBeep}
            disabled={!editar || busy}
            onChange={(e) => set("sonidoBeep", e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Sonido al escanear
        </label>
      </div>

      {editar && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={guardar} disabled={busy} className="gx-btn-primary">
            {busy ? "Guardando…" : "Guardar"}
          </button>
          {msg && <output className="text-slate-500 text-sm">{msg}</output>}
          <button
            type="button"
            disabled={busy}
            className="gx-btn-secondary"
            onClick={() => {
              setMsg(null);
              void cargar();
            }}
          >
            Recargar configuración
          </button>
        </div>
      )}
    </section>
  );
}
