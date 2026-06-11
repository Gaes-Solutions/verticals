import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export function AuditPage() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");

  const cargar = useCallback(() => {
    const params = new URLSearchParams();
    if (actor) params.set("actor", actor);
    if (action) params.set("action", action);
    const qs = params.toString() ? `?${params}` : "";
    api<{ items: AuditEntry[] }>(`/admin/audit${qs}`)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [actor, action]);

  useEffect(() => cargar(), [cargar]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-bold text-2xl text-slate-800">Auditoría</h1>
      <p className="mb-6 text-slate-500 text-sm">
        Registro inmutable de acciones de la plataforma.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Filtrar por actor (correo)"
          className="gx-input w-auto flex-1"
        />
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Filtrar por acción (ej. team.admin_created)"
          className="gx-input w-auto flex-1"
        />
      </div>

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Fecha</th>
              <th className="gx-th">Actor</th>
              <th className="gx-th">Acción</th>
              <th className="gx-th">Recurso</th>
              <th className="gx-th">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id}>
                <td className="gx-td whitespace-nowrap text-slate-500">
                  {new Date(e.createdAt).toLocaleString("es-MX")}
                </td>
                <td className="gx-td">{e.actor}</td>
                <td className="gx-td font-mono text-xs">{e.action}</td>
                <td className="gx-td text-slate-500">
                  {e.resource ?? "—"}
                  {e.resourceId ? ` · ${e.resourceId.slice(0, 8)}` : ""}
                </td>
                <td className="gx-td text-slate-500 text-xs">
                  {e.metadata ? JSON.stringify(e.metadata) : ""}
                  {e.ipAddress ? ` · ${e.ipAddress}` : ""}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={5}>
                  Sin registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
