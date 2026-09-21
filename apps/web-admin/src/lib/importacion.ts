import * as XLSX from "xlsx";

export type Fila = Record<string, string>;

export type TipoProblema =
  | "dato_faltante"
  | "dato_invalido"
  | "codigo_repetido"
  | "codigo_barras_repetido"
  | "codigo_barras_en_uso"
  | "codigo_nombre_invertidos"
  | "nombre_sospechoso"
  | "precio_bajo_costo"
  | "existencia_decimal"
  | "cambio_precio_grande";

export interface ProblemaImportacion {
  id: string;
  tipo: TipoProblema;
  severidad: "bloqueante" | "aviso";
  /** Índices en el arreglo que se mandó a revisar. */
  filas: number[];
  mensaje: string;
  detalle: Record<string, string>;
}

export interface DepartamentoImportacion {
  nombre: string;
  productos: number;
  existeEnCatalogo: boolean;
  soloNumero: boolean;
  sugerencia: {
    unirEn: string;
    motivo: "escritura" | "forma" | "parecido";
    marcada: boolean;
  } | null;
}

export interface ResultadoRevision {
  total: number;
  nuevos: number;
  actualizar: number;
  bloqueantes: number;
  avisos: number;
  problemas: ProblemaImportacion[];
  departamentos: DepartamentoImportacion[];
}

export interface ResumenImportacion {
  total: number;
  creados: number;
  actualizados: number;
  errores: number;
  filas: Array<{
    fila: number;
    sku: string;
    accion: "creado" | "actualizado" | "error";
    mensaje?: string;
  }>;
}

/**
 * El archivo mientras el usuario lo revisa. Las filas nunca se sacan del
 * arreglo: se marcan como quitadas. Así los índices de una revisión siguen
 * apuntando a la fila correcta aunque el usuario quite o edite otras.
 */
export interface BorradorImportacion {
  filas: Fila[];
  /** Número de fila en el Excel, para que el usuario la encuentre. */
  filaExcel: number[];
  /** Índice → por qué no se va a subir. */
  quitadas: Record<number, string>;
}

export interface RenglonReporte {
  filaExcel: number;
  codigo: string;
  nombre: string;
  resultado: "Nuevo" | "Actualizado" | "Subido con aviso" | "No se subió";
  motivo: string;
}

export function indicesActivos(borrador: BorradorImportacion): number[] {
  return borrador.filas.map((_, i) => i).filter((i) => borrador.quitadas[i] === undefined);
}

export function editarFila(
  borrador: BorradorImportacion,
  indice: number,
  cambios: Record<string, string | undefined>,
): BorradorImportacion {
  // Un valor vacío quita el campo: así se borra, por ejemplo, un código de barras.
  const fila: Fila = Object.fromEntries(
    Object.entries({ ...(borrador.filas[indice] ?? {}), ...cambios }).flatMap(([campo, valor]) => {
      const limpio = valor?.trim() ?? "";
      return limpio ? [[campo, limpio]] : [];
    }),
  );
  const filas = [...borrador.filas];
  filas[indice] = fila;
  return { ...borrador, filas };
}

export function quitarFila(
  borrador: BorradorImportacion,
  indice: number,
  motivo: string,
): BorradorImportacion {
  return { ...borrador, quitadas: { ...borrador.quitadas, [indice]: motivo } };
}

/** El mismo producto repetido: queda la primera fila con la suma de existencias. */
export function unirMismoProducto(
  borrador: BorradorImportacion,
  indices: number[],
): BorradorImportacion {
  const [primera, ...resto] = indices;
  if (primera === undefined) return borrador;
  const conExistencia = indices.filter((i) => borrador.filas[i]?.stockInicial !== undefined);
  let nuevo = borrador;
  if (conExistencia.length > 0) {
    const suma = conExistencia.reduce(
      (s, i) => s + (Number(borrador.filas[i]?.stockInicial) || 0),
      0,
    );
    nuevo = editarFila(nuevo, primera, { stockInicial: String(Number(suma.toFixed(3))) });
  }
  for (const i of resto) {
    nuevo = quitarFila(
      nuevo,
      i,
      `Es el mismo producto que la fila ${borrador.filaExcel[primera]}: se unieron y se sumó la existencia`,
    );
  }
  return nuevo;
}

export function voltearCodigoNombre(
  borrador: BorradorImportacion,
  indice: number,
  conCodigoBarras: boolean,
): BorradorImportacion {
  const fila = borrador.filas[indice];
  if (!fila) return borrador;
  const codigo = fila.nombre ?? "";
  const esCodigoBarras = conCodigoBarras && !fila.codigoBarras && /^\d{8,14}$/.test(codigo);
  return editarFila(borrador, indice, {
    skuPadre: codigo,
    nombre: fila.skuPadre,
    ...(esCodigoBarras ? { codigoBarras: codigo } : {}),
  });
}

/**
 * Clave con la que se recuerda que el usuario confirmó un aviso. Usa los
 * índices del borrador, no los de la revisión: sobrevive a volver a revisar.
 */
export function claveConfirmacion(
  problema: ProblemaImportacion,
  indicesRevisados: number[],
): string {
  return `${problema.tipo}:${problema.filas.map((k) => indicesRevisados[k]).join(",")}`;
}

/** Filas que se suben, con el departamento que eligió el usuario. */
export function filasParaImportar(
  borrador: BorradorImportacion,
  destinos: Record<string, string>,
): { filas: Fila[]; indices: number[] } {
  const indices = indicesActivos(borrador);
  const filas = indices.map((i) => {
    const { categoriaNombre, ...resto } = borrador.filas[i] ?? {};
    if (categoriaNombre === undefined) return resto;
    const destino = (destinos[categoriaNombre] ?? categoriaNombre).trim();
    return destino ? { ...resto, categoriaNombre: destino } : resto;
  });
  return { filas, indices };
}

/** Qué pasó con cada fila del Excel: lo que se subió y lo que no, con su motivo. */
/**
 * El archivo se sube en tandas y cada una numera sus filas desde 1; al unirlas se
 * recorre esa numeración para que el reporte siga apuntando a la fila real del Excel.
 */
export function unirResumenes(
  partes: Array<{ desde: number; resumen: ResumenImportacion }>,
): ResumenImportacion {
  return partes.reduce<ResumenImportacion>(
    (acc, { desde, resumen }) => ({
      total: acc.total + resumen.total,
      creados: acc.creados + resumen.creados,
      actualizados: acc.actualizados + resumen.actualizados,
      errores: acc.errores + resumen.errores,
      filas: [...acc.filas, ...resumen.filas.map((f) => ({ ...f, fila: f.fila + desde }))],
    }),
    { total: 0, creados: 0, actualizados: 0, errores: 0, filas: [] },
  );
}

export function armarReporte(
  borrador: BorradorImportacion,
  indicesEnviados: number[],
  resumen: ResumenImportacion,
): RenglonReporte[] {
  const porIndice = new Map<number, { acciones: Set<string>; mensajes: string[] }>();
  for (const r of resumen.filas) {
    const indice = indicesEnviados[r.fila - 1];
    if (indice === undefined) continue;
    const registro = porIndice.get(indice) ?? { acciones: new Set<string>(), mensajes: [] };
    registro.acciones.add(r.accion);
    if (r.mensaje) registro.mensajes.push(r.mensaje);
    porIndice.set(indice, registro);
  }
  return borrador.filas
    .map((fila, i): RenglonReporte => {
      const base = {
        filaExcel: borrador.filaExcel[i] ?? i + 2,
        codigo: fila.skuPadre ?? "",
        nombre: fila.nombre ?? "",
      };
      const motivoQuitada = borrador.quitadas[i];
      if (motivoQuitada !== undefined)
        return { ...base, resultado: "No se subió", motivo: motivoQuitada };
      const registro = porIndice.get(i);
      if (!registro) {
        return { ...base, resultado: "No se subió", motivo: "El servidor no confirmó esta fila" };
      }
      const subido = registro.acciones.has("creado")
        ? "Nuevo"
        : registro.acciones.has("actualizado")
          ? "Actualizado"
          : null;
      const motivo = registro.mensajes.join("; ");
      if (subido && motivo) return { ...base, resultado: "Subido con aviso", motivo };
      if (subido) return { ...base, resultado: subido, motivo: "" };
      return { ...base, resultado: "No se subió", motivo: motivo || "No se pudo guardar" };
    })
    .sort((a, b) => a.filaExcel - b.filaExcel);
}

export function descargarReporte(renglones: RenglonReporte[], nombreArchivo: string): void {
  const hoja = XLSX.utils.json_to_sheet(
    renglones.map((r) => ({
      "Fila del Excel": r.filaExcel,
      Código: r.codigo,
      Nombre: r.nombre,
      Resultado: r.resultado,
      Motivo: r.motivo,
    })),
  );
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Reporte");
  const base = nombreArchivo.replace(/\.[^.]+$/, "") || "importacion";
  XLSX.writeFile(libro, `reporte-${base}.xlsx`);
}
