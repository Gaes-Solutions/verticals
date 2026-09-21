import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface DnsRecord {
  tipo: string;
  nombre: string;
  valor: string;
}
interface DominioB2b {
  host: string;
  verificado: boolean;
  txt?: DnsRecord;
}
interface Config {
  dominios: DominioB2b[];
  cname: string;
  automatico: boolean;
}
interface ConectarResult {
  host: string;
  verificado: boolean;
  automatico?: boolean;
  aviso?: string | null;
  dns: { records: DnsRecord[] };
}

export function DominioB2bPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [host, setHost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [result, setResult] = useState<ConectarResult | null>(null);
  const [aQuitar, setAQuitar] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoadError(null);
    try {
      setConfig(await api<Config>("/t/b2b-dominio"));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error al cargar la configuración del dominio");
    }
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

  async function verificar(h: string) {
    setError(null);
    try {
      const r = await api<ConectarResult>(`/t/b2b-dominio/${encodeURIComponent(h)}/verificar`, {
        method: "POST",
      });
      setResult(r);
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Aún no se pudo verificar el dominio");
    }
  }

  async function quitar(h: string) {
    setAQuitar(null);
    try {
      await api(`/t/b2b-dominio/${encodeURIComponent(h)}`, { method: "DELETE" });
      if (result?.host === h) setResult(null);
      void cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo quitar el dominio");
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-2xl font-bold text-slate-800">Portal mayorista con tu dominio</h1>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-light p-3 text-danger text-sm">
          <span>{loadError}</span>
          <button type="button" onClick={() => void cargar()} className="gx-btn-danger">
            Reintentar
          </button>
        </div>
      </div>
    );
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
                className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-slate-700">{d.host}</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        d.verificado ? "bg-ok-light text-ok" : "bg-warn-light text-warn"
                      }`}
                    >
                      {d.verificado ? "Activo" : "Pendiente"}
                    </span>
                    {!d.verificado && (
                      <button
                        type="button"
                        onClick={() => verificar(d.host)}
                        className="text-sm font-medium text-brand hover:text-brand-dark"
                      >
                        Verificar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAQuitar(d.host)}
                      className="gx-btn-danger"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
                {!d.verificado && d.txt && (
                  <p className="text-xs text-slate-500">
                    Agrega este TXT en tu DNS para probar que el dominio es tuyo:{" "}
                    <span className="font-mono break-all">{d.txt.nombre}</span> ={" "}
                    <span className="font-mono break-all">{d.txt.valor}</span>. Luego pulsa{" "}
                    <strong>Verificar</strong>.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-800">Conectar un dominio</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            data-tour="b2bdom-host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="pedidos.tu-negocio.com"
            autoCapitalize="none"
            className="gx-input flex-1 font-mono"
          />
          <button
            type="button"
            data-tour="b2bdom-conectar"
            onClick={conectar}
            disabled={guardando || host.trim().length < 4}
            className="gx-btn-primary disabled:opacity-50"
          >
            {guardando ? "Conectando…" : "Conectar"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
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
            <p className="mb-3 rounded-lg bg-warn-light px-3 py-2 text-sm text-warn">
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
      {aQuitar && (
        <div className="gx-modal-overlay">
          <div className="gx-modal-panel">
            <h2 className="mb-2 font-bold text-lg text-slate-800">Quitar dominio</h2>
            <p className="mb-4 text-slate-500 text-sm">
              ¿Quitar <span className="font-mono">{aQuitar}</span>? Tu portal dejará de responder en
              ese dominio.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAQuitar(null)} className="gx-btn-secondary">
                Volver
              </button>
              <button type="button" onClick={() => quitar(aQuitar)} className="gx-btn-danger">
                Sí, quitar dominio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DnsTable({ records }: { records: DnsRecord[] }) {
  return (
    <div className="gx-table-wrap">
      <table className="gx-table min-w-[420px]">
        <thead>
          <tr>
            <th className="gx-th">Tipo</th>
            <th className="gx-th">Nombre / Host</th>
            <th className="gx-th">Apunta a</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={`${r.tipo}-${r.nombre}-${r.valor}`}>
              <td className="gx-td font-mono">{r.tipo}</td>
              <td className="gx-td font-mono break-all">{r.nombre}</td>
              <td className="gx-td font-mono break-all">{r.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
