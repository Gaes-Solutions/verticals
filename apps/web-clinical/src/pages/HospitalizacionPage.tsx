import { useCallback, useEffect, useState } from "react";
import { MascotaBuscador, type MascotaLite } from "../components/MascotaBuscador.js";
import { ApiError, api, getUsuario, puede } from "../lib/api.js";

const CAMA_TIPOS = [
  ["general", "General"],
  ["cuidados_intensivos", "Cuidados intensivos"],
  ["aislamiento", "Aislamiento"],
  ["cirugia_recuperacion", "Recuperación cirugía"],
  ["pediatria", "Pediatría"],
] as const;
const CAMA_ESTADOS = [
  "libre",
  "ocupada",
  "limpieza",
  "mantenimiento",
  "fuera_de_servicio",
] as const;
const CARGO_TIPOS = [
  ["estancia_diaria", "Estancia diaria"],
  ["medicamento", "Medicamento"],
  ["procedimiento", "Procedimiento"],
  ["laboratorio", "Laboratorio"],
  ["imagenologia", "Imagenología"],
  ["consumible", "Consumible"],
  ["honorarios_medicos", "Honorarios médicos"],
  ["otro", "Otro"],
] as const;

const ESTADO_BADGE: Record<string, string> = {
  libre: "gx-badge-ok",
  ocupada: "gx-badge-warn",
  limpieza: "gx-badge-info",
  mantenimiento: "gx-badge-info",
  fuera_de_servicio: "gx-badge-danger",
};

interface Cama {
  id: string;
  codigo: string;
  nombre?: string | null;
  tipo: string;
  estado: string;
  tarifaPorNoche?: string | null;
}
interface Sucursal {
  id: string;
}
interface Medicamento {
  id: string;
  nombreComercial: string;
  principioActivo: string;
}
interface Kardex {
  id: string;
  horaProgramada: string;
  horaAplicada?: string | null;
  estado: string;
}
interface Medicacion {
  id: string;
  medicamentoNombreSnapshot: string;
  dosis: string;
  via: string;
  frecuenciaHoras: number;
  estado: string;
  aplicaciones: Kardex[];
}
interface Cargo {
  id: string;
  tipo: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  monto: string;
}
interface Signo {
  id: string;
  hora: string;
  temperaturaC?: string | null;
  frecuenciaCardiaca?: number | null;
  frecuenciaRespiratoria?: number | null;
  saturacionO2?: number | null;
  dolorEscala?: number | null;
  alertasMarcadas?: string[];
}
interface HospLite {
  id: string;
  folio: string;
  estado: string;
  fechaIngreso: string;
  motivoIngreso: string;
  cama?: { codigo: string; tipo: string } | null;
  mascota?: { nombre: string; especie: string; numeroExpediente: string } | null;
  medicoResponsable?: { nombre: string } | null;
}
interface HospDetalle extends HospLite {
  tarifaEstanciaDiaria?: string | null;
  medicacionesProgramadas: Medicacion[];
  cargos: Cargo[];
  signosVitales: Signo[];
}

async function primeraSucursal(): Promise<string | null> {
  const s = await api<Sucursal[]>("/t/sucursales").catch(() => []);
  return s[0]?.id ?? null;
}

export function HospitalizacionPage() {
  const [tab, setTab] = useState<"ingresos" | "camas">("ingresos");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 font-bold text-2xl text-slate-800">Hospitalización</h1>
      <div className="mb-4 flex gap-2">
        {(
          [
            ["ingresos", "Ingresos"],
            ["camas", "Camas"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
              tab === k ? "bg-brand text-white" : "bg-white text-slate-600 shadow-sm"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "ingresos" ? <IngresosTab /> : <CamasTab />}
    </div>
  );
}

function CamasTab() {
  const [camas, setCamas] = useState<Cama[]>([]);
  const [nueva, setNueva] = useState(false);
  const gestiona = puede("camas.gestionar");

  const cargar = useCallback(() => {
    api<Cama[]>("/t/camas")
      .then(setCamas)
      .catch(() => setCamas([]));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function cambiarEstado(id: string, estado: string) {
    await api(`/t/camas/${id}/cambiar-estado`, { method: "POST", body: { estado } }).catch(
      () => undefined,
    );
    cargar();
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {gestiona && (
          <button type="button" onClick={() => setNueva(true)} className="gx-btn-primary">
            + Nueva cama
          </button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {camas.map((c) => (
          <div key={c.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">
                {c.codigo}
                {c.nombre ? ` · ${c.nombre}` : ""}
              </span>
              <span className={ESTADO_BADGE[c.estado] ?? "gx-badge-info"}>
                {c.estado.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-slate-500 text-sm capitalize">{c.tipo.replace(/_/g, " ")}</p>
            {gestiona && (
              <select
                value={c.estado}
                onChange={(e) => cambiarEstado(c.id, e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
              >
                {CAMA_ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {e.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
        {camas.length === 0 && <p className="text-slate-400">No hay camas registradas.</p>}
      </div>
      {nueva && (
        <NuevaCamaModal
          onClose={() => setNueva(false)}
          onDone={() => {
            setNueva(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function NuevaCamaModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("general");
  const [tarifa, setTarifa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      await api("/t/camas", {
        body: {
          sucursalId,
          codigo,
          ...(nombre ? { nombre } : {}),
          tipo,
          ...(tarifa ? { tarifaPorNoche: tarifa } : {}),
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear");
      setBusy(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-3 font-bold text-lg text-slate-800">Nueva cama</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="gx-label">Código</span>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Nombre (opcional)</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="gx-input">
              {CAMA_TIPOS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="gx-label">Tarifa/noche</span>
            <input
              type="number"
              value={tarifa}
              onChange={(e) => setTarifa(e.target.value)}
              className="gx-input"
            />
          </label>
        </div>
        {error && <p className="mt-2 text-danger text-sm">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={busy || !codigo}
            className="gx-btn-primary"
          >
            {busy ? "Guardando…" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IngresosTab() {
  const [lista, setLista] = useState<HospLite[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<{ items: HospLite[] }>("/t/hospitalizaciones?estado=activa&pageSize=100")
      .then((r) => setLista(r.items ?? []))
      .catch(() => setLista([]));
  }, []);
  useEffect(() => cargar(), [cargar]);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {puede("hospitalizacion.crear") && (
          <button type="button" onClick={() => setNuevo(true)} className="gx-btn-primary">
            + Nuevo ingreso
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {lista.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setDetalle(h.id)}
            className="rounded-xl bg-white p-4 text-left shadow-sm hover:ring-1 hover:ring-brand"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">
                {h.mascota?.nombre ?? "—"} <span className="text-slate-400 text-xs">{h.folio}</span>
              </span>
              <span className="gx-badge-warn">{h.cama?.codigo ?? "sin cama"}</span>
            </div>
            <p className="text-slate-500 text-sm">{h.motivoIngreso}</p>
            <p className="text-slate-400 text-xs">
              Ingreso {new Date(h.fechaIngreso).toLocaleString("es-MX")} ·{" "}
              {h.medicoResponsable?.nombre ?? ""}
            </p>
          </button>
        ))}
        {lista.length === 0 && (
          <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
            No hay pacientes hospitalizados.
          </p>
        )}
      </div>
      {nuevo && (
        <NuevoIngresoModal
          onClose={() => setNuevo(false)}
          onDone={() => {
            setNuevo(false);
            cargar();
          }}
        />
      )}
      {detalle && (
        <DetalleHosp
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

function NuevoIngresoModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [mascota, setMascota] = useState<MascotaLite | null>(null);
  const [camas, setCamas] = useState<Cama[]>([]);
  const [camaId, setCamaId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Cama[]>("/t/camas?estado=libre")
      .then(setCamas)
      .catch(() => setCamas([]));
  }, []);

  async function guardar() {
    setBusy(true);
    setError(null);
    const medicoResponsableId = getUsuario()?.id;
    if (!mascota || !camaId || !medicoResponsableId) {
      setError("Selecciona paciente y cama.");
      setBusy(false);
      return;
    }
    const sucursalId = await primeraSucursal();
    if (!sucursalId) {
      setError("No hay sucursal configurada.");
      setBusy(false);
      return;
    }
    try {
      await api("/t/hospitalizaciones", {
        body: {
          sucursalId,
          camaId,
          mascotaId: mascota.id,
          medicoResponsableId,
          motivoIngreso: motivo,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo ingresar");
      setBusy(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-3 font-bold text-lg text-slate-800">Nuevo ingreso</h2>
        {mascota ? (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium">{mascota.nombre}</span>
            <button
              type="button"
              onClick={() => setMascota(null)}
              className="text-slate-400 text-xs"
            >
              cambiar
            </button>
          </div>
        ) : (
          <div className="mb-3">
            <MascotaBuscador onSelect={setMascota} />
          </div>
        )}
        <label className="mb-3 block">
          <span className="gx-label">Cama libre</span>
          <select value={camaId} onChange={(e) => setCamaId(e.target.value)} className="gx-input">
            <option value="">Selecciona…</option>
            {camas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.tipo.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          {camas.length === 0 && (
            <span className="mt-1 block text-amber-600 text-xs">No hay camas libres.</span>
          )}
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Motivo de ingreso</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
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
            disabled={busy || !mascota || !camaId || !motivo}
            className="gx-btn-primary"
          >
            {busy ? "Ingresando…" : "Ingresar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetalleHosp({ id, onClose }: { id: string; onClose: () => void }) {
  const [h, setH] = useState<HospDetalle | null>(null);

  const cargar = useCallback(() => {
    api<HospDetalle>(`/t/hospitalizaciones/${id}`)
      .then(setH)
      .catch(() => setH(null));
  }, [id]);
  useEffect(() => cargar(), [cargar]);

  async function alta() {
    const motivoAlta = window.prompt("Motivo del alta:");
    if (!motivoAlta || motivoAlta.trim().length < 1) return;
    await api(`/t/hospitalizaciones/${id}/alta`, {
      method: "POST",
      body: { motivoAlta: motivoAlta.trim(), generarVenta: true },
    }).catch(() => undefined);
    onClose();
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-h-[90vh] overflow-y-auto">
        {!h ? (
          <p className="text-slate-400">Cargando…</p>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-lg text-slate-800">{h.mascota?.nombre ?? "—"}</h2>
                <p className="text-slate-500 text-sm">
                  {h.folio} · cama {h.cama?.codigo ?? "—"} · {h.motivoIngreso}
                </p>
              </div>
              <button type="button" onClick={onClose} className="text-slate-400 text-sm">
                cerrar
              </button>
            </div>

            <SignosSeccion hosp={h} onChange={cargar} />
            <MedicacionSeccion hosp={h} onChange={cargar} />
            <CargosSeccion hosp={h} onChange={cargar} />

            {h.estado === "activa" && puede("hospitalizacion.alta") && (
              <button type="button" onClick={alta} className="mt-4 w-full gx-btn-primary">
                Dar de alta (genera venta de cargos)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SignosSeccion({ hosp, onChange }: { hosp: HospDetalle; onChange: () => void }) {
  const [campos, setCampos] = useState({
    temperaturaC: "",
    frecuenciaCardiaca: "",
    frecuenciaRespiratoria: "",
    saturacionO2: "",
    dolorEscala: "",
  });
  const puedeCapturar = puede("kardex.aplicar");

  async function capturar() {
    const body: Record<string, number> = {};
    for (const [k, v] of Object.entries(campos)) {
      const n = Number.parseFloat(v);
      if (Number.isFinite(n)) body[k] = n;
    }
    if (Object.keys(body).length === 0) return;
    await api(`/t/hospitalizaciones/${hosp.id}/signos-vitales`, { method: "POST", body }).catch(
      () => undefined,
    );
    setCampos({
      temperaturaC: "",
      frecuenciaCardiaca: "",
      frecuenciaRespiratoria: "",
      saturacionO2: "",
      dolorEscala: "",
    });
    onChange();
  }

  return (
    <section className="mb-4 rounded-lg border border-slate-200 p-3">
      <h3 className="mb-2 font-semibold text-slate-700 text-sm">Signos vitales</h3>
      {hosp.signosVitales.length > 0 && (
        <div className="mb-2 max-h-32 overflow-y-auto text-sm">
          {hosp.signosVitales
            .slice()
            .reverse()
            .map((s) => (
              <div key={s.id} className="flex items-center gap-2 border-slate-100 border-b py-1">
                <span className="text-slate-400 text-xs">
                  {new Date(s.hora).toLocaleTimeString("es-MX", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-slate-600">
                  {s.temperaturaC ? `${s.temperaturaC}°C ` : ""}
                  {s.frecuenciaCardiaca ? `FC ${s.frecuenciaCardiaca} ` : ""}
                  {s.saturacionO2 ? `SpO₂ ${s.saturacionO2}% ` : ""}
                  {s.dolorEscala != null ? `dolor ${s.dolorEscala}` : ""}
                </span>
                {s.alertasMarcadas && s.alertasMarcadas.length > 0 && (
                  <span className="gx-badge-danger">{s.alertasMarcadas.length} alerta(s)</span>
                )}
              </div>
            ))}
        </div>
      )}
      {puedeCapturar && hosp.estado === "activa" && (
        <div className="flex flex-wrap items-end gap-2">
          {(
            [
              ["temperaturaC", "Temp"],
              ["frecuenciaCardiaca", "FC"],
              ["frecuenciaRespiratoria", "FR"],
              ["saturacionO2", "SpO₂"],
              ["dolorEscala", "Dolor"],
            ] as const
          ).map(([k, l]) => (
            <input
              key={k}
              type="number"
              value={campos[k]}
              onChange={(e) => setCampos((c) => ({ ...c, [k]: e.target.value }))}
              placeholder={l}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
          ))}
          <button type="button" onClick={capturar} className="gx-btn-secondary">
            Registrar
          </button>
        </div>
      )}
    </section>
  );
}

function MedicacionSeccion({ hosp, onChange }: { hosp: HospDetalle; onChange: () => void }) {
  const [agregar, setAgregar] = useState(false);

  async function aplicar(kardexId: string, estado: "aplicada" | "omitida") {
    const body: Record<string, unknown> = { estado };
    if (estado === "aplicada") body.horaAplicada = new Date().toISOString();
    else {
      const motivoOmision = window.prompt("Motivo de omisión:") ?? "";
      if (!motivoOmision) return;
      body.motivoOmision = motivoOmision;
    }
    await api(`/t/hospitalizaciones/kardex/${kardexId}/aplicar`, { method: "POST", body }).catch(
      () => undefined,
    );
    onChange();
  }

  return (
    <section className="mb-4 rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 text-sm">Medicación / Kardex</h3>
        {puede("medicacion.programar") && hosp.estado === "activa" && (
          <button
            type="button"
            onClick={() => setAgregar((v) => !v)}
            className="text-brand text-sm"
          >
            {agregar ? "cerrar" : "+ programar"}
          </button>
        )}
      </div>
      {agregar && (
        <ProgramarMedicacion
          hospId={hosp.id}
          onDone={() => {
            setAgregar(false);
            onChange();
          }}
        />
      )}
      <div className="flex flex-col gap-2">
        {hosp.medicacionesProgramadas.map((m) => (
          <div key={m.id} className="rounded-lg bg-slate-50 p-2">
            <p className="font-medium text-slate-800 text-sm">
              {m.medicamentoNombreSnapshot}{" "}
              <span className="text-slate-400 text-xs">
                {m.dosis} · {m.via} · c/{m.frecuenciaHoras}h
              </span>
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {m.aplicaciones.map((k) => (
                <KardexChip
                  key={k.id}
                  k={k}
                  onAplicar={aplicar}
                  activa={hosp.estado === "activa"}
                />
              ))}
            </div>
          </div>
        ))}
        {hosp.medicacionesProgramadas.length === 0 && (
          <p className="text-slate-400 text-sm">Sin medicación programada.</p>
        )}
      </div>
    </section>
  );
}

function KardexChip({
  k,
  onAplicar,
  activa,
}: {
  k: Kardex;
  onAplicar: (id: string, estado: "aplicada" | "omitida") => void;
  activa: boolean;
}) {
  const hora = new Date(k.horaProgramada).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (k.estado !== "pendiente") {
    const cls = k.estado === "aplicada" ? "gx-badge-ok" : "gx-badge-info";
    return <span className={cls}>{hora}</span>;
  }
  if (!activa || !puede("kardex.aplicar")) {
    return <span className="gx-badge-warn">{hora}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs">
      {hora}
      <button
        type="button"
        onClick={() => onAplicar(k.id, "aplicada")}
        className="text-emerald-600"
      >
        ✓
      </button>
      <button type="button" onClick={() => onAplicar(k.id, "omitida")} className="text-slate-400">
        ✕
      </button>
    </span>
  );
}

function ProgramarMedicacion({ hospId, onDone }: { hospId: string; onDone: () => void }) {
  const [catalogo, setCatalogo] = useState<Medicamento[]>([]);
  const [medId, setMedId] = useState("");
  const [dosis, setDosis] = useState("");
  const [via, setVia] = useState("IV");
  const [frecuencia, setFrecuencia] = useState("8");
  const [duracion, setDuracion] = useState("3");
  const [indicacion, setIndicacion] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Medicamento[]>("/t/recetas/medicamentos/catalogo")
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  async function guardar() {
    if (!medId || !dosis || !indicacion) return;
    setBusy(true);
    await api(`/t/hospitalizaciones/${hospId}/medicaciones`, {
      method: "POST",
      body: {
        medicamentoCatalogoId: medId,
        dosis,
        via,
        frecuenciaHoras: Number.parseInt(frecuencia, 10),
        duracionDias: Number.parseInt(duracion, 10),
        horaInicio: new Date().toISOString(),
        indicacionMedica: indicacion,
      },
    }).catch(() => undefined);
    setBusy(false);
    onDone();
  }

  return (
    <div className="mb-3 rounded-lg border border-slate-200 p-2">
      <select value={medId} onChange={(e) => setMedId(e.target.value)} className="gx-input mb-2">
        <option value="">Medicamento…</option>
        {catalogo.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nombreComercial}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          value={dosis}
          onChange={(e) => setDosis(e.target.value)}
          placeholder="Dosis"
          className="gx-input"
        />
        <input
          value={via}
          onChange={(e) => setVia(e.target.value)}
          placeholder="Vía"
          className="gx-input"
        />
        <input
          value={frecuencia}
          onChange={(e) => setFrecuencia(e.target.value)}
          placeholder="Cada (h)"
          className="gx-input"
        />
        <input
          value={duracion}
          onChange={(e) => setDuracion(e.target.value)}
          placeholder="Días"
          className="gx-input"
        />
      </div>
      <input
        value={indicacion}
        onChange={(e) => setIndicacion(e.target.value)}
        placeholder="Indicación médica"
        className="gx-input mt-2"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={guardar}
          disabled={busy || !medId || !dosis || !indicacion}
          className="gx-btn-primary"
        >
          Programar
        </button>
      </div>
    </div>
  );
}

function CargosSeccion({ hosp, onChange }: { hosp: HospDetalle; onChange: () => void }) {
  const [tipo, setTipo] = useState("procedimiento");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precio, setPrecio] = useState("");

  const total = hosp.cargos.reduce((s, c) => s + Number(c.monto), 0);

  async function agregar() {
    if (!descripcion || !precio) return;
    await api(`/t/hospitalizaciones/${hosp.id}/cargos`, {
      method: "POST",
      body: { tipo, descripcion, cantidad, precioUnitario: precio },
    }).catch(() => undefined);
    setDescripcion("");
    setPrecio("");
    setCantidad("1");
    onChange();
  }

  return (
    <section className="mb-4 rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 text-sm">Cargos</h3>
        <span className="font-semibold text-slate-800 text-sm">${total.toFixed(2)}</span>
      </div>
      {hosp.cargos.length > 0 && (
        <ul className="mb-2 text-sm">
          {hosp.cargos.map((c) => (
            <li key={c.id} className="flex justify-between border-slate-100 border-b py-1">
              <span className="text-slate-600">{c.descripcion}</span>
              <span className="text-slate-500">${Number(c.monto).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
      {puede("hospitalizacion.crear") && hosp.estado === "activa" && (
        <div className="flex flex-wrap items-end gap-2">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            {CARGO_TIPOS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción"
            className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="Cant"
            className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="P. unit"
            className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
          <button type="button" onClick={agregar} className="gx-btn-secondary">
            Agregar
          </button>
        </div>
      )}
    </section>
  );
}
