import { FileText, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import type { Session } from "../App.js";
import { ApiError, api } from "../lib/api.js";
import type { AperturaActual, CorteResultado } from "../lib/types.js";

const BILLETES = ["1000", "500", "200", "100", "50", "20"] as const;
const MONEDAS = ["20", "10", "5", "2", "1", "0.5"] as const;

type Conteo = Record<string, number>;

export function CorteModal({
  session,
  onClose,
  onCierreZ,
}: {
  session: Session;
  onClose: () => void;
  onCierreZ: () => void;
}) {
  const [apertura, setApertura] = useState<AperturaActual | null>(null);
  const [cargando, setCargando] = useState(true);
  const [billetes, setBilletes] = useState<Conteo>({});
  const [monedas, setMonedas] = useState<Conteo>({});
  const [resultado, setResultado] = useState<CorteResultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    if (!session.caja) {
      setError("Esta sesión no tiene caja asignada; no hay corte que hacer.");
      setCargando(false);
      return;
    }
    (async () => {
      try {
        const a = await api<AperturaActual>(`/t/cajas/${session.caja?.id}/apertura-actual`);
        setApertura(a);
      } catch {
        setError("No hay apertura activa para esta caja.");
      } finally {
        setCargando(false);
      }
    })();
  }, [session.caja]);

  const efectivoContado =
    BILLETES.reduce((s, d) => s + (billetes[d] ?? 0) * Number(d), 0) +
    MONEDAS.reduce((s, d) => s + (monedas[d] ?? 0) * Number(d), 0);

  async function hacerCorte(tipo: "X" | "Z") {
    if (!apertura) return;
    setProcesando(true);
    setError(null);
    try {
      const res = await api<CorteResultado>("/t/cortes", {
        body: {
          aperturaId: apertura.id,
          tipo,
          denominaciones: { billetes, monedas },
        },
      });
      setResultado(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al hacer el corte");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-slate-800">Corte de caja</h2>

        {cargando && <p className="text-slate-400">Cargando…</p>}

        {error && !resultado && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {resultado ? (
          <div className="text-center">
            <div className="mb-2 flex justify-center text-slate-700">
              {resultado.tipo === "Z" ? <Lock size={36} /> : <FileText size={36} />}
            </div>
            <p className="text-lg font-bold text-slate-800">
              Corte {resultado.tipo} {resultado.tipo === "Z" ? "(cierre)" : "(lectura)"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Efectivo contado: <span className="font-semibold">${efectivoContado.toFixed(2)}</span>
            </p>
            <p className="text-sm text-slate-600">
              Diferencia vs esperado:{" "}
              <span
                className={`font-bold ${
                  Number(resultado.diferencia) === 0
                    ? "text-slate-700"
                    : Number(resultado.diferencia) > 0
                      ? "text-emerald-600"
                      : "text-red-600"
                }`}
              >
                ${Number(resultado.diferencia).toFixed(2)}
              </span>
            </p>
            <button
              type="button"
              onClick={() => {
                if (resultado.tipo === "Z") onCierreZ();
                else onClose();
              }}
              className="mt-6 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark"
            >
              {resultado.tipo === "Z" ? "Cerrar turno" : "Listo"}
            </button>
          </div>
        ) : (
          apertura && (
            <>
              <p className="mb-3 text-sm text-slate-500">
                Cuenta el efectivo en caja. El sistema calcula la diferencia contra lo esperado.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <DenomColumn
                  titulo="Billetes"
                  denoms={BILLETES}
                  conteo={billetes}
                  onChange={setBilletes}
                />
                <DenomColumn
                  titulo="Monedas"
                  denoms={MONEDAS}
                  conteo={monedas}
                  onChange={setMonedas}
                />
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                <span className="text-slate-600">Efectivo contado</span>
                <span className="text-xl font-bold text-slate-900">
                  ${efectivoContado.toFixed(2)}
                </span>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={procesando}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => hacerCorte("X")}
                  disabled={procesando}
                  className="flex-1 rounded-lg border border-brand py-2.5 font-semibold text-brand disabled:opacity-50"
                >
                  Corte X (lectura)
                </button>
                <button
                  type="button"
                  onClick={() => hacerCorte("Z")}
                  disabled={procesando}
                  className="flex-1 rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  Corte Z (cierre)
                </button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}

function DenomColumn({
  titulo,
  denoms,
  conteo,
  onChange,
}: {
  titulo: string;
  denoms: readonly string[];
  conteo: Conteo;
  onChange: (c: Conteo) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{titulo}</h3>
      {denoms.map((d) => (
        <div key={d} className="mb-1.5 flex items-center gap-2">
          <span className="w-12 text-right text-sm text-slate-500">${d}</span>
          <input
            type="number"
            min={0}
            value={conteo[d] ?? ""}
            onChange={(e) => onChange({ ...conteo, [d]: Number(e.target.value) || 0 })}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand focus:outline-none"
            placeholder="0"
          />
        </div>
      ))}
    </div>
  );
}
