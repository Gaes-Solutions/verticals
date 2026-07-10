import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { RecetaImprimible } from "../components/RecetaImprimible.js";
import { type Sujeto, SujetoBuscador } from "../components/SujetoBuscador.js";
import { ApiError, api, getUsuario, puede } from "../lib/api.js";

interface Sucursal {
  id: string;
}
interface Medicamento {
  id: string;
  nombreComercial: string;
  principioActivo: string;
  concentracion?: string | null;
  presentacion?: string | null;
  viaAdministracion?: string | null;
  clasificacionCofepris: string;
  requiereRecetarioOficial: boolean;
}
interface RecetaLite {
  id: string;
  folio: string;
  fechaEmision: string;
  estado: string;
  esGrupoControlado: boolean;
  _count?: { items: number };
}

interface Linea {
  key: string;
  medicamentoCatalogoId?: string;
  nombreSnapshot: string;
  controlado: boolean;
  dosisCantidad: string;
  dosisUnidad: string;
  dosisVia: string;
  frecuenciaHoras: string;
  duracionDias: string;
  instrucciones: string;
}

function esControlado(m: Medicamento): boolean {
  return (
    m.requiereRecetarioOficial ||
    m.clasificacionCofepris === "G_II" ||
    m.clasificacionCofepris === "G_III"
  );
}

export function RecetaPage() {
  const [sujeto, setSujeto] = useState<Sujeto | null>(null);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-bold text-2xl text-slate-800">Receta electrónica</h1>
      <p className="mb-4 text-slate-500 text-sm">
        Emisión con validación COFEPRIS y QR de farmacia
      </p>
      {!sujeto ? (
        <SujetoBuscador onSelect={setSujeto} />
      ) : (
        <RecetaDeSujeto sujeto={sujeto} onCambiar={() => setSujeto(null)} />
      )}
    </div>
  );
}

function RecetaDeSujeto({ sujeto, onCambiar }: { sujeto: Sujeto; onCambiar: () => void }) {
  const [previas, setPrevias] = useState<RecetaLite[]>([]);
  const [recargar, setRecargar] = useState(0);
  const [imprimirId, setImprimirId] = useState<string | null>(null);
  const filtro = sujeto.tipo === "mascota" ? "mascotaId" : "pacienteId";
  useEffect(() => {
    api<{ items: RecetaLite[] }>(`/t/recetas?${filtro}=${sujeto.id}&pageSize=10`)
      .then((r) => setPrevias(r.items ?? []))
      .catch(() => setPrevias([]));
  }, [sujeto.id, filtro, recargar]);

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
        <button type="button" onClick={onCambiar} className="gx-btn-secondary">
          Cambiar paciente
        </button>
      </div>

      {previas.length > 0 && (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-slate-700 text-sm">Recetas previas</h2>
          <ul className="flex flex-col gap-1">
            {previas.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-600">
                  {new Date(r.fechaEmision).toLocaleDateString("es-MX")} · {r.folio} ·{" "}
                  {r._count?.items ?? 0} medicamento(s)
                  {r.esGrupoControlado ? " · controlada" : ""}
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setImprimirId(r.id)}
                    className="text-brand text-xs hover:underline"
                  >
                    Imprimir
                  </button>
                  <span className={r.estado === "emitida" ? "gx-badge-ok" : "gx-badge-info"}>
                    {r.estado}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <RecetaForm sujeto={sujeto} onEmitida={() => setRecargar((n) => n + 1)} />
      {imprimirId && <RecetaImprimible id={imprimirId} onClose={() => setImprimirId(null)} />}
    </div>
  );
}

function MedicamentoSelector({ onAdd }: { onAdd: (m: Medicamento) => void }) {
  const [catalogo, setCatalogo] = useState<Medicamento[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<Medicamento[]>("/t/recetas/medicamentos/catalogo")
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);
  const filtro = q.trim().toLowerCase();
  const sugerencias = filtro
    ? catalogo
        .filter(
          (m) =>
            m.nombreComercial.toLowerCase().includes(filtro) ||
            m.principioActivo.toLowerCase().includes(filtro),
        )
        .slice(0, 8)
    : [];
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Agregar medicamento del catálogo…"
        className="gx-input"
      />
      {sugerencias.length > 0 && (
        <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
          {sugerencias.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onAdd(m);
                setQ("");
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-800">{m.nombreComercial}</span>{" "}
              <span className="text-slate-400 text-xs">
                {m.principioActivo}
                {m.concentracion ? ` · ${m.concentracion}` : ""}
              </span>
              {esControlado(m) && <span className="ml-2 gx-badge-warn">controlado</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LineaEditor({
  linea,
  onChange,
  onQuitar,
}: {
  linea: Linea;
  onChange: (patch: Partial<Linea>) => void;
  onQuitar: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-slate-800 text-sm">
          {linea.nombreSnapshot}
          {linea.controlado && <span className="ml-2 gx-badge-warn">controlado</span>}
        </span>
        <button
          type="button"
          onClick={onQuitar}
          className="text-slate-400 text-xs hover:text-danger"
        >
          quitar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input
          value={linea.dosisCantidad}
          onChange={(e) => onChange({ dosisCantidad: e.target.value })}
          placeholder="Dosis (cant.)"
          className="gx-input"
        />
        <input
          value={linea.dosisUnidad}
          onChange={(e) => onChange({ dosisUnidad: e.target.value })}
          placeholder="Unidad (mg/ml)"
          className="gx-input"
        />
        <input
          value={linea.dosisVia}
          onChange={(e) => onChange({ dosisVia: e.target.value })}
          placeholder="Vía (oral…)"
          className="gx-input"
        />
        <input
          value={linea.frecuenciaHoras}
          onChange={(e) => onChange({ frecuenciaHoras: e.target.value })}
          placeholder="Cada (horas)"
          className="gx-input"
        />
        <input
          value={linea.duracionDias}
          onChange={(e) => onChange({ duracionDias: e.target.value })}
          placeholder="Días"
          className="gx-input"
        />
      </div>
      <input
        value={linea.instrucciones}
        onChange={(e) => onChange({ instrucciones: e.target.value })}
        placeholder="Instrucciones de administración"
        className="gx-input mt-2"
      />
    </div>
  );
}

let lineaSeq = 1;

function RecetaForm({ sujeto, onEmitida }: { sujeto: Sujeto; onEmitida: () => void }) {
  const vigenciaId = useId();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [vigenciaDias, setVigenciaDias] = useState("30");
  const [numeroRecetario, setNumeroRecetario] = useState("");
  const [instruccionesTutor, setInstruccionesTutor] = useState("");
  const [emitida, setEmitida] = useState<{ folio: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const controlada = lineas.some((l) => l.controlado);

  function agregar(m: Medicamento) {
    setLineas((prev) => [
      ...prev,
      {
        key: `l${lineaSeq++}`,
        medicamentoCatalogoId: m.id,
        nombreSnapshot: m.nombreComercial,
        controlado: esControlado(m),
        dosisCantidad: "",
        dosisUnidad: "",
        dosisVia: m.viaAdministracion ?? "",
        frecuenciaHoras: "",
        duracionDias: "",
        instrucciones: "",
      },
    ]);
  }
  function patch(key: string, p: Partial<Linea>) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));
  }
  function quitar(key: string) {
    setLineas((prev) => prev.filter((l) => l.key !== key));
  }

  const valido =
    lineas.length > 0 &&
    lineas.every(
      (l) =>
        l.nombreSnapshot &&
        l.dosisCantidad &&
        l.dosisUnidad &&
        l.dosisVia &&
        l.frecuenciaHoras &&
        l.duracionDias,
    ) &&
    (!controlada || numeroRecetario.trim().length > 0);

  async function emitir(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const medicoUsuarioId = getUsuario()?.id;
    if (!medicoUsuarioId) {
      setError("No se pudo identificar al médico en sesión. Vuelve a entrar.");
      setBusy(false);
      return;
    }
    try {
      const sucursales = await api<Sucursal[]>("/t/sucursales");
      const sucursalId = sucursales[0]?.id;
      if (!sucursalId) {
        setError("No hay sucursal configurada.");
        setBusy(false);
        return;
      }
      const r = await api<{ folio: string; qrValidacionToken: string }>("/t/recetas", {
        body: {
          [sujeto.tipo === "mascota" ? "mascotaId" : "pacienteId"]: sujeto.id,
          medicoUsuarioId,
          sucursalId,
          vigenciaDias: Number.parseInt(vigenciaDias, 10) || 30,
          esGrupoControlado: controlada,
          ...(controlada ? { numeroRecetarioOficial: numeroRecetario.trim() } : {}),
          ...(instruccionesTutor ? { instruccionesGeneralesTutor: instruccionesTutor } : {}),
          items: lineas.map((l) => ({
            ...(l.medicamentoCatalogoId ? { medicamentoCatalogoId: l.medicamentoCatalogoId } : {}),
            nombreSnapshot: l.nombreSnapshot,
            dosisUnidad: l.dosisUnidad,
            dosisCantidad: l.dosisCantidad,
            dosisVia: l.dosisVia,
            frecuenciaHoras: l.frecuenciaHoras,
            duracionDias: Number.parseInt(l.duracionDias, 10),
            ...(l.instrucciones ? { instruccionesAdministracion: l.instrucciones } : {}),
          })),
        },
      });
      setEmitida({ folio: r.folio, token: r.qrValidacionToken });
      onEmitida();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo emitir la receta");
    } finally {
      setBusy(false);
    }
  }

  if (emitida) {
    return (
      <div className="rounded-xl bg-white p-5 text-center shadow-sm">
        <p className="mb-1 font-semibold text-emerald-600">Receta emitida</p>
        <p className="mb-3 text-slate-500 text-sm">Folio {emitida.folio}</p>
        <div className="mb-3 flex justify-center">
          <QRCodeSVG value={emitida.token} size={148} />
        </div>
        <p className="mb-4 text-slate-400 text-xs">
          La farmacia valida la receta escaneando este código.
        </p>
        <button
          type="button"
          onClick={() => {
            setEmitida(null);
            setLineas([]);
            setNumeroRecetario("");
            setInstruccionesTutor("");
          }}
          className="gx-btn-primary"
        >
          Nueva receta
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={emitir} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <MedicamentoSelector onAdd={agregar} />

      {lineas.length === 0 ? (
        <p className="py-2 text-center text-slate-400 text-sm">
          Agrega al menos un medicamento del catálogo o escribe uno arriba.
        </p>
      ) : (
        <div className="space-y-2">
          {lineas.map((l) => (
            <LineaEditor
              key={l.key}
              linea={l}
              onChange={(p) => patch(l.key, p)}
              onQuitar={() => quitar(l.key)}
            />
          ))}
        </div>
      )}

      {controlada && (
        <div className="rounded-lg bg-amber-50 p-3">
          <p className="mb-2 text-amber-700 text-sm">
            Receta con medicamento controlado (COFEPRIS): el número de recetario oficial es
            obligatorio.
          </p>
          <input
            value={numeroRecetario}
            onChange={(e) => setNumeroRecetario(e.target.value)}
            placeholder="Número de recetario oficial"
            className="gx-input"
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={vigenciaId} className="block">
          <span className="gx-label">Vigencia (días)</span>
          <input
            id={vigenciaId}
            type="number"
            min="1"
            value={vigenciaDias}
            onChange={(e) => setVigenciaDias(e.target.value)}
            className="gx-input"
          />
          <span className="mt-1 block text-slate-400 text-xs">Recomendado: 30 días</span>
        </label>
      </div>

      <textarea
        value={instruccionesTutor}
        onChange={(e) => setInstruccionesTutor(e.target.value)}
        rows={2}
        placeholder="Instrucciones generales para el tutor"
        className="gx-input"
      />

      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex justify-end">
        {puede("recetas.emitir") && (
          <button type="submit" disabled={busy || !valido} className="gx-btn-primary">
            {busy ? "Emitiendo…" : "Emitir receta"}
          </button>
        )}
      </div>
    </form>
  );
}
