import { useCallback, useEffect, useState } from "react";
import { EstadoError } from "../components/Estados.js";
import { Modal, ModalClose } from "../components/Modal.js";
import { SignaturePad } from "../components/SignaturePad.js";
import { Skeleton } from "../components/Skeleton.js";
import { ApiError, api } from "../lib/api.js";
import { PERMISOS } from "../lib/permisos.js";
import type { CotizacionRow } from "../lib/types.js";

const ESTADO: Record<string, string> = {
  enviada: "Por aceptar",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  vencida: "Vencida",
  convertida: "Convertida a pedido",
};

const BADGE_ESTADO: Record<string, string> = {
  enviada: "gx-badge-info",
  aceptada: "gx-badge-ok",
  rechazada: "gx-badge-danger",
  vencida: "gx-badge-warn",
  convertida: "gx-badge-info",
};

interface CotizacionDetalle extends CotizacionRow {
  lineas: Array<{
    id: string;
    cantidad: string;
    precioUnitario: string;
    totalLinea: string;
    snapshotProducto: { nombreProducto?: string };
  }>;
}

export function CotizacionesPage({ puedeHacer }: { puedeHacer: (permiso: string) => boolean }) {
  const [cotizaciones, setCotizaciones] = useState<CotizacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<CotizacionDetalle | null>(null);
  const [firmando, setFirmando] = useState<{ id: string; folio: string } | null>(null);
  const [procesandoFirma, setProcesandoFirma] = useState(false);
  const [rechazando, setRechazando] = useState<{ id: string; folio: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [motivoError, setMotivoError] = useState<string | null>(null);
  const [procesandoRechazo, setProcesandoRechazo] = useState(false);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    api<CotizacionRow[]>("/b2b-portal/cotizaciones")
      .then(setCotizaciones)
      .catch(() => setError("No se pudieron cargar tus cotizaciones."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => cargar(), [cargar]);

  function verDetalle(id: string) {
    setError(null);
    api<CotizacionDetalle>(`/b2b-portal/cotizaciones/${id}`)
      .then(setDetalle)
      .catch(() => setError("No se pudo cargar el detalle."));
  }

  function abrirRechazo(id: string, folio: string) {
    setMotivo("");
    setMotivoError(null);
    setRechazando({ id, folio });
  }

  async function confirmarRechazo() {
    if (!rechazando) return;
    if (motivo.trim() === "") {
      setMotivoError("El motivo del rechazo es obligatorio.");
      return;
    }
    setMotivoError(null);
    setProcesandoRechazo(true);
    try {
      await api(`/b2b-portal/cotizaciones/${rechazando.id}/rechazar`, {
        body: { motivo: motivo.trim() },
      });
      setRechazando(null);
      setDetalle(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error");
    } finally {
      setProcesandoRechazo(false);
    }
  }

  async function aceptarConFirma(firmaDataUrl: string) {
    if (!firmando) return;
    setError(null);
    setProcesandoFirma(true);
    try {
      await api(`/b2b-portal/cotizaciones/${firmando.id}/aceptar`, { body: { firmaDataUrl } });
      setFirmando(null);
      setDetalle(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error");
    } finally {
      setProcesandoFirma(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Cotizaciones</h1>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {loading ? (
        <div className="gx-table-wrap">
          <div className="space-y-4 p-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ) : error && cotizaciones.length === 0 ? (
        <EstadoError mensaje={error} onRetry={cargar} />
      ) : (
        <div className="gx-table-wrap">
          <table className="gx-table">
            <thead>
              <tr>
                <th className="gx-th">Folio</th>
                <th className="gx-th">Vendedor</th>
                <th className="gx-th">Vence</th>
                <th className="gx-th">Estado</th>
                <th className="gx-th text-right">Total</th>
                <th className="gx-th" />
              </tr>
            </thead>
            <tbody>
              {cotizaciones.map((c) => (
                <tr key={c.id}>
                  <td className="gx-td font-medium">{c.folio}</td>
                  <td className="gx-td text-slate-500">{c.vendedor?.nombre ?? "—"}</td>
                  <td className="gx-td text-slate-500">
                    {new Date(c.fechaVencimiento).toLocaleDateString("es-MX")}
                  </td>
                  <td className="gx-td">
                    <span className={BADGE_ESTADO[c.estado] ?? "gx-badge-info"}>
                      {ESTADO[c.estado] ?? c.estado}
                    </span>
                  </td>
                  <td className="gx-td text-right font-semibold">${Number(c.total).toFixed(2)}</td>
                  <td className="gx-td text-right">
                    <button type="button" onClick={() => verDetalle(c.id)} className="gx-btn-ghost">
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
              {cotizaciones.length === 0 && (
                <tr>
                  <td colSpan={6} className="gx-td py-8 text-center text-slate-500">
                    No tienes cotizaciones.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <Modal onClose={() => setDetalle(null)}>
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-800">{detalle.folio}</h2>
              <span className={BADGE_ESTADO[detalle.estado] ?? "gx-badge-info"}>
                {ESTADO[detalle.estado] ?? detalle.estado}
              </span>
            </div>
            <ModalClose onClose={() => setDetalle(null)} />
          </div>
          <table className="w-full text-sm">
            <tbody>
              {detalle.lineas.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="py-1">{l.snapshotProducto?.nombreProducto ?? "Producto"}</td>
                  <td className="py-1 text-slate-500">×{Number(l.cantidad)}</td>
                  <td className="py-1 text-right">${Number(l.totalLinea).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-bold">
            <span>Total</span>
            <span>${Number(detalle.total).toFixed(2)}</span>
          </div>
          {detalle.estado === "enviada" &&
            (puedeHacer(PERMISOS.firmarCotizacion) || puedeHacer(PERMISOS.rechazarCotizacion)) && (
              <div className="mt-4 flex gap-2">
                {puedeHacer(PERMISOS.firmarCotizacion) && (
                  <button
                    type="button"
                    onClick={() => setFirmando({ id: detalle.id, folio: detalle.folio })}
                    className="gx-btn-primary flex-1"
                  >
                    Firmar y aceptar
                  </button>
                )}
                {puedeHacer(PERMISOS.rechazarCotizacion) && (
                  <button
                    type="button"
                    onClick={() => abrirRechazo(detalle.id, detalle.folio)}
                    className="gx-btn-danger"
                  >
                    Rechazar
                  </button>
                )}
              </div>
            )}
        </Modal>
      )}

      {rechazando && (
        <Modal onClose={() => (procesandoRechazo ? undefined : setRechazando(null))}>
          <div className="mb-4 flex items-start justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-800">Rechazar {rechazando.folio}</h2>
            <ModalClose onClose={() => setRechazando(null)} />
          </div>
          <label className="block">
            <span className="gx-label">Motivo del rechazo</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              required
              aria-invalid={motivoError !== null}
              placeholder="Cuéntale al vendedor por qué no procede"
              className="gx-input"
            />
          </label>
          {motivoError && <p className="mt-1 text-sm text-danger">{motivoError}</p>}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setRechazando(null)}
              disabled={procesandoRechazo}
              className="gx-btn-ghost flex-1"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarRechazo}
              disabled={procesandoRechazo}
              className="gx-btn-danger flex-1"
            >
              {procesandoRechazo ? "Rechazando…" : "Confirmar rechazo"}
            </button>
          </div>
        </Modal>
      )}

      {firmando && (
        <SignaturePad
          titulo={`Cotización ${firmando.folio}`}
          procesando={procesandoFirma}
          onConfirm={aceptarConFirma}
          onCancel={() => setFirmando(null)}
        />
      )}
    </div>
  );
}
