import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ApiError, api } from "../lib/api.js";

interface Columna {
  header: string; // nombre de la columna en la plantilla
  campo: string; // campo que espera el backend
  req: boolean;
  ejemplo: string;
}

interface TipoImport {
  key: "productos" | "precios" | "inventario";
  label: string;
  descripcion: string;
  endpoint: string;
  columnas: Columna[];
}

const TIPOS: TipoImport[] = [
  {
    key: "productos",
    label: "Productos",
    descripcion:
      "Alta y actualización de productos (upsert por SKU). Crea la categoría si no existe.",
    endpoint: "/t/productos/bulk",
    columnas: [
      { header: "SKU", campo: "skuPadre", req: true, ejemplo: "ABA-001" },
      { header: "Nombre", campo: "nombre", req: true, ejemplo: "Galletas Marías 170g" },
      { header: "Categoria", campo: "categoriaNombre", req: false, ejemplo: "Abarrotes" },
      { header: "Precio", campo: "precioBase", req: true, ejemplo: "15.50" },
      { header: "IVA", campo: "tasaIva", req: false, ejemplo: "16" },
      { header: "CodigoBarras", campo: "codigoBarras", req: false, ejemplo: "7501000123457" },
    ],
  },
  {
    key: "precios",
    label: "Precios",
    descripcion: "Actualización masiva de precio por SKU.",
    endpoint: "/t/productos/bulk-precios",
    columnas: [
      { header: "SKU", campo: "sku", req: true, ejemplo: "ABA-001" },
      { header: "Precio", campo: "precioBase", req: true, ejemplo: "18.00" },
    ],
  },
  {
    key: "inventario",
    label: "Inventario (conteo físico)",
    descripcion: "Pone el stock real contado por SKU y sucursal (calcula el ajuste).",
    endpoint: "/t/inventario/bulk-conteo",
    columnas: [
      { header: "SKU", campo: "sku", req: true, ejemplo: "ABA-001" },
      { header: "Sucursal", campo: "sucursalCodigo", req: true, ejemplo: "SUC-PRINCIPAL" },
      { header: "Cantidad", campo: "cantidadFisica", req: true, ejemplo: "120" },
    ],
  },
];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

interface ResumenResp {
  total: number;
  creados?: number;
  actualizados?: number;
  ajustados?: number;
  sinCambio?: number;
  errores: number;
  filas: Array<{ fila: number; sku: string; accion: string; mensaje?: string }>;
}

export function ImportadorPage() {
  const [tipo, setTipo] = useState<TipoImport>(TIPOS[0]!);
  const [filas, setFilas] = useState<Record<string, string>[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resumen, setResumen] = useState<ResumenResp | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFilas([]);
    setNombreArchivo("");
    setErrorArchivo(null);
    setResumen(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function cambiarTipo(t: TipoImport) {
    setTipo(t);
    reset();
  }

  function descargarPlantilla() {
    const headers = tipo.columnas.map((c) => c.header);
    const ejemplo = tipo.columnas.map((c) => c.ejemplo);
    const ws = XLSX.utils.aoa_to_sheet([headers, ejemplo]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, `plantilla-${tipo.key}.xlsx`);
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorArchivo(null);
    setResumen(null);
    setNombreArchivo(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      if (!sheet) throw new Error("El archivo no tiene hojas");
      const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      // mapea encabezados de la plantilla → campos del backend
      const mapHeader = new Map(tipo.columnas.map((c) => [norm(c.header), c]));
      const parsed: Record<string, string>[] = [];
      for (const cruda of crudas) {
        const fila: Record<string, string> = {};
        for (const [k, v] of Object.entries(cruda)) {
          const col = mapHeader.get(norm(k));
          if (col) {
            const val = String(v).trim();
            if (val !== "") fila[col.campo] = val;
          }
        }
        // ignora filas totalmente vacías
        if (Object.keys(fila).length > 0) parsed.push(fila);
      }
      if (parsed.length === 0) {
        throw new Error("No se encontraron filas con datos. ¿Usaste la plantilla?");
      }
      setFilas(parsed);
    } catch (err) {
      setFilas([]);
      setErrorArchivo(err instanceof Error ? err.message : "No se pudo leer el archivo");
    }
  }

  // validación cliente: campos requeridos presentes por fila
  const requeridos = tipo.columnas.filter((c) => c.req).map((c) => c.campo);
  const filasInvalidas = filas.filter((f) => requeridos.some((r) => !f[r]));

  async function importar() {
    setEnviando(true);
    setResumen(null);
    try {
      const r = await api<ResumenResp>(tipo.endpoint, { body: { filas } });
      setResumen(r);
    } catch (err) {
      setErrorArchivo(err instanceof ApiError ? err.message : "Error al importar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Carga masiva</h1>
      <p className="mb-6 text-sm text-slate-500">
        Sube tus datos desde Excel o CSV. Descarga la plantilla, llénala y arrástrala aquí.
      </p>

      {/* Selector de tipo */}
      <div className="mb-6 flex flex-wrap gap-2">
        {TIPOS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => cambiarTipo(t)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              tipo.key === t.key
                ? "border-brand bg-brand/5 text-brand"
                : "border-slate-200 text-slate-600 hover:border-brand"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="gx-card mb-4">
        <p className="mb-3 text-sm text-slate-600">{tipo.descripcion}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={descargarPlantilla} className="gx-btn-secondary">
            ⬇ Descargar plantilla
          </button>
          <label className="gx-btn-primary cursor-pointer">
            📄 Elegir archivo
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onArchivo}
              className="hidden"
            />
          </label>
          {nombreArchivo && (
            <span className="self-center text-sm text-slate-500">{nombreArchivo}</span>
          )}
        </div>

        <div className="text-xs text-slate-500">
          Columnas:{" "}
          {tipo.columnas.map((c) => (
            <span key={c.campo} className="mr-2 inline-block">
              <span className="font-medium">{c.header}</span>
              {c.req && <span className="text-danger">*</span>}
            </span>
          ))}
        </div>
      </div>

      {errorArchivo && (
        <p className="mb-4 rounded-lg bg-danger-light p-3 text-sm text-danger">{errorArchivo}</p>
      )}

      {/* Previsualización */}
      {filas.length > 0 && !resumen && (
        <div className="gx-card mb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">
              {filas.length} fila(s) detectadas
              {filasInvalidas.length > 0 && (
                <span className="ml-2 text-danger">
                  · {filasInvalidas.length} con datos faltantes
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={importar}
              disabled={enviando || filasInvalidas.length > 0}
              className="gx-btn-primary"
            >
              {enviando ? "Importando…" : `Importar ${filas.length} fila(s)`}
            </button>
          </div>
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th className="gx-th">#</th>
                  {tipo.columnas.map((c) => (
                    <th key={c.campo} className="gx-th">
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, 50).map((f, idx) => {
                  return (
                    <tr key={`${idx}-${f[tipo.columnas[0]!.campo] ?? idx}`}>
                      <td className="gx-td text-slate-400">{idx + 1}</td>
                      {tipo.columnas.map((c) => (
                        <td
                          key={c.campo}
                          className={`gx-td ${c.req && !f[c.campo] ? "bg-danger-light text-danger" : ""}`}
                        >
                          {f[c.campo] ?? (c.req ? "— falta —" : "")}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filas.length > 50 && (
            <p className="mt-2 text-xs text-slate-400">
              Mostrando 50 de {filas.length}. Se importarán todas.
            </p>
          )}
        </div>
      )}

      {/* Resultado */}
      {resumen && (
        <div className="gx-card">
          <h2 className="mb-3 font-bold text-slate-800">Resultado de la importación</h2>
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <span className="gx-badge-info">Total: {resumen.total}</span>
            {resumen.creados !== undefined && (
              <span className="gx-badge-ok">Creados: {resumen.creados}</span>
            )}
            {resumen.actualizados !== undefined && (
              <span className="gx-badge-ok">Actualizados: {resumen.actualizados}</span>
            )}
            {resumen.ajustados !== undefined && (
              <span className="gx-badge-ok">Ajustados: {resumen.ajustados}</span>
            )}
            {resumen.sinCambio !== undefined && resumen.sinCambio > 0 && (
              <span className="gx-badge-info">Sin cambio: {resumen.sinCambio}</span>
            )}
            <span className={resumen.errores > 0 ? "gx-badge-danger" : "gx-badge-ok"}>
              Errores: {resumen.errores}
            </span>
          </div>
          {resumen.errores > 0 && (
            <div className="gx-table-wrap mb-4">
              <table className="gx-table">
                <thead>
                  <tr>
                    <th className="gx-th">Fila</th>
                    <th className="gx-th">SKU</th>
                    <th className="gx-th">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.filas
                    .filter((f) => f.accion === "error")
                    .map((f) => (
                      <tr key={`${f.fila}-${f.sku}`}>
                        <td className="gx-td">{f.fila}</td>
                        <td className="gx-td font-medium">{f.sku}</td>
                        <td className="gx-td text-danger">{f.mensaje}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" onClick={reset} className="gx-btn-secondary">
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}
