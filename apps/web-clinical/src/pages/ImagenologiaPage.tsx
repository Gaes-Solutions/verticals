import { useCallback, useEffect, useState } from "react";
import { type Sujeto, SujetoBuscador } from "../components/SujetoBuscador.js";
import { ApiError, api, puede } from "../lib/api.js";

const MODALIDADES = [
  ["radiografia", "Radiografía"],
  ["ultrasonido", "Ultrasonido"],
  ["tomografia", "Tomografía"],
  ["resonancia", "Resonancia"],
  ["endoscopia", "Endoscopia"],
  ["ecocardiograma", "Ecocardiograma"],
  ["otro", "Otro"],
] as const;

const ESTADO_BADGE: Record<string, string> = {
  solicitado: "gx-badge-info",
  en_proceso: "gx-badge-warn",
  resultado_cargado: "gx-badge-ok",
  cancelado: "gx-badge-danger",
};
const ESTADO_LABEL: Record<string, string> = {
  solicitado: "Solicitado",
  en_proceso: "En proceso",
  resultado_cargado: "Con resultado",
  cancelado: "Cancelado",
};

interface Imagen {
  url: string;
  descripcion?: string;
}
interface Estudio {
  id: string;
  folio: string;
  nombreEstudio: string;
  modalidad: string;
  region?: string | null;
  prioridad: string;
  estado: string;
  notasClinicas?: string | null;
  hallazgos?: string | null;
  impresionDiagnostica?: string | null;
  imagenes?: Imagen[];
}

async function primeraSucursal(): Promise<string | null> {
  const s = await api<{ id: string }[]>("/t/sucursales").catch(() => []);
  return s[0]?.id ?? null;
}

export function ImagenologiaPage() {
  const [sujeto, setSujeto] = useState<Sujeto | null>(null);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-bold text-2xl text-slate-800">Imagenología</h1>
      <p className="mb-4 text-slate-500 text-sm">Solicitud y resultados de estudios de imagen</p>
      {!sujeto ? (
        <SujetoBuscador onSelect={setSujeto} />
      ) : (
        <Estudios sujeto={sujeto} onCambiar={() => setSujeto(null)} />
      )}
    </div>
  );
}

function Estudios({ sujeto, onCambiar }: { sujeto: Sujeto; onCambiar: () => void }) {
  const [items, setItems] = useState<Estudio[]>([]);
  const [solicitar, setSolicitar] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);
  const filtro = sujeto.tipo === "mascota" ? "mascotaId" : "pacienteId";

  const cargar = useCallback(() => {
    api<{ items: Estudio[] }>(`/t/imagenologia?${filtro}=${sujeto.id}&pageSize=50`)
      .then((r) => setItems(r.items ?? []))
      .catch(() => setItems([]));
  }, [sujeto.id, filtro]);
  useEffect(() => cargar(), [cargar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
        <div>
          <p className="font-bold text-slate-800">
            {sujeto.tipo === "mascota" ? "🐾" : "👤"} {sujeto.nombre}
          </p>
          <p className="text-slate-500 text-sm capitalize">
            {sujeto.subtitulo} · {sujeto.numeroExpediente}
          </p>
        </div>
        <div className="flex gap-2">
          {puede("imagenologia.solicitar") && (
            <button type="button" onClick={() => setSolicitar(true)} className="gx-btn-primary">
              + Solicitar estudio
            </button>
          )}
          <button type="button" onClick={onCambiar} className="gx-btn-secondary">
            Cambiar
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        {items.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin estudios para este paciente.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setDetalle(e.id)}
                  className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
                >
                  <span>
                    <span className="font-medium text-slate-800">{e.nombreEstudio}</span>
                    {e.region ? <span className="text-slate-400"> · {e.region}</span> : null}
                    <span className="ml-2 text-slate-400 text-xs">{e.folio}</span>
                    {e.prioridad === "urgente" && (
                      <span className="ml-1 gx-badge-warn">urgente</span>
                    )}
                  </span>
                  <span className={ESTADO_BADGE[e.estado] ?? "gx-badge-info"}>
                    {ESTADO_LABEL[e.estado] ?? e.estado}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {solicitar && (
        <SolicitarModal
          sujeto={sujeto}
          onClose={() => setSolicitar(false)}
          onDone={() => {
            setSolicitar(false);
            cargar();
          }}
        />
      )}
      {detalle && (
        <DetalleEstudio
          id={detalle}
          onClose={() => {
            setDetalle(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function SolicitarModal({
  sujeto,
  onClose,
  onDone,
}: {
  sujeto: Sujeto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [modalidad, setModalidad] = useState("radiografia");
  const [region, setRegion] = useState("");
  const [nombre, setNombre] = useState("Radiografía");
  const [prioridad, setPrioridad] = useState("rutina");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function elegirModalidad(v: string) {
    setModalidad(v);
    const m = MODALIDADES.find(([k]) => k === v);
    if (m && v !== "otro") setNombre(m[1]);
  }

  async function guardar() {
    setBusy(true);
    setError(null);
    const sucursalId = await primeraSucursal();
    if (!sucursalId) {
      setError("No hay sucursal configurada.");
      setBusy(false);
      return;
    }
    try {
      await api("/t/imagenologia", {
        body: {
          sucursalId,
          [sujeto.tipo === "mascota" ? "mascotaId" : "pacienteId"]: sujeto.id,
          modalidad,
          ...(region ? { region } : {}),
          nombreEstudio: nombre,
          prioridad,
          ...(notas ? { notasClinicas: notas } : {}),
        },
      });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo solicitar");
      setBusy(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-3 font-bold text-lg text-slate-800">Solicitar estudio de imagen</h2>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="gx-label">Modalidad</span>
            <select
              value={modalidad}
              onChange={(e) => elegirModalidad(e.target.value)}
              className="gx-input"
            >
              {MODALIDADES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="gx-label">Región</span>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="tórax, abdomen…"
              className="gx-input"
            />
          </label>
        </div>
        <label className="mb-3 block">
          <span className="gx-label">Nombre del estudio</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="gx-input" />
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Prioridad</span>
          <select
            value={prioridad}
            onChange={(e) => setPrioridad(e.target.value)}
            className="gx-input"
          >
            <option value="rutina">Rutina</option>
            <option value="urgente">Urgente</option>
          </select>
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Notas clínicas</span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="gx-input"
          />
        </label>
        {error && <p className="mb-2 text-danger text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={busy || !nombre}
            className="gx-btn-primary"
          >
            {busy ? "Solicitando…" : "Solicitar"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface FilaImg {
  url: string;
  descripcion: string;
}

function DetalleEstudio({ id, onClose }: { id: string; onClose: () => void }) {
  const [e, setE] = useState<Estudio | null>(null);
  const [hallazgos, setHallazgos] = useState("");
  const [impresion, setImpresion] = useState("");
  const [filas, setFilas] = useState<FilaImg[]>([{ url: "", descripcion: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(() => {
    api<Estudio>(`/t/imagenologia/${id}`)
      .then(setE)
      .catch(() => setE(null));
  }, [id]);
  useEffect(() => cargar(), [cargar]);

  async function guardarResultado() {
    setBusy(true);
    setError(null);
    try {
      const imagenes = filas
        .filter((f) => f.url.trim())
        .map((f) => ({
          url: f.url.trim(),
          ...(f.descripcion ? { descripcion: f.descripcion } : {}),
        }));
      await api(`/t/imagenologia/${id}/resultado`, {
        body: {
          ...(hallazgos ? { hallazgos } : {}),
          ...(impresion ? { impresionDiagnostica: impresion } : {}),
          imagenes,
        },
      });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el resultado");
    } finally {
      setBusy(false);
    }
  }

  async function cancelar() {
    const motivo = window.prompt("Motivo de cancelación:");
    if (!motivo || motivo.trim().length < 3) return;
    await api(`/t/imagenologia/${id}/cancelar`, {
      method: "POST",
      body: { motivo: motivo.trim() },
    }).catch(() => undefined);
    onClose();
  }

  const cargado = e?.estado === "resultado_cargado";
  const puedeCargar =
    puede("imagenologia.cargar_resultado") && e && e.estado !== "cancelado" && !cargado;

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-h-[90vh] overflow-y-auto">
        {!e ? (
          <p className="text-slate-400">Cargando…</p>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-lg text-slate-800">{e.nombreEstudio}</h2>
                <p className="text-slate-500 text-sm">
                  {e.folio}
                  {e.region ? ` · ${e.region}` : ""} ·{" "}
                  <span className={ESTADO_BADGE[e.estado]}>{ESTADO_LABEL[e.estado]}</span>
                </p>
                {e.notasClinicas && (
                  <p className="mt-1 text-slate-500 text-xs">{e.notasClinicas}</p>
                )}
              </div>
              <button type="button" onClick={onClose} className="text-slate-400 text-sm">
                cerrar
              </button>
            </div>

            {cargado ? (
              <ResultadoVista estudio={e} />
            ) : puedeCargar ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <h3 className="mb-2 font-semibold text-slate-700 text-sm">Cargar resultado</h3>
                <textarea
                  value={hallazgos}
                  onChange={(ev) => setHallazgos(ev.target.value)}
                  rows={3}
                  placeholder="Hallazgos"
                  className="gx-input mb-2"
                />
                <textarea
                  value={impresion}
                  onChange={(ev) => setImpresion(ev.target.value)}
                  rows={2}
                  placeholder="Impresión diagnóstica"
                  className="gx-input mb-2"
                />
                <p className="mb-1 text-slate-500 text-xs">Imágenes (pega la URL de cada una):</p>
                <div className="mb-2 flex flex-col gap-1">
                  {filas.map((f, i) => (
                    <div key={`img-${i}-${f.url}`} className="grid grid-cols-2 gap-1">
                      <input
                        value={f.url}
                        onChange={(ev) =>
                          setFilas((p) =>
                            p.map((x, j) => (j === i ? { ...x, url: ev.target.value } : x)),
                          )
                        }
                        placeholder="https://…"
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={f.descripcion}
                        onChange={(ev) =>
                          setFilas((p) =>
                            p.map((x, j) => (j === i ? { ...x, descripcion: ev.target.value } : x)),
                          )
                        }
                        placeholder="Descripción (opcional)"
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setFilas((p) => [...p, { url: "", descripcion: "" }])}
                  className="mb-2 text-brand text-xs hover:underline"
                >
                  + imagen
                </button>
                {error && <p className="mb-2 text-danger text-sm">{error}</p>}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={guardarResultado}
                    disabled={busy}
                    className="gx-btn-primary"
                  >
                    {busy ? "Guardando…" : "Guardar resultado"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">Sin resultados aún.</p>
            )}

            {e.estado !== "cancelado" && !cargado && puede("imagenologia.cancelar") && (
              <button
                type="button"
                onClick={cancelar}
                className="mt-3 text-slate-400 text-xs hover:text-danger"
              >
                Cancelar estudio
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ResultadoVista({ estudio }: { estudio: Estudio }) {
  return (
    <div>
      {estudio.hallazgos && (
        <div className="mb-2">
          <p className="font-semibold text-slate-700 text-xs">Hallazgos</p>
          <p className="text-slate-600 text-sm">{estudio.hallazgos}</p>
        </div>
      )}
      {estudio.impresionDiagnostica && (
        <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2">
          <p className="font-semibold text-slate-700 text-xs">Impresión diagnóstica</p>
          <p className="text-slate-600 text-sm">{estudio.impresionDiagnostica}</p>
        </div>
      )}
      {estudio.imagenes && estudio.imagenes.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {estudio.imagenes.map((img) => (
            <a
              key={img.url}
              href={img.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg border border-slate-200"
            >
              <img
                src={img.url}
                alt={img.descripcion ?? "Estudio"}
                className="h-28 w-full bg-slate-100 object-cover"
              />
              {img.descripcion && (
                <span className="block px-2 py-1 text-slate-500 text-xs">{img.descripcion}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
