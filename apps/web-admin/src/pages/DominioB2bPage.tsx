import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface DominioB2b {
  host: string;
  verificado: boolean;
}
interface Config {
  dominios: DominioB2b[];
  cname: string;
  automatico: boolean;
}
interface DnsRecord {
  tipo: string;
  nombre: string;
  valor: string;
}
interface ConectarResult {
  host: string;
  automatico: boolean;
  aviso: string | null;
  dns: { records: DnsRecord[] };
}

export function DominioB2bPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [host, setHost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [result, setResult] = useState<ConectarResult | null>(null);

  const cargar = useCallback(async () => {
    setConfig(await api<Config>("/t/b2b-dominio"));
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function conectar() {
    setError(null);
    setGuardando(true);
    try {
      const r = await api<ConectarResult>("/t/b2b-dominio", {
        body: { host: host.trim().toLowerCase() },
      });
      setResult(r);
      setHost("");
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar el dominio");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(h: string) {
    await api(`/t/b2b-dominio/${encodeURIComponent(h)}`, { method: "DELETE" }).catch(
      () => undefined,
    );
    if (result?.host === h) setResult(null);
    void cargar();
  }

  if (!config) {
    return <p className="text-center text-slate-400">Cargando…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Portal mayorista con tu dominio</h1>
      <p className="mb-6 text-sm text-slate-500">
        Conecta un dominio propio (ej. <span className="font-mono">pedidos.tu-negocio.com</span>)
        para que tus clientes entren a tu portal de mayoreo con tu marca, sin teclear ningún código.
      </p>

      <div className="mb-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-800">Tus dominios conectados</h2>
        {config.dominios.length === 0 ? (
          <p className="text-sm text-slate-400">
            Aún no conectas ningún dominio. Agrega el primero abajo.
          </p>
        ) : (
          <ul className="space-y-2">
            {config.dominios.map((d) => (
              <li
                key={d.host}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <span className="font-mono text-sm text-slate-700">{d.host}</span>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      d.verificado
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {d.verificado ? "Activo" : "Pendiente"}
                  </span>
                  <button
                    type="button"
                    onClick={() => quitar(d.host)}
                    className="text-sm text-slate-400 hover:text-red-500"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-800">Conectar un dominio</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="pedidos.tu-negocio.com"
            autoCapitalize="none"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={conectar}
            disabled={guardando || host.trim().length < 4}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Conectando…" : "Conectar"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {result ? (
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-5">
          <h2 className="mb-1 font-semibold text-slate-800">
            Último paso: agrega este registro en tu DNS
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            En tu proveedor de dominio (GoDaddy, Hostinger, Cloudflare…) crea el registro de abajo
            para <span className="font-mono">{result.host}</span>.{" "}
            {result.automatico
              ? "El certificado de seguridad (HTTPS) se activa solo en unos minutos."
              : "Los cambios pueden tardar unos minutos en propagarse."}
          </p>
          {result.aviso && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {result.aviso}
            </p>
          )}
          <DnsTable records={result.dns.records} />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="mb-2 font-semibold text-slate-800">Cómo funciona</h2>
          <p className="text-sm text-slate-500">
            Escribe el dominio que quieres usar y pulsa <strong>Conectar</strong>. Te mostraremos el
            registro DNS exacto que debes crear en tu proveedor de dominio.{" "}
            {config.automatico
              ? "Nosotros damos de alta el dominio y activamos el HTTPS automáticamente."
              : "Después de apuntarlo, tu portal quedará disponible en tu dominio."}
          </p>
        </div>
      )}
    </div>
  );
}

function DnsTable({ records }: { records: DnsRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="bg-slate-100 text-left text-slate-500">
          <tr>
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2">Nombre / Host</th>
            <th className="px-3 py-2">Apunta a</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={`${r.tipo}-${r.nombre}-${r.valor}`} className="border-t border-slate-100">
              <td className="px-3 py-2 font-mono">{r.tipo}</td>
              <td className="px-3 py-2 font-mono break-all">{r.nombre}</td>
              <td className="px-3 py-2 font-mono break-all">{r.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
