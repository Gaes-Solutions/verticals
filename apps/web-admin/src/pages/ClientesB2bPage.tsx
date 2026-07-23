import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

const COND_LABEL: Record<string, string> = {
  contado: "Contado",
  credito: "Crédito",
  mixto: "Mixto",
};

const REGIMENES: { value: string; label: string }[] = [
  { value: "601", label: "601 · General de Ley Personas Morales" },
  { value: "612", label: "612 · Personas Físicas con Actividad Empresarial" },
  { value: "626", label: "626 · RESICO" },
  { value: "621", label: "621 · Incorporación Fiscal" },
  { value: "603", label: "603 · Personas Morales sin fines de lucro" },
  { value: "606", label: "606 · Arrendamiento" },
];

interface ClienteB2b {
  id: string;
  razonSocial: string;
  rfc: string;
  condicionesPago: string;
  diasCreditoDefault: number;
  listaPrecioPrincipalCodigo?: string | null;
  _count?: { ventas: number };
}
interface Paged {
  items: ClienteB2b[];
  total: number;
}
interface ListaPrecio {
  codigo: string;
  nombre: string;
}

export function ClientesB2bPage() {
  const [items, setItems] = useState<ClienteB2b[]>([]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(false);
  const [listas, setListas] = useState<ListaPrecio[]>([]);

  const cargar = useCallback(async () => {
    const res = await api<Paged>(
      `/t/clientes-b2b?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    );
    setItems(res.items);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  useEffect(() => {
    api<ListaPrecio[]>("/t/precios/listas")
      .then(setListas)
      .catch(() => setListas([]));
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Clientes de mayoreo</h1>
        <button
          type="button"
          data-tour="cli-nuevo"
          onClick={() => setModal(true)}
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
        >
          + Nuevo cliente
        </button>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por razón social o RFC…"
        className="mb-4 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
      />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">RFC</th>
              <th className="px-4 py-2">Pago</th>
              <th className="px-4 py-2">Lista de precios</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Sin clientes de mayoreo. Da de alta el primero.
                </td>
              </tr>
            )}
            {items.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{c.razonSocial}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600">{c.rfc}</td>
                <td className="px-4 py-2 text-slate-700">
                  {COND_LABEL[c.condicionesPago] ?? c.condicionesPago}
                  {c.condicionesPago !== "contado" && c.diasCreditoDefault > 0 && (
                    <span className="text-slate-400"> · {c.diasCreditoDefault} días</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600">{c.listaPrecioPrincipalCodigo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <NuevoClienteModal
          listas={listas}
          onClose={() => setModal(false)}
          onCreado={() => {
            setModal(false);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function NuevoClienteModal({
  listas,
  onClose,
  onCreado,
}: {
  listas: ListaPrecio[];
  onClose: () => void;
  onCreado: () => void;
}) {
  const [razonSocial, setRazonSocial] = useState("");
  const [rfc, setRfc] = useState("");
  const [regimenFiscalSat, setRegimen] = useState("601");
  const [emailPrincipal, setEmail] = useState("");
  const [telefonoPrincipal, setTel] = useState("");
  const [condicionesPago, setCond] = useState("contado");
  const [diasCreditoDefault, setDias] = useState("0");
  const [listaPrecioPrincipalCodigo, setLista] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    setError(null);
    setGuardando(true);
    try {
      await api("/t/clientes-b2b", {
        body: {
          razonSocial,
          rfc: rfc.toUpperCase(),
          regimenFiscalSat,
          condicionesPago,
          diasCreditoDefault: Number.parseInt(diasCreditoDefault, 10) || 0,
          ...(emailPrincipal ? { emailPrincipal } : {}),
          ...(telefonoPrincipal ? { telefonoPrincipal } : {}),
          ...(listaPrecioPrincipalCodigo ? { listaPrecioPrincipalCodigo } : {}),
        },
      });
      onCreado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el cliente");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-slate-800">Nuevo cliente de mayoreo</h2>
        <div className="space-y-3">
          <Campo label="Razón social">
            <input
              data-tour="cli-f-razon"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="RFC">
              <input
                data-tour="cli-f-rfc"
                value={rfc}
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </Campo>
            <Campo label="Régimen fiscal (SAT)">
              <select
                value={regimenFiscalSat}
                onChange={(e) => setRegimen(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-brand focus:outline-none"
              >
                {REGIMENES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Correo">
              <input
                type="email"
                value={emailPrincipal}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </Campo>
            <Campo label="Teléfono">
              <input
                value={telefonoPrincipal}
                onChange={(e) => setTel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Condición de pago">
              <select
                value={condicionesPago}
                onChange={(e) => setCond(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              >
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
                <option value="mixto">Mixto</option>
              </select>
            </Campo>
            <Campo label="Días de crédito">
              <input
                type="number"
                value={diasCreditoDefault}
                onChange={(e) => setDias(e.target.value)}
                disabled={condicionesPago === "contado"}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none disabled:bg-slate-100"
              />
            </Campo>
          </div>
          <Campo label="Lista de precios">
            <select
              value={listaPrecioPrincipalCodigo}
              onChange={(e) => setLista(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            >
              <option value="">Precio normal (sin lista)</option>
              {listas.map((l) => (
                <option key={l.codigo} value={l.codigo}>
                  {l.nombre} ({l.codigo})
                </option>
              ))}
            </select>
          </Campo>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-tour="cli-f-crear"
            onClick={crear}
            disabled={guardando || !razonSocial || rfc.length < 12}
            className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Creando…" : "Crear cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </div>
  );
}
