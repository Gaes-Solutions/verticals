import { useCallback, useEffect, useState } from "react";
import {
  type Consent,
  type EmergencyQr,
  type ExpedienteItem,
  type FamiliaItem,
  type Paciente,
  api,
} from "../lib/api.js";

type Tab = "expediente" | "consentimientos" | "familia" | "emergencia";

const RESOURCE_LABEL: Record<string, string> = {
  Observation: "Estudio / signo",
  Condition: "Diagnóstico",
  MedicationRequest: "Receta",
  Immunization: "Vacuna",
  Encounter: "Consulta",
  DiagnosticReport: "Reporte",
  AllergyIntolerance: "Alergia",
};

export function Portal({ nombre, onLogout }: { nombre: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("expediente");

  return (
    <div className="min-h-full">
      <header className="flex items-center justify-between bg-brand px-4 py-3 text-white">
        <div>
          <span className="font-bold">Mi expediente</span>
          <span className="ml-2 hidden text-sm text-teal-100 sm:inline">{nombre}</span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded bg-brand-dark px-3 py-1 text-sm"
        >
          Salir
        </button>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["expediente", "Expediente"],
              ["consentimientos", "Consentimientos"],
              ["familia", "Familia"],
              ["emergencia", "Emergencia"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === key ? "bg-brand text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "expediente" && <ExpedienteTab />}
        {tab === "consentimientos" && <ConsentimientosTab />}
        {tab === "familia" && <FamiliaTab />}
        {tab === "emergencia" && <EmergenciaTab />}
      </div>
    </div>
  );
}

function ExpedienteTab() {
  const [me, setMe] = useState<Paciente | null>(null);
  const [items, setItems] = useState<ExpedienteItem[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      api<Paciente>("/patient-portal/me"),
      api<ExpedienteItem[]>("/patient-portal/expediente"),
    ])
      .then(([m, e]) => {
        setMe(m);
        setItems(e);
      })
      .finally(() => setCargando(false));
  }, []);

  async function exportar() {
    const datos = await api<unknown>("/patient-portal/export");
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mis-datos-gaessoft.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (cargando) return <p className="text-center text-slate-400">Cargando…</p>;

  return (
    <div>
      {me && (
        <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
          <p className="text-lg font-semibold text-slate-800">
            {me.nombre} {me.apellidos ?? ""}
          </p>
          <p className="text-sm text-slate-500">{me.phoneE164 ?? me.email ?? ""}</p>
          {me.birthDate && (
            <p className="text-sm text-slate-500">
              Nacimiento: {new Date(me.birthDate).toLocaleDateString("es-MX")}
            </p>
          )}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-slate-800">Mi historial</h2>
        <button type="button" onClick={exportar} className="text-sm text-brand hover:underline">
          Exportar mis datos
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-slate-400">Aún no hay registros en tu expediente.</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.id} className="flex justify-between rounded-lg bg-white p-3 shadow-sm">
              <span className="text-slate-700">
                {RESOURCE_LABEL[r.resourceType] ?? r.resourceType}
              </span>
              <span className="text-sm text-slate-400">
                {new Date(r.effectiveDate).toLocaleDateString("es-MX")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConsentimientosTab() {
  const [items, setItems] = useState<Consent[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    api<Consent[]>("/patient-portal/consents")
      .then(setItems)
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => cargar(), [cargar]);

  async function revocar(id: string) {
    await api(`/patient-portal/consents/${id}`, { method: "DELETE" }).catch(() => undefined);
    cargar();
  }

  if (cargando) return <p className="text-center text-slate-400">Cargando…</p>;
  if (items.length === 0)
    return <p className="text-slate-400">No has dado acceso a tu expediente a ninguna clínica.</p>;

  return (
    <div className="space-y-2">
      <p className="mb-2 text-sm text-slate-500">Clínicas con acceso a tu expediente:</p>
      {items.map((c) => (
        <div
          key={c.id}
          className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm"
        >
          <div>
            <p className="text-slate-700">Alcance: {c.scope}</p>
            <p className="text-xs text-slate-400">
              Otorgado {new Date(c.grantedAt).toLocaleDateString("es-MX")}
              {c.revokedAt ? " · revocado" : ""}
            </p>
          </div>
          {!c.revokedAt && (
            <button
              type="button"
              onClick={() => revocar(c.id)}
              className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              Revocar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function FamiliaTab() {
  const [items, setItems] = useState<FamiliaItem[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<FamiliaItem[]>("/patient-portal/familia")
      .then(setItems)
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <p className="text-center text-slate-400">Cargando…</p>;
  if (items.length === 0)
    return <p className="text-slate-400">No tienes dependientes vinculados.</p>;

  return (
    <div className="space-y-2">
      {items.map((f) => (
        <div key={f.id} className="rounded-lg bg-white p-3 shadow-sm">
          <p className="font-medium text-slate-800">
            {f.dependiente.nombre} {f.dependiente.apellidos ?? ""}
          </p>
          <p className="text-xs text-slate-400">Acceso: {f.permissionScope}</p>
        </div>
      ))}
    </div>
  );
}

function EmergenciaTab() {
  const [qr, setQr] = useState<EmergencyQr | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    api<EmergencyQr>("/patient-portal/emergency-qr")
      .then(setQr)
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => cargar(), [cargar]);

  async function generar() {
    await api("/patient-portal/emergency-qr", {
      body: { visibleFields: ["nombre", "tipoSangre", "alergias", "contactoEmergencia"] },
    }).catch(() => undefined);
    cargar();
  }

  if (cargando) return <p className="text-center text-slate-400">Cargando…</p>;

  const configurado = qr && qr.configured !== false && qr.qrToken;

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-bold text-slate-800">QR de emergencia</h2>
      <p className="mb-4 text-sm text-slate-500">
        Un QR público con solo los datos que elijas (tipo de sangre, alergias, contacto), accesible
        por paramédicos sin iniciar sesión.
      </p>
      {configurado ? (
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-sm text-slate-600">Tu QR está activo.</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">
            /emergency/{qr?.qrToken}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={generar}
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
        >
          Generar mi QR de emergencia
        </button>
      )}
    </div>
  );
}
