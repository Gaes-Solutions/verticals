import { useCallback, useEffect, useState } from "react";
import { ApiError, api, fechaCorta, money } from "../lib/api.js";
import type { ClienteDetalle, MiCliente } from "../lib/types.js";

function DetalleCliente({
  id,
  onVolver,
  onNuevoPedido,
}: {
  id: string;
  onVolver: () => void;
  onNuevoPedido: (clienteB2bId: string) => void;
}) {
  const [data, setData] = useState<ClienteDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<ClienteDetalle>(`/t/vendedor/clientes/${id}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Sin conexión"));
  }, [id]);
  useEffect(() => cargar(), [cargar]);

  if (error) return <p className="rounded-xl bg-white p-6 text-slate-500">{error}</p>;
  if (!data) return <p className="text-slate-400">Cargando cliente…</p>;
  const c = data.cliente;
  const tel = c.telefonoPrincipal?.replace(/\D/g, "");

  return (
    <div className="space-y-4">
      <button type="button" onClick={onVolver} className="text-brand text-sm hover:underline">
        ← Mis clientes
      </button>

      <div className="gx-card p-4">
        <h2 className="font-bold text-lg text-slate-800">{c.nombreComercial ?? c.razonSocial}</h2>
        <p className="text-slate-500 text-sm">
          {c.razonSocial} · RFC {c.rfc}
        </p>
        {c.notas && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-slate-600 text-sm">📝 {c.notas}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNuevoPedido(c.id)}
            className="gx-btn-primary text-sm"
          >
            🛒 Nuevo pedido
          </button>
          {tel && (
            <>
              <a href={`tel:${tel}`} className="gx-btn-secondary text-sm">
                📞 Llamar
              </a>
              <a
                href={`https://wa.me/52${tel}`}
                target="_blank"
                rel="noreferrer"
                className="gx-btn-secondary text-sm"
              >
                💬 WhatsApp
              </a>
            </>
          )}
        </div>
      </div>

      {data.credito && (
        <div className="gx-card p-4">
          <p className="mb-2 font-semibold text-slate-800">Crédito</p>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <p className="font-bold text-slate-800">{money(data.credito.lineaAutorizada)}</p>
              <p className="text-slate-500 text-xs">Línea</p>
            </div>
            <div>
              <p className="font-bold text-slate-800">{money(data.credito.saldoCxcAbiertas)}</p>
              <p className="text-slate-500 text-xs">Debe</p>
            </div>
            <div>
              <p
                className={`font-bold ${Number(data.credito.disponible) > 0 ? "text-emerald-600" : "text-red-600"}`}
              >
                {money(data.credito.disponible)}
              </p>
              <p className="text-slate-500 text-xs">Disponible</p>
            </div>
          </div>
        </div>
      )}

      <div className="gx-card p-4">
        <p className="mb-2 font-semibold text-slate-800">Últimos pedidos</p>
        {data.pedidos.length === 0 ? (
          <p className="text-slate-400 text-sm">Aún no hay pedidos.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {data.pedidos.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span className="text-slate-600">
                  {p.folio} · {fechaCorta(p.createdAt)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs">{p.estado}</span>
                  <span className="font-medium text-slate-800">{money(p.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="gx-card p-4">
        <p className="mb-2 font-semibold text-slate-800">Últimas visitas</p>
        {data.visitas.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin visitas registradas.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {data.visitas.map((v) => (
              <li key={v.id} className="py-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">
                    {v.tipo === "llamada" ? "📞" : "📍"} {fechaCorta(v.fechaPlaneada)}
                  </span>
                  <span className="text-slate-400 text-xs">{v.estado}</span>
                </div>
                {(v.resultado ?? v.notas) && (
                  <p className="mt-0.5 text-slate-500 text-xs">{v.resultado ?? v.notas}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.cotizaciones.length > 0 && (
        <div className="gx-card p-4">
          <p className="mb-2 font-semibold text-slate-800">Cotizaciones</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {data.cotizaciones.map((q) => (
              <li key={q.id} className="flex items-center justify-between py-2">
                <span className="text-slate-600">{q.folio}</span>
                <span className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs">{q.estado}</span>
                  <span className="font-medium text-slate-800">{money(q.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ClientesPage({
  onNuevoPedido,
}: {
  onNuevoPedido: (clienteB2bId: string) => void;
}) {
  const [clientes, setClientes] = useState<MiCliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    api<{ items: MiCliente[] }>("/t/vendedor/clientes")
      .then((r) => setClientes(r.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Sin conexión"))
      .finally(() => setCargando(false));
  }, []);

  if (detalle) {
    return (
      <DetalleCliente
        id={detalle}
        onVolver={() => setDetalle(null)}
        onNuevoPedido={onNuevoPedido}
      />
    );
  }
  if (cargando) return <p className="text-slate-400">Cargando clientes…</p>;
  if (error) return <p className="rounded-xl bg-white p-6 text-slate-500">{error}</p>;

  const term = filtro.trim().toLowerCase();
  const visibles = term
    ? clientes.filter(
        (c) =>
          c.razonSocial.toLowerCase().includes(term) ||
          (c.nombreComercial ?? "").toLowerCase().includes(term),
      )
    : clientes;

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-slate-800">Mis clientes ({clientes.length})</h2>
      <input
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        className="gx-input w-full"
        placeholder="Buscar cliente…"
      />
      {visibles.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-slate-400">
          {clientes.length === 0
            ? "Aún no tienes clientes asignados. Pide a tu gerente que te asigne cartera."
            : "Sin resultados."}
        </p>
      ) : (
        visibles.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setDetalle(c.id)}
            className="gx-card block w-full p-4 text-left hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-800">{c.nombreComercial ?? c.razonSocial}</p>
                <p className="text-slate-500 text-xs">
                  Última visita: {fechaCorta(c.ultimaVisitaAt)} · Último pedido:{" "}
                  {fechaCorta(c.ultimoPedidoAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-brand">{money(c.montoMes)}</p>
                <p className="text-slate-400 text-xs">{c.pedidosMes} pedidos/mes</p>
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
