import { FileText, Lock } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Session } from "../App.js";
import { puede } from "../lib/api.js";
import {
  type CutPending,
  cargarAperturaCorte,
  clearCortePendiente,
  consultarCierreZ,
  conteoValido,
  corteScope,
  enviarCorte,
  getCortePendiente,
  setCortePendiente,
} from "../lib/corte-recovery.js";
import type { AperturaActual, CorteResultado } from "../lib/types.js";

const BILLETES = ["1000", "500", "200", "100", "50", "20"] as const;
const MONEDAS = ["20", "10", "5", "2", "1", "0.5"] as const;

type Conteo = Record<string, number>;

interface CorteProps {
  session: Session;
  onClose: () => void;
  onCierreZ: () => void;
}
function useCorte({ session, onClose, onCierreZ }: CorteProps) {
  const [apertura, setApertura] = useState<AperturaActual | null>(null);
  const [cargando, setCargando] = useState(true);
  const [billetes, setBilletes] = useState<Conteo>({});
  const [monedas, setMonedas] = useState<Conteo>({});
  const [resultado, setResultado] = useState<CorteResultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const scope = corteScope(session, session.sucursal.id, session.caja?.id ?? "");
  const [pendiente, setPendiente] = useState<CutPending | undefined>(() =>
    getCortePendiente(scope),
  );
  const [contadoConfirmado, setContadoConfirmado] = useState<string | null>(null);
  const guard = useRef(false);
  const active = useRef(true);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const canRead = puede("corte.consultar");
  const canClose = puede("caja.cerrar");
  const load = useCallback(async () => {
    const version = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setCargando(true);
    setError(null);
    setApertura(null);
    try {
      if (!session.caja) throw new Error("Esta sesión no tiene caja asignada.");
      const opening = await cargarAperturaCorte(
        session.caja.id,
        session.sucursal.id,
        controller.signal,
      );
      if (version !== generation.current) return;
      setApertura(opening);
      if (!opening) setError("No hay apertura activa para esta caja.");
    } catch {
      if (version === generation.current)
        setError(
          "No se pudo consultar la apertura. Revisa la conexión y tus permisos, y vuelve a intentar.",
        );
    } finally {
      if (version === generation.current) setCargando(false);
    }
  }, [session.caja, session.sucursal.id]);
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      generation.current++;
      request.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    if (!dialog) return;
    dialog.showModal();
    headingRef.current?.focus();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const efectivoContado =
    BILLETES.reduce((s, d) => s + (billetes[d] ?? 0) * Number(d), 0) +
    MONEDAS.reduce((s, d) => s + (monedas[d] ?? 0) * Number(d), 0);

  const validCounts = conteoValido(billetes) && conteoValido(monedas);
  const inputsBlocked = procesando || cargando || !!pendiente || !!resultado;
  const blocked = inputsBlocked || !validCounts;
  async function hacerCorte(tipo: "X" | "Z") {
    if (!apertura || guard.current || blocked || !canRead || (tipo === "Z" && !canClose)) return;
    guard.current = true;
    setProcesando(true);
    setError(null);
    const intent = { aperturaId: apertura.id, tipo };
    setCortePendiente(scope, intent);
    setPendiente(intent);
    try {
      const res = await enviarCorte({ ...intent, denominaciones: { billetes, monedas } });
      clearCortePendiente(scope);
      if (!active.current) return;
      setPendiente(undefined);
      setResultado(res);
      setContadoConfirmado(efectivoContado.toFixed(2));
    } catch {
      if (active.current)
        setError(
          "No se pudo confirmar el corte. No lo vuelvas a enviar. Consulta el cierre en el servidor o revisa los cortes con el encargado.",
        );
    } finally {
      guard.current = false;
      if (active.current) setProcesando(false);
    }
  }
  async function recuperar() {
    if (!pendiente || guard.current || !canRead || pendiente.tipo !== "Z") return;
    guard.current = true;
    setProcesando(true);
    setError(null);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await consultarCierreZ(pendiente.aperturaId, controller.signal);
      if (!active.current) return;
      if (!result) {
        setError(
          "Todavía no se encuentra un cierre confirmado. Esto no demuestra que la solicitud haya fallado. Consulta de nuevo; no repitas el cierre.",
        );
        return;
      }
      clearCortePendiente(scope);
      setPendiente(undefined);
      setResultado(result);
      setContadoConfirmado(result.efectivoContado);
    } catch {
      if (active.current)
        setError(
          "No se pudo verificar el cierre. Conservamos el bloqueo; consulta de nuevo o revisa el historial con el encargado.",
        );
    } finally {
      guard.current = false;
      if (active.current) setProcesando(false);
    }
  }
  function close() {
    if (!guard.current) {
      if (resultado?.tipo === "Z") onCierreZ();
      else onClose();
    }
  }

  return {
    dialogRef,
    headingRef,
    headingId,
    procesando,
    cargando,
    close,
    error,
    resultado,
    pendiente,
    validCounts,
    load,
    canRead,
    recuperar,
    contadoConfirmado,
    efectivoContado,
    apertura,
    billetes,
    monedas,
    setBilletes,
    setMonedas,
    inputsBlocked,
    blocked,
    canClose,
    hacerCorte,
  };
}
export function CorteModal(props: CorteProps) {
  const {
    dialogRef,
    headingRef,
    headingId,
    procesando,
    cargando,
    close,
    error,
    resultado,
    pendiente,
    validCounts,
    load,
    canRead,
    recuperar,
    contadoConfirmado,
    efectivoContado,
    apertura,
    billetes,
    monedas,
    setBilletes,
    setMonedas,
    inputsBlocked,
    blocked,
    canClose,
    hacerCorte,
  } = useCorte(props);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      aria-busy={procesando || cargando}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-6 shadow-xl backdrop:bg-black/40"
    >
      <h2
        ref={headingRef}
        id={headingId}
        tabIndex={-1}
        className="mb-4 text-lg font-bold text-slate-800 outline-none"
      >
        Corte de caja
      </h2>

      {cargando && <p className="text-slate-400">Cargando…</p>}

      {error && !resultado && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!cargando && !resultado && !pendiente && error ? (
        <button
          type="button"
          className="mb-3 min-h-10 rounded border px-3"
          onClick={() => void load()}
        >
          Reintentar consulta de apertura
        </button>
      ) : null}
      <CortePendiente
        pendiente={pendiente}
        resultado={resultado}
        disabled={procesando || cargando || !canRead}
        recuperar={recuperar}
      />
      {!validCounts ? (
        <p role="alert" className="text-red-700">
          El conteo debe contener cantidades enteras, sin valores negativos.
        </p>
      ) : null}
      {resultado ? (
        <ResultadoCorte
          resultado={resultado}
          contado={Number(contadoConfirmado ?? efectivoContado)}
          onClose={close}
        />
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
                disabled={inputsBlocked}
                conteo={billetes}
                onChange={setBilletes}
              />
              <DenomColumn
                titulo="Monedas"
                denoms={MONEDAS}
                disabled={inputsBlocked}
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

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={close}
                disabled={procesando}
                className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => hacerCorte("X")}
                disabled={blocked || !canRead}
                className="flex-1 rounded-lg border border-brand py-2.5 font-semibold text-brand disabled:opacity-50"
              >
                Corte X (lectura)
              </button>
              <button
                type="button"
                onClick={() => hacerCorte("Z")}
                disabled={blocked || !canRead || !canClose}
                className="flex-1 rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                Corte Z (cierre)
              </button>
            </div>
          </>
        )
      )}
      {!resultado && !apertura ? (
        <button
          type="button"
          disabled={procesando}
          className="mt-4 min-h-10 rounded border px-4"
          onClick={close}
        >
          Volver sin reenviar
        </button>
      ) : null}
    </dialog>
  );
}

function CortePendiente({
  pendiente,
  resultado,
  disabled,
  recuperar,
}: {
  pendiente: CutPending | undefined;
  resultado: CorteResultado | null;
  disabled: boolean;
  recuperar: () => Promise<void>;
}) {
  return (
    <>
      {pendiente && !resultado ? (
        <div className="mb-4 space-y-2">
          <p role="alert" className="text-sm text-amber-800">
            Hay un corte {pendiente.tipo} sin confirmar. No repitas el envío ni recargues para
            intentarlo otra vez.
          </p>
          {pendiente.tipo === "Z" ? (
            <button
              type="button"
              disabled={disabled}
              className="min-h-10 rounded border border-brand px-3 text-brand disabled:opacity-50"
              onClick={() => void recuperar()}
            >
              Consultar cierre en el servidor
            </button>
          ) : (
            <p className="text-sm">Revisa la lectura X en el historial con el encargado.</p>
          )}
        </div>
      ) : null}
    </>
  );
}

function ResultadoCorte({
  resultado,
  contado,
  onClose,
}: { resultado: CorteResultado; contado: number; onClose: () => void }) {
  return (
    <div className="text-center">
      <div className="mb-2 flex justify-center text-slate-700">
        {resultado.tipo === "Z" ? <Lock size={36} /> : <FileText size={36} />}
      </div>
      <p className="text-lg font-bold text-slate-800">
        Corte {resultado.tipo} {resultado.tipo === "Z" ? "(cierre)" : "(lectura)"}
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Efectivo contado: <span className="font-semibold">${contado.toFixed(2)}</span>
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
        onClick={onClose}
        className="mt-6 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark"
      >
        {resultado.tipo === "Z" ? "Cerrar turno" : "Listo"}
      </button>
    </div>
  );
}

function DenomColumn({
  titulo,
  denoms,
  conteo,
  onChange,
  disabled,
}: {
  titulo: string;
  denoms: readonly string[];
  conteo: Conteo;
  disabled: boolean;
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
            aria-label={`${titulo}: cantidad de ${d} pesos`}
            disabled={disabled}
            step={1}
            min={0}
            value={conteo[d] ?? ""}
            onChange={(e) => onChange({ ...conteo, [d]: Number(e.target.value) || 0 })}
            className="min-h-10 w-full min-w-0 rounded border border-slate-300 px-2 py-2 text-sm focus:border-brand focus:outline-none"
            placeholder="0"
          />
        </div>
      ))}
    </div>
  );
}
