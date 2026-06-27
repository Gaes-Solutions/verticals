import { useCallback, useEffect, useState } from "react";
import { MascotaBuscador, type MascotaLite } from "../components/MascotaBuscador.js";
import { ApiError, api, puede } from "../lib/api.js";

interface Vacuna {
  id: string;
  nombreComercial: string;
  viaAplicacion?: string | null;
}
interface Aplicada {
  id: string;
  vacunaNombre: string;
  fechaAplicacion: string;
  numeroLote: string;
  proximaAplicacionFecha: string | null;
  estado: "vigente" | "proxima" | "vencida";
}
interface ProximaDosis {
  vacunaNombre: string;
  fechaProgramada: string;
  diasFaltantes: number;
}
interface Cartilla {
  sujeto: { tipo: string; id: string; nombre: string };
  vacunacionesAplicadas: Aplicada[];
  proximasDosis: ProximaDosis[];
}

const ESTADO_BADGE: Record<string, string> = {
  vigente: "gx-badge-ok",
  proxima: "gx-badge-info",
  vencida: "gx-badge-danger",
};

export function CartillaPage() {
  const [mascota, setMascota] = useState<MascotaLite | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-bold text-2xl text-slate-800">Cartilla de vacunación</h1>
      <p className="mb-4 text-slate-500 text-sm">Historial de vacunas y próximos refuerzos</p>

      {!mascota ? (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <MascotaBuscador onSelect={setMascota} />
        </div>
      ) : (
        <Cartilla mascota={mascota} onCambiar={() => setMascota(null)} />
      )}
    </div>
  );
}

function Cartilla({ mascota, onCambiar }: { mascota: MascotaLite; onCambiar: () => void }) {
  const [cartilla, setCartilla] = useState<Cartilla | null>(null);
  const [aplicar, setAplicar] = useState(false);

  const cargar = useCallback(() => {
    api<Cartilla>(`/t/vacunaciones/cartilla?mascotaId=${mascota.id}`)
      .then(setCartilla)
      .catch(() => setCartilla(null));
  }, [mascota.id]);
  useEffect(() => cargar(), [cargar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
        <div>
          <p className="font-bold text-slate-800">{mascota.nombre}</p>
          <p className="text-slate-500 text-sm capitalize">
            {mascota.especie}
            {mascota.raza ? ` · ${mascota.raza}` : ""} · {mascota.numeroExpediente}
          </p>
        </div>
        <div className="flex gap-2">
          {puede("vacunas.aplicar") && (
            <button type="button" onClick={() => setAplicar(true)} className="gx-btn-primary">
              + Aplicar vacuna
            </button>
          )}
          <button type="button" onClick={onCambiar} className="gx-btn-secondary">
            Cambiar
          </button>
        </div>
      </div>

      {cartilla && cartilla.proximasDosis.length > 0 && (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-slate-700 text-sm">Próximos refuerzos</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {cartilla.proximasDosis.map((d) => (
              <li key={`${d.vacunaNombre}-${d.fechaProgramada}`} className="flex justify-between">
                <span className="text-slate-600">{d.vacunaNombre}</span>
                <span className={d.diasFaltantes < 0 ? "text-red-600" : "text-slate-500"}>
                  {new Date(d.fechaProgramada).toLocaleDateString("es-MX")} (
                  {d.diasFaltantes < 0 ? `vencida ${-d.diasFaltantes}d` : `en ${d.diasFaltantes}d`})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold text-slate-700 text-sm">Vacunas aplicadas</h2>
        {!cartilla || cartilla.vacunacionesAplicadas.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin vacunas registradas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cartilla.vacunacionesAplicadas.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium text-slate-800">{v.vacunaNombre}</span>
                  <p className="text-slate-400 text-xs">
                    {new Date(v.fechaAplicacion).toLocaleDateString("es-MX")} · lote {v.numeroLote}
                    {v.proximaAplicacionFecha
                      ? ` · refuerzo ${new Date(v.proximaAplicacionFecha).toLocaleDateString("es-MX")}`
                      : ""}
                  </p>
                </div>
                <span className={ESTADO_BADGE[v.estado] ?? "gx-badge-info"}>{v.estado}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {aplicar && (
        <AplicarVacunaModal
          mascotaId={mascota.id}
          onClose={() => setAplicar(false)}
          onDone={() => {
            setAplicar(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function AplicarVacunaModal({
  mascotaId,
  onClose,
  onDone,
}: {
  mascotaId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [catalogo, setCatalogo] = useState<Vacuna[]>([]);
  const [vacunaId, setVacunaId] = useState("");
  const [numeroLote, setNumeroLote] = useState("");
  const [caducidad, setCaducidad] = useState("");
  const [via, setVia] = useState("");
  const [dosis, setDosis] = useState("");
  const [reaccion, setReaccion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Vacuna[]>("/t/vacunaciones/catalogo")
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  async function guardar() {
    if (!vacunaId || !numeroLote || !caducidad) {
      setError("Vacuna, lote y caducidad son obligatorios.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/t/vacunaciones", {
        body: {
          mascotaId,
          vacunaCatalogoId: vacunaId,
          numeroLote,
          caducidadLote: new Date(`${caducidad}T00:00:00`).toISOString(),
          ...(via ? { viaAdministracion: via } : {}),
          ...(dosis ? { dosisAplicada: dosis } : {}),
          ...(reaccion ? { reaccionAdversaObservada: reaccion } : {}),
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la vacuna");
      setBusy(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-3 font-bold text-lg text-slate-800">Aplicar vacuna</h2>
        <label className="mb-3 block">
          <span className="gx-label">Vacuna</span>
          <select
            value={vacunaId}
            onChange={(e) => {
              setVacunaId(e.target.value);
              const v = catalogo.find((x) => x.id === e.target.value);
              if (v?.viaAplicacion) setVia(v.viaAplicacion);
            }}
            className="gx-input"
          >
            <option value="">Selecciona…</option>
            {catalogo.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombreComercial}
              </option>
            ))}
          </select>
        </label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="gx-label">Número de lote</span>
            <input
              value={numeroLote}
              onChange={(e) => setNumeroLote(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Caducidad del lote</span>
            <input
              type="date"
              value={caducidad}
              onChange={(e) => setCaducidad(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Vía</span>
            <input value={via} onChange={(e) => setVia(e.target.value)} className="gx-input" />
          </label>
          <label className="block">
            <span className="gx-label">Dosis</span>
            <input value={dosis} onChange={(e) => setDosis(e.target.value)} className="gx-input" />
          </label>
        </div>
        <label className="mb-3 block">
          <span className="gx-label">Reacción adversa observada (opcional)</span>
          <input
            value={reaccion}
            onChange={(e) => setReaccion(e.target.value)}
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
            disabled={busy || !vacunaId || !numeroLote || !caducidad}
            className="gx-btn-primary"
          >
            {busy ? "Guardando…" : "Registrar vacuna"}
          </button>
        </div>
      </div>
    </div>
  );
}
