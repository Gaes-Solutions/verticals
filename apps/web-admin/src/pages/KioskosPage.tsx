import { Copy, Monitor, Plus, Power } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";

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

  const cargar = useCallback(() => {
    api<Kiosko[]>("/t/kioskos")
      .then(setKioskos)
      .catch(() => setKioskos([]));
  }, []);
  useEffect(() => {
    cargar();
    api<Sucursal[]>("/t/sucursales")
      .then((s) => {
        setSucursales(s);
        if (s[0]) setSucursalId((prev) => prev || s[0].id);
      })
      .catch(() => setSucursales([]));
  }, [cargar]);

  const nombreSucursal = (id: string) => sucursales.find((s) => s.id === id)?.nombre ?? "—";

  async function crear() {
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ token: string }>("/t/kioskos", {
        body: { nombre: nombre.trim(), sucursalId },
      });
      setToken(r.token);
      setNombre("");
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear el kiosko");
    } finally {
      setBusy(false);
    }
  }

  async function desactivar(k: Kiosko) {
    if (!window.confirm(`¿Desactivar "${k.nombre}"? La tablet dejará de funcionar de inmediato.`))
      return;
    try {
      await api(`/t/kioskos/${k.id}`, { method: "DELETE" });
      cargar();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "No se pudo desactivar");
    }
  }

  async function copiar() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function cerrarAlta() {
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
          <button type="button" onClick={() => setAlta(true)} className="gx-btn-primary">
            <Plus size={16} /> Nuevo kiosko
          </button>
        )}
      </div>

      {kioskos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-slate-400">
          <Monitor size={36} />
          <p className="text-sm">Aún no tienes kioskos registrados.</p>
        </div>
      ) : (
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
                          onClick={() => desactivar(k)}
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
      )}

      {alta && (
        <div className="gx-modal-overlay">
          <div className="gx-modal-panel space-y-4">
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
                {error && <p className="text-danger text-sm">{error}</p>}
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={cerrarAlta} className="gx-btn-ghost">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={crear}
                    disabled={busy || !nombre.trim() || !sucursalId}
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

function Configuracion() {
  const [cfg, setCfg] = useState<KioskoConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const editar = puede("configuracion.actualizar");

  useEffect(() => {
    api<KioskoConfig>("/t/kioskos/config")
      .then(setCfg)
      .catch(() => setCfg(null));
  }, []);

  if (!cfg) return null;
  const set = <K extends keyof KioskoConfig>(k: K, v: KioskoConfig[K]) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));

  async function guardar() {
    if (!cfg) return;
    setBusy(true);
    setMsg(null);
    try {
      const saved = await api<KioskoConfig>("/t/kioskos/config", { method: "PUT", body: cfg });
      setCfg(saved);
      setMsg("Guardado ✓ Los kioskos aplican el cambio al reconectar.");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
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
        disabled={!editar}
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
            disabled={!editar}
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
            disabled={!editar}
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
            disabled={!editar}
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
              disabled={!editar}
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
            disabled={!editar}
            onChange={(e) => set("mostrarExistencia", e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Mostrar existencia al cliente
        </label>
        <label className="flex items-center gap-2 text-slate-700 text-sm">
          <input
            type="checkbox"
            checked={cfg.sonidoBeep}
            disabled={!editar}
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
          {msg && <span className="text-slate-500 text-sm">{msg}</span>}
        </div>
      )}
    </section>
  );
}
