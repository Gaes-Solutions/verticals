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
      <div className="mb-4 flex flex-wrap gap-2">
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
    setError(null);
    try {
      const res = await api<{ items: CfdiRecibido[] }>("/t/cfdis-recibidos?pageSize=100");
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los CFDIs recibidos");
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
          <label data-tour="cont-subir" className="gx-btn-primary cursor-pointer">
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

      {error && !cargando && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-light p-3 text-danger text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => void cargar()} className="gx-btn-danger">
            Reintentar
          </button>
        </div>
      )}

      <div className="gx-table-wrap">
        <table className="gx-table min-w-[720px]">
          <thead>
            <tr>
              <th className="gx-th">Emisor</th>
              <th className="gx-th">Fecha</th>
              <th className="gx-th text-right">Total</th>
              <th className="gx-th">Categoría</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td className="gx-td text-slate-400" colSpan={5}>
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && !error && items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={5}>
                  Sin CFDIs. Sube el primer XML.
                </td>
              </tr>
            )}
            {!cargando &&
              items.map((c) => (
                <tr key={c.id}>
                  <td className="gx-td">
                    <p className="font-medium">{c.emisorRazonSocial}</p>
                    <p className="text-xs text-slate-400">{c.emisorRfc}</p>
                  </td>
                  <td className="gx-td text-slate-600">
                    {new Date(c.fechaEmision).toLocaleDateString("es-MX")}
                  </td>
                  <td className="gx-td text-right">${Number.parseFloat(c.total).toFixed(2)}</td>
                  <td className="gx-td">
                    {c.categorizacion?.categoria ? (
                      <span className="text-slate-700">
                        {c.categorizacion.categoria.codigoContable} ·{" "}
                        {c.categorizacion.categoria.nombre}
                      </span>
                    ) : (
                      <span className="text-warn">Sin categorizar</span>
                    )}
                  </td>
                  <td className="gx-td">
                    {puede("cfdis_recibidos.categorizar") && (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={ocupado === c.id}
                          onClick={() => categorizar(c.id)}
                          className="min-h-10 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                        >
                          {ocupado === c.id ? "…" : "Auto (IA)"}
                        </button>
                        <select
                          defaultValue=""
                          disabled={ocupado === c.id}
                          onChange={(e) => e.target.value && categorizar(c.id, e.target.value)}
                          className="min-h-10 rounded-lg border border-slate-300 px-2 py-2 text-xs"
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
            className="gx-input mt-1 block w-32"
          />
        </label>
        <button
          type="button"
          onClick={generar}
          disabled={cargando || periodo.length !== 6}
          className="gx-btn-primary disabled:opacity-50"
        >
          {cargando ? "Generando…" : "Generar"}
        </button>
        {reporte && reporte.lineas.length > 0 && (
          <button type="button" onClick={descargarTxt} className="gx-btn-secondary">
            Descargar .txt (SAT)
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

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
          <div className="gx-table-wrap">
            <table className="gx-table min-w-[560px]">
              <thead>
                <tr>
                  <th className="gx-th">RFC</th>
                  <th className="gx-th">Proveedor</th>
                  <th className="gx-th text-right">IVA 16%</th>
                  <th className="gx-th text-right">CFDIs</th>
                </tr>
              </thead>
              <tbody>
                {reporte.lineas.map((l) => (
                  <tr key={l.rfcTercero}>
                    <td className="gx-td font-mono text-xs">{l.rfcTercero}</td>
                    <td className="gx-td">{l.nombreTercero}</td>
                    <td className="gx-td text-right">${l.ivaPagado16}</td>
                    <td className="gx-td text-right text-slate-500">{l.cfdiCount}</td>
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
