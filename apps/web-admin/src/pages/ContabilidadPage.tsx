import { useCallback, useEffect, useState } from "react";
import { ApiError, api, loadToken, puede } from "../lib/api.js";

interface CategoriaContable {
  id: string;
  codigoContable: string;
  nombre: string;
  tipo: string;
}

interface CfdiRecibido {
  id: string;
  folio: string | null;
  emisorRfc: string;
  emisorRazonSocial: string;
  fechaEmision: string;
  total: string;
  estado: string;
  categorizacion?: {
    categoria?: { codigoContable: string; nombre: string } | null;
    fuente?: string | null;
  } | null;
}

interface DiotLinea {
  rfcTercero: string;
  nombreTercero: string;
  ivaPagado16: string;
  ivaRetenido: string;
  cfdiCount: number;
}

interface DiotReporte {
  periodoYyyymm: string;
  totalProveedores: number;
  totalIvaPagado: string;
  lineas: DiotLinea[];
}

type Tab = "cfdis" | "diot";

export function ContabilidadPage() {
  const [tab, setTab] = useState<Tab>("cfdis");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Contabilidad</h1>
      </div>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("cfdis")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === "cfdis" ? "bg-brand text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          CFDIs recibidos
        </button>
        <button
          type="button"
          onClick={() => setTab("diot")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === "diot" ? "bg-brand text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          DIOT
        </button>
      </div>
      {tab === "cfdis" ? <CfdisTab /> : <DiotTab />}
    </div>
  );
}

function CfdisTab() {
  const [items, setItems] = useState<CfdiRecibido[]>([]);
  const [categorias, setCategorias] = useState<CategoriaContable[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await api<{ items: CfdiRecibido[] }>("/t/cfdis-recibidos?pageSize=100");
      setItems(res.items);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    if (puede("cfdis_recibidos.categorizar")) {
      api<CategoriaContable[]>("/t/cfdis-recibidos/categorias/contables")
        .then(setCategorias)
        .catch(() => setCategorias([]));
    }
  }, [cargar]);

  async function subir(file: File) {
    setError(null);
    setOcupado("upload");
    try {
      const xml = await file.text();
      await api("/t/cfdis-recibidos/upload", { body: { xml, origen: "upload_manual" } });
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo subir el XML");
    } finally {
      setOcupado(null);
    }
  }

  async function categorizar(id: string, categoriaContableId?: string) {
    setError(null);
    setOcupado(id);
    try {
      if (categoriaContableId) {
        await api(`/t/cfdis-recibidos/${id}/categorizar`, { body: { categoriaContableId } });
      } else {
        await api(`/t/cfdis-recibidos/${id}/auto-categorizar`, { method: "POST" });
      }
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo categorizar");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {puede("cfdis_recibidos.upload") && (
          <label className="cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            {ocupado === "upload" ? "Subiendo…" : "+ Subir XML"}
            <input
              type="file"
              accept=".xml,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subir(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <p className="text-sm text-slate-500">CFDIs de proveedores para deducción y DIOT.</p>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Emisor</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2">Categoría</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Sin CFDIs. Sube el primer XML.
                </td>
              </tr>
            )}
            {items.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <p className="font-medium text-slate-800">{c.emisorRazonSocial}</p>
                  <p className="text-xs text-slate-400">{c.emisorRfc}</p>
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {new Date(c.fechaEmision).toLocaleDateString("es-MX")}
                </td>
                <td className="px-4 py-2 text-right text-slate-700">
                  ${Number.parseFloat(c.total).toFixed(2)}
                </td>
                <td className="px-4 py-2">
                  {c.categorizacion?.categoria ? (
                    <span className="text-slate-700">
                      {c.categorizacion.categoria.codigoContable} ·{" "}
                      {c.categorizacion.categoria.nombre}
                    </span>
                  ) : (
                    <span className="text-amber-600">Sin categorizar</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {puede("cfdis_recibidos.categorizar") && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={ocupado === c.id}
                        onClick={() => categorizar(c.id)}
                        className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                      >
                        {ocupado === c.id ? "…" : "Auto (IA)"}
                      </button>
                      <select
                        defaultValue=""
                        disabled={ocupado === c.id}
                        onChange={(e) => e.target.value && categorizar(c.id, e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="">Categoría…</option>
                        {categorias.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.codigoContable} · {cat.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function periodoActual(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function DiotTab() {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [reporte, setReporte] = useState<DiotReporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    setError(null);
    setCargando(true);
    try {
      setReporte(await api<DiotReporte>(`/t/diot/${periodo}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar la DIOT");
    } finally {
      setCargando(false);
    }
  }

  async function descargarTxt() {
    setError(null);
    try {
      const res = await fetch(`/api/t/diot/${periodo}/export.txt`, {
        headers: { Authorization: `Bearer ${loadToken() ?? ""}` },
      });
      if (!res.ok) throw new Error("descarga");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DIOT_${periodo}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo descargar el archivo DIOT");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-slate-700">
          Periodo (AAAAMM)
          <input
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={generar}
          disabled={cargando || periodo.length !== 6}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {cargando ? "Generando…" : "Generar"}
        </button>
        {reporte && reporte.lineas.length > 0 && (
          <button
            type="button"
            onClick={descargarTxt}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Descargar .txt (SAT)
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {reporte && (
        <>
          <div className="mb-4 flex gap-6 text-sm">
            <span className="text-slate-500">
              Proveedores:{" "}
              <span className="font-semibold text-slate-800">{reporte.totalProveedores}</span>
            </span>
            <span className="text-slate-500">
              IVA pagado:{" "}
              <span className="font-semibold text-slate-800">${reporte.totalIvaPagado}</span>
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">RFC</th>
                  <th className="px-4 py-2">Proveedor</th>
                  <th className="px-4 py-2 text-right">IVA 16%</th>
                  <th className="px-4 py-2 text-right">CFDIs</th>
                </tr>
              </thead>
              <tbody>
                {reporte.lineas.map((l) => (
                  <tr key={l.rfcTercero} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono text-xs text-slate-700">{l.rfcTercero}</td>
                    <td className="px-4 py-2 text-slate-700">{l.nombreTercero}</td>
                    <td className="px-4 py-2 text-right text-slate-700">${l.ivaPagado16}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{l.cfdiCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
