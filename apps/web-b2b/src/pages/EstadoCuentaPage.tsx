import { useCallback, useEffect, useState } from "react";
import { EstadoError } from "../components/Estados.js";
import { Skeleton } from "../components/Skeleton.js";
import { api } from "../lib/api.js";
import type { EstadoCuenta } from "../lib/types.js";

const ESTADO_CXC: Record<string, string> = {
  activa: "Vigente",
  vencida: "Vencida",
  liquidada: "Liquidada",
  incobrable: "Incobrable",
  condonada: "Condonada",
};

const BADGE_CXC: Record<string, string> = {
  activa: "gx-badge-ok",
  vencida: "gx-badge-danger",
  liquidada: "gx-badge-info",
  incobrable: "gx-badge-danger",
  condonada: "gx-badge-warn",
};

export function EstadoCuentaPage() {
  const [data, setData] = useState<EstadoCuenta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    api<EstadoCuenta>("/b2b-portal/estado-cuenta")
      .then(setData)
      .catch(() => setError("No se pudo cargar tu estado de cuenta."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => cargar(), [cargar]);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Estado de cuenta</h1>

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : error ? (
        <EstadoError mensaje={error} onRetry={cargar} />
      ) : data ? (
        <>
          {data.credito ? (
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <Caja titulo="Línea autorizada" valor={`$${Number(data.credito.lineaAutorizada).toFixed(2)}`} />
              <Caja titulo="Saldo por pagar" valor={`$${Number(data.credito.saldoCxcAbiertas).toFixed(2)}`} />
              <Caja titulo="Disponible" valor={`$${Number(data.credito.disponible).toFixed(2)}`} destacado />
            </div>
          ) : (
            <p className="gx-card mb-6 text-sm text-slate-500">
              Operas de contado (sin línea de crédito autorizada).
            </p>
          )}

          <h2 className="mb-3 font-bold text-slate-800">Facturas y cargos</h2>
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th className="gx-th">Folio</th>
                  <th className="gx-th">Emisión</th>
                  <th className="gx-th">Vence</th>
                  <th className="gx-th">Estado</th>
                  <th className="gx-th text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.cuentas.map((c) => {
                  const saldo = Number(c.montoOriginal) - Number(c.montoPagado);
                  return (
                    <tr key={c.id}>
                      <td className="gx-td font-medium">{c.folio}</td>
                      <td className="gx-td text-slate-500">
                        {new Date(c.fechaEmision).toLocaleDateString("es-MX")}
                      </td>
                      <td className="gx-td text-slate-500">
                        {new Date(c.fechaVencimiento).toLocaleDateString("es-MX")}
                      </td>
                      <td className="gx-td">
                        <span className={BADGE_CXC[c.estado] ?? "gx-badge-info"}>
                          {ESTADO_CXC[c.estado] ?? c.estado}
                        </span>
                      </td>
                      <td className="gx-td text-right font-semibold">${saldo.toFixed(2)}</td>
                    </tr>
                  );
                })}
                {data.cuentas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="gx-td py-8 text-center text-slate-500">
                      Sin movimientos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Caja({
  titulo,
  valor,
  destacado,
}: { titulo: string; valor: string; destacado?: boolean }) {
  if (destacado) {
    return (
      <div className="rounded-xl bg-brand p-5 text-white shadow-card">
        <p className="text-sm text-info-light">{titulo}</p>
        <p className="mt-1 text-2xl font-bold">{valor}</p>
      </div>
    );
  }
  return (
    <div className="gx-card">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{valor}</p>
    </div>
  );
}
