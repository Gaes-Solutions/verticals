import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Session } from "../App.js";
import { ApiError, api } from "../lib/api.js";
import type { RecargaCatalogo, RecargaCompania, RecargaResultado } from "../lib/types.js";

/**
 * Venta de recargas de tiempo aire y pago de servicios (Bait) desde el POS.
 * Consume /t/recargas/catalogo y POST /t/recargas.
 */
export function RecargaModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const [companias, setCompanias] = useState<RecargaCompania[]>([]);
  const [compania, setCompania] = useState<RecargaCompania | null>(null);
  const [monto, setMonto] = useState<string>("");
  const [telefono, setTelefono] = useState("");
  const [referencia, setReferencia] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RecargaResultado | null>(null);

  useEffect(() => {
    api<RecargaCatalogo>("/t/recargas/catalogo")
      .then((r) => setCompanias(r.companias))
      .catch(() => setError("No se pudo cargar el catálogo de recargas"));
  }, []);

  const telefonoValido = /^\d{10}$/.test(telefono);
  const montoNum = Number.parseFloat(monto);
  const referenciaOk = !compania?.requiereReferencia || referencia.trim().length > 0;
  const puedeVender =
    compania !== null && telefonoValido && montoNum > 0 && referenciaOk && !procesando;

  async function vender() {
    if (!compania) return;
    setError(null);
    setProcesando(true);
    try {
      const res = await api<RecargaResultado>("/t/recargas", {
        body: {
          sucursalId: session.sucursal.id,
          companiaCodigo: compania.codigo,
          numeroTelefonico: telefono,
          montoSolicitado: monto,
          tipo: compania.tipo,
          ...(compania.requiereReferencia ? { referenciaCapturada: referencia.trim() } : {}),
        },
      });
      setResultado(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al procesar la recarga");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Recarga / servicio</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {resultado ? (
          <div className="text-center">
            {resultado.estado === "exitosa" ? (
              <>
                <CheckCircle2 className="mx-auto mb-2 text-green-500" size={48} />
                <p className="text-lg font-semibold text-slate-800">Recarga exitosa</p>
                <p className="mt-1 text-sm text-slate-500">Folio {resultado.folio}</p>
                {resultado.folioProveedor && (
                  <p className="text-sm text-slate-500">Ref. {resultado.folioProveedor}</p>
                )}
                <p className="mt-2 text-2xl font-bold text-slate-800">
                  ${Number.parseFloat(resultado.montoCobradoCliente).toFixed(2)}
                </p>
              </>
            ) : (
              <>
                <X className="mx-auto mb-2 text-red-500" size={48} />
                <p className="text-lg font-semibold text-red-600">Recarga fallida</p>
                <p className="mt-1 text-sm text-slate-500">Folio {resultado.folio}</p>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">Compañía</span>
              <div className="grid grid-cols-3 gap-2">
                {companias.map((c) => (
                  <button
                    key={c.codigo}
                    type="button"
                    onClick={() => {
                      setCompania(c);
                      setMonto("");
                    }}
                    className={`rounded-lg border px-2 py-2 text-sm ${
                      compania?.codigo === c.codigo
                        ? "border-brand bg-brand/10 font-semibold text-brand"
                        : "border-slate-300 text-slate-700"
                    }`}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
            </div>

            {compania && (
              <>
                <div>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Monto</span>
                  <div className="flex flex-wrap gap-2">
                    {compania.montosDisponibles.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMonto(String(m))}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          monto === String(m)
                            ? "border-brand bg-brand/10 font-semibold text-brand"
                            : "border-slate-300 text-slate-700"
                        }`}
                      >
                        ${m}
                      </button>
                    ))}
                  </div>
                  {compania.permiteMontoCustom && (
                    <input
                      type="number"
                      step="0.01"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      placeholder="Monto personalizado"
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
                    />
                  )}
                </div>

                <div>
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Teléfono (10 dígitos)
                  </span>
                  <input
                    inputMode="numeric"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="3312345678"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
                  />
                </div>

                {compania.requiereReferencia && (
                  <div>
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Referencia
                    </span>
                    <input
                      value={referencia}
                      onChange={(e) => setReferencia(e.target.value)}
                      placeholder="Cuenta / contrato"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
                    />
                  </div>
                )}
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={vender}
              disabled={!puedeVender}
              className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {procesando ? "Procesando…" : "Vender recarga"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
