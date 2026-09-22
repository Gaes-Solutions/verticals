import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";
import type { Cliente, ClienteList } from "../lib/types.js";

/**
 * Selección de cliente para la venta: busca existentes o alta rápida.
 * El cliente es opcional (venta a público en general por default).
 */
export function ClienteModal({
  onSelect,
  onClose,
}: {
  onSelect: (c: Cliente | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [modoAlta, setModoAlta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [rfc, setRfc] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api<ClienteList>(`/t/clientes?q=${encodeURIComponent(query)}&pageSize=8`);
        setResultados(res.items);
      } catch {
        setResultados([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function crearCliente() {
    if (nombre.trim().length < 1) return;
    setGuardando(true);
    setError(null);
    try {
      const c = await api<Cliente>("/t/clientes", {
        body: {
          nombre,
          ...(rfc ? { rfc: rfc.toUpperCase() } : {}),
          ...(telefono ? { telefonoPrincipal: telefono } : {}),
        },
      });
      onSelect(c);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear cliente");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Cliente</h2>
          <button
            type="button"
            onClick={onClose}
            className="gx-btn-ghost h-10 w-10 p-0 text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {modoAlta ? (
          <div className="space-y-3">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre"
              className="gx-input min-h-10"
            />
            <input
              value={rfc}
              onChange={(e) => setRfc(e.target.value)}
              placeholder="RFC (para factura, opcional)"
              className="gx-input min-h-10 uppercase"
            />
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Teléfono (opcional)"
              className="gx-input min-h-10"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModoAlta(false)}
                className="gx-btn-ghost min-h-10 border border-slate-300"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={crearCliente}
                disabled={guardando || !nombre.trim()}
                className="gx-btn-primary min-h-10 flex-1"
              >
                {guardando ? "Guardando…" : "Crear y usar"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, RFC o teléfono…"
              className="gx-input mb-3 min-h-10"
            />
            <div className="mb-3 max-h-56 overflow-y-auto">
              {resultados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c)}
                  className="mb-1.5 flex min-h-10 w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-brand"
                >
                  <span className="font-medium text-slate-800">
                    {c.nombre} {c.apellidos ?? ""}
                  </span>
                  {c.rfc && <span className="text-xs text-slate-400">{c.rfc}</span>}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="gx-btn-ghost min-h-10 flex-1 border border-slate-300"
              >
                Público en general
              </button>
              {puede("clientes.crear") && (
                <button
                  type="button"
                  onClick={() => setModoAlta(true)}
                  className="gx-btn-primary min-h-10 flex-1"
                >
                  + Nuevo cliente
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
