import { Download } from "lucide-react";
import { type RenglonReporte, descargarReporte } from "../../lib/importacion.js";

/**
 * Cierre de la importación: qué se subió y qué no, fila por fila y con el
 * motivo. El usuario no debería tener que adivinar si su archivo entró completo.
 */
export function ResultadoImportacion({
  renglones,
  nombreArchivo,
  onOtro,
}: {
  renglones: RenglonReporte[];
  nombreArchivo: string;
  onOtro: () => void;
}) {
  const cuenta = (resultado: RenglonReporte["resultado"]) =>
    renglones.filter((r) => r.resultado === resultado).length;
  const nuevos = cuenta("Nuevo");
  const actualizados = cuenta("Actualizado");
  const conAviso = cuenta("Subido con aviso");
  const noSubidos = cuenta("No se subió");
  const subidos = nuevos + actualizados + conAviso;
  const porRevisar = renglones.filter(
    (r) => r.resultado === "No se subió" || r.resultado === "Subido con aviso",
  );

  return (
    <div className="gx-card">
      <h2 className="font-bold text-lg text-slate-800">
        {noSubidos === 0
          ? `Listo: se subieron los ${subidos.toLocaleString("es-MX")} productos`
          : `Se subieron ${subidos.toLocaleString("es-MX")} de ${renglones.length.toLocaleString("es-MX")} productos`}
      </h2>
      <div className="mt-3 mb-4 flex flex-wrap gap-2 text-sm">
        <span className="gx-badge-ok">Nuevos: {nuevos}</span>
        <span className="gx-badge-ok">Actualizados: {actualizados}</span>
        {conAviso > 0 && <span className="gx-badge-warn">Subidos con aviso: {conAviso}</span>}
        <span className={noSubidos > 0 ? "gx-badge-danger" : "gx-badge-ok"}>
          No se subieron: {noSubidos}
        </span>
      </div>

      {porRevisar.length > 0 && (
        <>
          <h3 className="mb-2 font-semibold text-slate-800">
            {noSubidos > 0 ? "Lo que no se subió" : "Se subió, pero revisa esto"}
          </h3>
          <div className="gx-table-wrap mb-4">
            <table className="gx-table">
              <thead>
                <tr>
                  <th className="gx-th">Fila del Excel</th>
                  <th className="gx-th">Código</th>
                  <th className="gx-th">Nombre</th>
                  <th className="gx-th">Resultado</th>
                  <th className="gx-th">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {porRevisar.map((r) => (
                  <tr key={`${r.filaExcel}-${r.codigo}`}>
                    <td className="gx-td tabular-nums text-slate-500">{r.filaExcel}</td>
                    <td className="gx-td font-medium">{r.codigo || "—"}</td>
                    <td className="gx-td">{r.nombre || "—"}</td>
                    <td className="gx-td">
                      <span
                        className={
                          r.resultado === "No se subió" ? "gx-badge-danger" : "gx-badge-warn"
                        }
                      >
                        {r.resultado}
                      </span>
                    </td>
                    <td className="gx-td text-slate-600">{r.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="gx-btn-secondary inline-flex items-center gap-1.5"
          onClick={() => descargarReporte(renglones, nombreArchivo)}
        >
          <Download size={16} /> Descargar reporte
        </button>
        <button type="button" className="gx-btn-primary" onClick={onOtro}>
          Importar otro archivo
        </button>
      </div>
    </div>
  );
}
