import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import type { EstadoCuenta } from "../lib/types.js";

const ESTADO_CXC: Record<string, string> = {
  activa: "Vigente",
  vencida: "Vencida",
  liquidada: "Liquidada",
  incobrable: "Incobrable",
  condonada: "Condonada",
};

export function EstadoCuentaPage() {
  const [data, setData] = useState<EstadoCuenta | null>(null);

  useEffect(() => {
    api<EstadoCuenta>("/b2b-portal/estado-cuenta")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Estado de cuenta</h1>

      {data?.credito ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Caja
            titulo="Línea autorizada"
            valor={`$${Number(data.credito.lineaAutorizada).toFixed(2)}`}
          />
          <Caja
            titulo="Saldo por pagar"
            valor={`$${Number(data.credito.saldoCxcAbiertas).toFixed(2)}`}
          />
          <Caja
            titulo="Disponible"
            valor={`$${Number(data.credito.disponible).toFixed(2)}`}
            destacado
          />
        </div>
      ) : (
        <p className="mb-6 rounded-xl bg-white p-5 text-sm text-slate-500 shadow-sm">
          Operas de contado (sin línea de crédito autorizada).
        </p>
      )}

      <h2 className="mb-3 font-bold text-slate-800">Facturas y cargos</h2>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Folio</th>
              <th className="px-4 py-2">Emisión</th>
              <th className="px-4 py-2">Vence</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {(data?.cuentas ?? []).map((c) => {
              const saldo = Number(c.montoOriginal) - Number(c.montoPagado);
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{c.folio}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(c.fechaEmision).toLocaleDateString("es-MX")}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(c.fechaVencimiento).toLocaleDateString("es-MX")}
                  </td>
                  <td className="px-4 py-2">{ESTADO_CXC[c.estado] ?? c.estado}</td>
                  <td className="px-4 py-2 text-right font-semibold">${saldo.toFixed(2)}</td>
                </tr>
              );
            })}
            {(data?.cuentas ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Sin movimientos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Caja({
  titulo,
  valor,
  destacado,
}: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl p-5 shadow-sm ${destacado ? "bg-brand text-white" : "bg-white"}`}>
      <p className={`text-sm ${destacado ? "text-blue-100" : "text-slate-500"}`}>{titulo}</p>
      <p className="mt-1 text-2xl font-bold">{valor}</p>
    </div>
  );
}
