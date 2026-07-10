import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

interface RecetaItem {
  id: string;
  nombreSnapshot: string;
  concentracionSnapshot?: string | null;
  dosisCantidad: string;
  dosisUnidad: string;
  dosisVia: string;
  frecuenciaHoras: string;
  duracionDias: number;
  totalUnidadesDispensar?: string | null;
  instruccionesAdministracion?: string | null;
}
interface RecetaDetalle {
  id: string;
  folio: string;
  fechaEmision: string;
  fechaExpiracion?: string | null;
  qrValidacionToken: string;
  esGrupoControlado: boolean;
  numeroRecetarioOficial?: string | null;
  instruccionesGeneralesTutor?: string | null;
  medico?: { nombre: string } | null;
  mascota?: {
    nombre: string;
    especie: string;
    raza?: string | null;
    numeroExpediente: string;
  } | null;
  paciente?: { nombre: string; apellidoPaterno?: string | null; numeroExpediente: string } | null;
  items: RecetaItem[];
}

function fecha(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-MX") : "—";
}

/** Vista imprimible de una receta (Imprimir / Guardar como PDF desde el navegador). */
export function RecetaImprimible({ id, onClose }: { id: string; onClose: () => void }) {
  const [r, setR] = useState<RecetaDetalle | null>(null);

  useEffect(() => {
    api<RecetaDetalle>(`/t/recetas/${id}`)
      .then(setR)
      .catch(() => setR(null));
  }, [id]);

  const paciente = r?.mascota
    ? `${r.mascota.nombre} · ${r.mascota.especie}${r.mascota.raza ? ` (${r.mascota.raza})` : ""} · ${r.mascota.numeroExpediente}`
    : r?.paciente
      ? `${r.paciente.nombre} ${r.paciente.apellidoPaterno ?? ""} · ${r.paciente.numeroExpediente}`
      : "—";

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-2xl">
        <div className="receta-print rounded-xl bg-white p-6 shadow-xl">
          {!r ? (
            <p className="text-slate-400">Cargando…</p>
          ) : (
            <>
              <div className="mb-4 flex items-start justify-between border-slate-200 border-b pb-3">
                <div>
                  <h2 className="font-bold text-slate-800 text-xl">Receta médica</h2>
                  <p className="text-slate-500 text-sm">
                    Folio {r.folio} · {fecha(r.fechaEmision)}
                  </p>
                </div>
                <div className="text-right">
                  <QRCodeSVG value={r.qrValidacionToken} size={84} />
                  <p className="mt-1 text-[10px] text-slate-400">Validación en farmacia</p>
                </div>
              </div>

              <div className="mb-3 text-sm">
                <p>
                  <span className="text-slate-500">Paciente:</span>{" "}
                  <span className="font-medium text-slate-800">{paciente}</span>
                </p>
                <p>
                  <span className="text-slate-500">Médico:</span> {r.medico?.nombre ?? "—"}
                </p>
                {r.esGrupoControlado && (
                  <p className="text-amber-700">
                    Receta de grupo controlado · Recetario oficial:{" "}
                    {r.numeroRecetarioOficial ?? "—"}
                  </p>
                )}
              </div>

              <div className="mb-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-slate-200 border-b text-slate-500 text-xs">
                      <th className="py-1">Medicamento</th>
                      <th className="py-1">Dosis</th>
                      <th className="py-1">Vía</th>
                      <th className="py-1">Frecuencia</th>
                      <th className="py-1">Días</th>
                      <th className="py-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.items.map((it) => (
                      <tr key={it.id} className="border-slate-100 border-b align-top">
                        <td className="py-1 pr-2">
                          <span className="font-medium text-slate-800">{it.nombreSnapshot}</span>
                          {it.concentracionSnapshot ? (
                            <span className="text-slate-400"> · {it.concentracionSnapshot}</span>
                          ) : null}
                          {it.instruccionesAdministracion ? (
                            <p className="text-slate-500 text-xs">
                              {it.instruccionesAdministracion}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-1 pr-2">
                          {it.dosisCantidad} {it.dosisUnidad}
                        </td>
                        <td className="py-1 pr-2">{it.dosisVia}</td>
                        <td className="py-1 pr-2">c/{it.frecuenciaHoras}h</td>
                        <td className="py-1 pr-2">{it.duracionDias}</td>
                        <td className="py-1">{it.totalUnidadesDispensar ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {r.instruccionesGeneralesTutor && (
                <p className="mb-3 text-slate-600 text-sm">
                  <span className="text-slate-500">Indicaciones:</span>{" "}
                  {r.instruccionesGeneralesTutor}
                </p>
              )}

              <div className="mt-8 flex items-end justify-between">
                <p className="text-slate-400 text-xs">Vigente hasta {fecha(r.fechaExpiracion)}</p>
                <div className="text-center">
                  <div className="w-48 border-slate-400 border-t pt-1 text-slate-600 text-xs">
                    {r.medico?.nombre ?? "Firma del médico"}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="no-print mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!r}
            className="gx-btn-primary"
          >
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
