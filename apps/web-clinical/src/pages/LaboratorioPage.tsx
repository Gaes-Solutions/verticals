import { useCallback, useEffect, useState } from "react";
import { MascotaBuscador, type MascotaLite } from "../components/MascotaBuscador.js";
import { ApiError, api, puede } from "../lib/api.js";

const ESTUDIOS_SUGERIDOS = [
  ["biometria", "Biometría hemática"],
  ["quimica_sanguinea", "Química sanguínea"],
  ["urianalisis", "Urianálisis"],
  ["perfil_tiroideo", "Perfil tiroideo"],
  ["coproparasitoscopico", "Coproparasitoscópico"],
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

interface Parametro {
  parametro: string;
  valor: string;
  unidad?: string;
  rangoMin?: number;
  rangoMax?: number;
  fueraDeRango?: boolean;
}
interface Estudio {
  id: string;
  folio: string;
  nombreEstudio: string;
  tipoEstudio: string;
  prioridad: string;
  estado: string;
  fechaSolicitud: string;
  notasClinicas?: string | null;
  resultadoResumen?: string | null;
  resultadoArchivoUrl?: string | null;
  resultados?: Parametro[];
}

async function primeraSucursal(): Promise<string | null> {
  const s = await api<{ id: string }[]>("/t/sucursales").catch(() => []);
  return s[0]?.id ?? null;
}

export function LaboratorioPage() {
  const [mascota, setMascota] = useState<MascotaLite | null>(null);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-bold text-2xl text-slate-800">Laboratorio</h1>
      <p className="mb-4 text-slate-500 text-sm">Solicitud y resultados de estudios</p>
      {!mascota ? (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <MascotaBuscador onSelect={setMascota} />
        </div>
      ) : (
        <Estudios mascota={mascota} onCambiar={() => setMascota(null)} />
      )}
    </div>
  );
}

function Estudios({ mascota, onCambiar }: { mascota: MascotaLite; onCambiar: () => void }) {
  const [items, setItems] = useState<Estudio[]>([]);
  const [solicitar, setSolicitar] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<{ items: Estudio[] }>(`/t/laboratorio?mascotaId=${mascota.id}&pageSize=50`)
      .then((r) => setItems(r.items ?? []))
      .catch(() => setItems([]));
  }, [mascota.id]);
  useEffect(() => cargar(), [cargar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
        <div>
          <p className="font-bold text-slate-800">{mascota.nombre}</p>
          <p className="text-slate-500 text-sm capitalize">
            {mascota.especie} · {mascota.numeroExpediente}
          </p>
        </div>
        <div className="flex gap-2">
          {puede("laboratorio.solicitar") && (
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
          mascotaId={mascota.id}
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
  mascotaId,
  onClose,
  onDone,
}: {
  mascotaId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tipo, setTipo] = useState("biometria");
  const [nombre, setNombre] = useState("Biometría hemática");
  const [prioridad, setPrioridad] = useState("rutina");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function elegirTipo(v: string) {
    setTipo(v);
    const sug = ESTUDIOS_SUGERIDOS.find(([k]) => k === v);
    if (sug && v !== "otro") setNombre(sug[1]);
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
      await api("/t/laboratorio", {
        body: {
          sucursalId,
          mascotaId,
          tipoEstudio: tipo,
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
        <h2 className="mb-3 font-bold text-lg text-slate-800">Solicitar estudio</h2>
        <label className="mb-3 block">
          <span className="gx-label">Estudio (sugeridos)</span>
          <select value={tipo} onChange={(e) => elegirTipo(e.target.value)} className="gx-input">
            {ESTUDIOS_SUGERIDOS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
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

interface Fila {
  parametro: string;
  valor: string;
  unidad: string;
  rangoMin: string;
  rangoMax: string;
}
const FILA_VACIA: Fila = { parametro: "", valor: "", unidad: "", rangoMin: "", rangoMax: "" };

function DetalleEstudio({ id, onClose }: { id: string; onClose: () => void }) {
  const [e, setE] = useState<Estudio | null>(null);
  const [resumen, setResumen] = useState("");
  const [archivoUrl, setArchivoUrl] = useState("");
  const [filas, setFilas] = useState<Fila[]>([{ ...FILA_VACIA }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(() => {
    api<Estudio>(`/t/laboratorio/${id}`)
      .then(setE)
      .catch(() => setE(null));
  }, [id]);
  useEffect(() => cargar(), [cargar]);

  async function guardarResultado() {
    setBusy(true);
    setError(null);
    try {
      const resultados = filas
        .filter((f) => f.parametro && f.valor)
        .map((f) => ({
          parametro: f.parametro,
          valor: f.valor,
          ...(f.unidad ? { unidad: f.unidad } : {}),
          ...(f.rangoMin ? { rangoMin: Number.parseFloat(f.rangoMin) } : {}),
          ...(f.rangoMax ? { rangoMax: Number.parseFloat(f.rangoMax) } : {}),
        }));
      await api(`/t/laboratorio/${id}/resultado`, {
        body: {
          ...(resumen ? { resultadoResumen: resumen } : {}),
          ...(archivoUrl ? { resultadoArchivoUrl: archivoUrl } : {}),
          resultados,
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
    await api(`/t/laboratorio/${id}/cancelar`, {
      method: "POST",
      body: { motivo: motivo.trim() },
    }).catch(() => undefined);
    onClose();
  }

  const cargado = e?.estado === "resultado_cargado";
  const puedeCargar =
    puede("laboratorio.cargar_resultado") && e && e.estado !== "cancelado" && !cargado;

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
                  {e.folio} ·{" "}
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
                  value={resumen}
                  onChange={(ev) => setResumen(ev.target.value)}
                  rows={2}
                  placeholder="Resumen / interpretación del laboratorio"
                  className="gx-input mb-2"
                />
                <input
                  value={archivoUrl}
                  onChange={(ev) => setArchivoUrl(ev.target.value)}
                  placeholder="URL del PDF/imagen del resultado (opcional)"
                  className="gx-input mb-2"
                />
                <div className="mb-2 flex flex-col gap-1">
                  {filas.map((f, i) => (
                    <div key={`fila-${i}-${f.parametro}`} className="grid grid-cols-5 gap-1">
                      <input
                        value={f.parametro}
                        onChange={(ev) =>
                          setFilas((p) =>
                            p.map((x, j) => (j === i ? { ...x, parametro: ev.target.value } : x)),
                          )
                        }
                        placeholder="Parámetro"
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={f.valor}
                        onChange={(ev) =>
                          setFilas((p) =>
                            p.map((x, j) => (j === i ? { ...x, valor: ev.target.value } : x)),
                          )
                        }
                        placeholder="Valor"
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={f.unidad}
                        onChange={(ev) =>
                          setFilas((p) =>
                            p.map((x, j) => (j === i ? { ...x, unidad: ev.target.value } : x)),
                          )
                        }
                        placeholder="Unidad"
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={f.rangoMin}
                        onChange={(ev) =>
                          setFilas((p) =>
                            p.map((x, j) => (j === i ? { ...x, rangoMin: ev.target.value } : x)),
                          )
                        }
                        placeholder="Mín"
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={f.rangoMax}
                        onChange={(ev) =>
                          setFilas((p) =>
                            p.map((x, j) => (j === i ? { ...x, rangoMax: ev.target.value } : x)),
                          )
                        }
                        placeholder="Máx"
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setFilas((p) => [...p, { ...FILA_VACIA }])}
                  className="mb-2 text-brand text-xs hover:underline"
                >
                  + parámetro
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

            {e.estado !== "cancelado" && !cargado && puede("laboratorio.cancelar") && (
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
      {estudio.resultadoResumen && (
        <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-600 text-sm">
          {estudio.resultadoResumen}
        </p>
      )}
      {estudio.resultados && estudio.resultados.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-slate-200 border-b text-slate-500 text-xs">
                <th className="py-1">Parámetro</th>
                <th className="py-1">Valor</th>
                <th className="py-1">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {estudio.resultados.map((r) => (
                <tr key={r.parametro} className="border-slate-100 border-b">
                  <td className="py-1 text-slate-700">{r.parametro}</td>
                  <td
                    className={`py-1 font-medium ${r.fueraDeRango ? "text-red-600" : "text-slate-800"}`}
                  >
                    {r.valor} {r.unidad ?? ""}
                    {r.fueraDeRango && <span className="ml-1 gx-badge-danger">fuera de rango</span>}
                  </td>
                  <td className="py-1 text-slate-400 text-xs">
                    {r.rangoMin != null || r.rangoMax != null
                      ? `${r.rangoMin ?? "—"} – ${r.rangoMax ?? "—"}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {estudio.resultadoArchivoUrl && (
        <a
          href={estudio.resultadoArchivoUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-brand text-sm hover:underline"
        >
          Ver archivo del resultado
        </a>
      )}
    </div>
  );
}
