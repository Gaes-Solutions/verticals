import { useMemo, useState } from "react";
import {
  type BorradorImportacion,
  type DepartamentoImportacion,
  type ProblemaImportacion,
  type ResultadoRevision,
  type TipoProblema,
  claveConfirmacion,
  editarFila,
  indicesActivos,
  quitarFila,
  unirMismoProducto,
  voltearCodigoNombre,
} from "../../lib/importacion.js";

const ETIQUETA_CAMPO: Record<string, string> = {
  skuPadre: "Código",
  nombre: "Nombre",
  precioBase: "Precio",
  costo: "Costo",
  stockInicial: "Existencia",
  tasaIva: "IVA",
  precioMayoreo: "Precio mayoreo",
  stockMinimo: "Mínimo",
  stockMaximo: "Máximo",
  categoriaNombre: "Departamento",
  codigoBarras: "Código de barras",
  claveSat: "Clave SAT",
  claveUnidadSat: "Unidad SAT",
};

const CAMPOS_NUMERICOS = new Set([
  "precioBase",
  "costo",
  "stockInicial",
  "tasaIva",
  "precioMayoreo",
  "stockMinimo",
  "stockMaximo",
]);

const TITULO_TIPO: Record<TipoProblema, string> = {
  dato_faltante: "Faltan datos obligatorios",
  dato_invalido: "Valores que no se pueden usar",
  codigo_repetido: "Mismo código en varias filas",
  codigo_barras_repetido: "Un código de barras en productos distintos",
  codigo_barras_en_uso: "Código de barras que ya usa otro producto",
  codigo_nombre_invertidos: "Código y nombre al revés",
  nombre_sospechoso: "Nombres que no parecen producto",
  precio_bajo_costo: "Se vende por debajo del costo",
  existencia_decimal: "Existencias con decimales",
  cambio_precio_grande: "Cambios grandes de precio",
};

const ORDEN_TIPOS = Object.keys(TITULO_TIPO) as TipoProblema[];

const MOTIVO_DEPARTAMENTO: Record<
  NonNullable<DepartamentoImportacion["sugerencia"]>["motivo"],
  string
> = {
  escritura: "Misma palabra, otra escritura",
  forma: "Singular/plural",
  parecido: "¿Error de dedo?",
};

const QUITADA = "La quitaste en la revisión";
const LIMITE_POR_GRUPO = 10;

interface Props {
  borrador: BorradorImportacion;
  revision: ResultadoRevision;
  /** Índice en la revisión → índice en el borrador. */
  indicesRevisados: number[];
  desactualizada: boolean;
  revisando: boolean;
  enviando: boolean;
  confirmados: Set<string>;
  destinos: Record<string, string>;
  conCodigoBarras: boolean;
  onBorrador: (borrador: BorradorImportacion) => void;
  onConfirmar: (claves: string[]) => void;
  onDestino: (departamento: string, destino: string) => void;
  onRevisar: () => void;
  onImportar: () => void;
  onCancelar: () => void;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n.toLocaleString("es-MX")} ${n === 1 ? uno : varios}`;
}

export function RevisionImportacion(props: Props) {
  const { borrador, revision, indicesRevisados, confirmados, destinos } = props;
  const [todosLosDepartamentos, setTodosLosDepartamentos] = useState(false);

  const bloqueantes = revision.problemas.filter((p) => p.severidad === "bloqueante");
  const avisos = revision.problemas.filter((p) => p.severidad === "aviso");
  const avisosPendientes = avisos.filter(
    (p) => !confirmados.has(claveConfirmacion(p, indicesRevisados)),
  );
  const departamentosNumero = revision.departamentos.filter(
    (d) =>
      d.soloNumero &&
      /^\d+$/.test((destinos[d.nombre] ?? d.nombre).trim()) &&
      !confirmados.has(`departamento:${d.nombre}`),
  );
  const porSubir = indicesActivos(borrador).length;
  const quitadas = Object.keys(borrador.quitadas).length;

  const pendiente = props.desactualizada
    ? "Hiciste cambios: vuelve a revisar el archivo."
    : bloqueantes.length > 0
      ? `Resuelve ${plural(bloqueantes.length, "problema", "problemas")} para poder importar.`
      : avisosPendientes.length > 0
        ? `Corrige o confirma ${plural(avisosPendientes.length, "aviso", "avisos")}.`
        : departamentosNumero.length > 0
          ? `Asigna ${plural(departamentosNumero.length, "departamento que es solo un número", "departamentos que son solo un número")}.`
          : porSubir === 0
            ? "No quedan productos por subir."
            : null;
  const listo = pendiente === null && !props.revisando;

  const departamentosVisibles = todosLosDepartamentos
    ? revision.departamentos
    : revision.departamentos.filter((d) => d.sugerencia || d.soloNumero);
  const opcionesDepartamento = useMemo(
    () =>
      [
        ...new Set([
          ...revision.departamentos.map((d) => d.sugerencia?.unirEn ?? d.nombre),
          "General",
        ]),
      ].sort((a, b) => a.localeCompare(b, "es")),
    [revision.departamentos],
  );

  const grupos = (lista: ProblemaImportacion[]) =>
    ORDEN_TIPOS.map((tipo) => [tipo, lista.filter((p) => p.tipo === tipo)] as const)
      .filter(([, items]) => items.length > 0)
      .map(([tipo, items]) => (
        <GrupoProblemas key={tipo} tipo={tipo} problemas={items} props={props} />
      ));

  return (
    <div className="mb-4">
      <div className="gx-card mb-3">
        <h2 className="font-bold text-lg text-slate-800">Revisa antes de importar</h2>
        <p className="mt-1 text-slate-500 text-sm">
          Nada se guarda hasta que presiones Importar. Corrige aquí mismo o confirma lo que está
          bien.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="gx-badge-info">
            {plural(porSubir, "producto por subir", "productos por subir")}
          </span>
          <span className="gx-badge-info">{plural(revision.nuevos, "nuevo", "nuevos")}</span>
          <span className="gx-badge-info">
            {plural(revision.actualizar, "se actualiza", "se actualizan")}
          </span>
          <span className={bloqueantes.length > 0 ? "gx-badge-danger" : "gx-badge-ok"}>
            Por resolver: {bloqueantes.length}
          </span>
          <span className={avisosPendientes.length > 0 ? "gx-badge-warn" : "gx-badge-ok"}>
            Avisos por confirmar: {avisosPendientes.length}
          </span>
          {quitadas > 0 && <span className="gx-badge-warn">Quitadas: {quitadas}</span>}
        </div>
        {props.desactualizada && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warn-light p-3 text-sm text-warn">
            <span>Hiciste cambios. La revisión se actualiza en un momento.</span>
            <button
              type="button"
              className="gx-btn-secondary"
              onClick={props.onRevisar}
              disabled={props.revisando}
            >
              {props.revisando ? "Revisando…" : "Revisar de nuevo"}
            </button>
          </div>
        )}
      </div>

      {bloqueantes.length > 0 && (
        <>
          <h3 className="mt-4 mb-2 font-semibold text-danger">Por resolver</h3>
          {grupos(bloqueantes)}
        </>
      )}

      {avisos.length > 0 && (
        <>
          <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-800">Revisa y confirma</h3>
            {avisosPendientes.length > 0 && (
              <button
                type="button"
                className="gx-btn-secondary"
                onClick={() =>
                  props.onConfirmar(
                    avisosPendientes.map((p) => claveConfirmacion(p, indicesRevisados)),
                  )
                }
              >
                Confirmar {plural(avisosPendientes.length, "aviso", "avisos")}
              </button>
            )}
          </div>
          {grupos(avisos)}
        </>
      )}

      {revision.departamentos.length > 0 && (
        <section className="gx-card mt-4 mb-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-800">Departamentos</h3>
            <button
              type="button"
              className="gx-btn-ghost"
              onClick={() => setTodosLosDepartamentos((v) => !v)}
            >
              {todosLosDepartamentos
                ? "Ver solo los que necesitan atención"
                : `Ver los ${revision.departamentos.length}`}
            </button>
          </div>
          <p className="mb-3 text-slate-500 text-sm">
            Elige cómo queda cada uno. Dejarlo vacío lo importa sin departamento.
          </p>
          {departamentosVisibles.length === 0 ? (
            <p className="text-slate-500 text-sm">Ningún departamento necesita atención.</p>
          ) : (
            <div className="gx-table-wrap">
              <datalist id="departamentos-destino">
                {opcionesDepartamento.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
              <table className="gx-table">
                <thead>
                  <tr>
                    <th className="gx-th">En el archivo</th>
                    <th className="gx-th">Productos</th>
                    <th className="gx-th">Queda como</th>
                    <th className="gx-th">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {departamentosVisibles.map((d) => (
                    <FilaDepartamento
                      key={d.nombre}
                      departamento={d}
                      destino={destinos[d.nombre] ?? d.nombre}
                      numeroConfirmado={confirmados.has(`departamento:${d.nombre}`)}
                      onDestino={props.onDestino}
                      onConfirmar={props.onConfirmar}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="gx-card sticky bottom-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm ${listo ? "text-ok" : "text-slate-600"}`}>
          {listo
            ? `Todo listo: se subirán ${plural(porSubir, "producto", "productos")}.`
            : pendiente}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="gx-btn-ghost" onClick={props.onCancelar}>
            Cancelar
          </button>
          <button
            type="button"
            className="gx-btn-primary"
            disabled={!listo || props.enviando}
            onClick={props.onImportar}
          >
            {props.enviando
              ? "Importando…"
              : `Importar ${plural(porSubir, "producto", "productos")}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function GrupoProblemas({
  tipo,
  problemas,
  props,
}: {
  tipo: TipoProblema;
  problemas: ProblemaImportacion[];
  props: Props;
}) {
  const [todos, setTodos] = useState(false);
  const visibles = todos ? problemas : problemas.slice(0, LIMITE_POR_GRUPO);
  const bloqueante = problemas[0]?.severidad === "bloqueante";
  return (
    <section className="gx-card mb-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-800">{TITULO_TIPO[tipo]}</h4>
        <span className={bloqueante ? "gx-badge-danger" : "gx-badge-warn"}>{problemas.length}</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {visibles.map((p) => (
          <ProblemaItem key={p.id} problema={p} props={props} />
        ))}
      </ul>
      {problemas.length > LIMITE_POR_GRUPO && !todos && (
        <button type="button" className="gx-btn-ghost mt-2" onClick={() => setTodos(true)}>
          Mostrar los {problemas.length}
        </button>
      )}
    </section>
  );
}

function ProblemaItem({ problema, props }: { problema: ProblemaImportacion; props: Props }) {
  const { borrador, indicesRevisados, onBorrador, conCodigoBarras } = props;
  const indices = problema.filas
    .map((k) => indicesRevisados[k])
    .filter((i): i is number => i !== undefined);
  const clave = claveConfirmacion(problema, indicesRevisados);
  const confirmado = props.confirmados.has(clave);
  const aviso = problema.severidad === "aviso";
  const campos = problema.detalle.campos?.split(",").filter(Boolean) ?? [];

  const camposEditables: Partial<Record<TipoProblema, string[]>> = {
    dato_faltante: campos,
    dato_invalido: campos,
    nombre_sospechoso: ["nombre"],
    precio_bajo_costo: ["precioBase", "costo"],
    cambio_precio_grande: ["precioBase"],
  };
  const editables = camposEditables[problema.tipo] ?? [];

  return (
    <li className="py-3">
      <p className="text-slate-700 text-sm">{problema.mensaje}</p>
      <div className="mt-2 grid gap-2">
        {indices.map((i) => {
          const fila = borrador.filas[i] ?? {};
          const quitada = borrador.quitadas[i] !== undefined;
          return (
            <div key={i} className="rounded-lg border border-slate-200 p-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-slate-400">Fila {borrador.filaExcel[i]}</span>
                <span className="font-medium text-slate-800">{fila.skuPadre ?? "—"}</span>
                <span className="text-slate-700">{fila.nombre ?? "—"}</span>
                {fila.precioBase && <span className="text-slate-500">${fila.precioBase}</span>}
                {fila.stockInicial && (
                  <span className="text-slate-500">{fila.stockInicial} en existencia</span>
                )}
                {quitada && <span className="gx-badge-warn">Quitada</span>}
              </div>
              {!quitada && (
                <div className="mt-2 flex flex-col gap-2">
                  {editables.length > 0 && !confirmado && (
                    <EditorCampos
                      fila={fila}
                      campos={editables}
                      onGuardar={(cambios) => onBorrador(editarFila(borrador, i, cambios))}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {problema.tipo === "codigo_repetido" && (
                      <CambiarCodigo
                        actual={fila.skuPadre ?? ""}
                        onGuardar={(codigo) =>
                          onBorrador(editarFila(borrador, i, { skuPadre: codigo }))
                        }
                      />
                    )}
                    {(problema.tipo === "codigo_barras_repetido" ||
                      problema.tipo === "codigo_barras_en_uso") && (
                      <button
                        type="button"
                        className="gx-btn-secondary"
                        onClick={() =>
                          onBorrador(editarFila(borrador, i, { codigoBarras: undefined }))
                        }
                      >
                        Quitar código de barras
                      </button>
                    )}
                    {!aviso && (
                      <button
                        type="button"
                        className="gx-btn-ghost text-danger"
                        onClick={() => onBorrador(quitarFila(borrador, i, QUITADA))}
                      >
                        Quitar fila
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {problema.tipo === "codigo_repetido" && indices.length > 1 && (
          <button
            type="button"
            className="gx-btn-secondary"
            onClick={() => onBorrador(unirMismoProducto(borrador, indices))}
          >
            Es el mismo producto: dejar una y sumar existencias
          </button>
        )}
        {problema.tipo === "codigo_nombre_invertidos" && !confirmado && (
          <button
            type="button"
            className="gx-btn-secondary"
            onClick={() =>
              onBorrador(
                indices.reduce((b, i) => voltearCodigoNombre(b, i, conCodigoBarras), borrador),
              )
            }
          >
            Voltear código y nombre
          </button>
        )}
        {problema.tipo === "existencia_decimal" && !confirmado && (
          <button
            type="button"
            className="gx-btn-secondary"
            onClick={() =>
              onBorrador(
                indices.reduce(
                  (b, i) =>
                    editarFila(b, i, {
                      stockInicial: String(Math.round(Number(b.filas[i]?.stockInicial) || 0)),
                    }),
                  borrador,
                ),
              )
            }
          >
            Redondear
          </button>
        )}
        {aviso &&
          (confirmado ? (
            <span className="gx-badge-ok">Confirmado</span>
          ) : (
            <button
              type="button"
              className="gx-btn-ghost"
              onClick={() => props.onConfirmar([clave])}
            >
              Dejar así
            </button>
          ))}
      </div>
    </li>
  );
}

function EditorCampos({
  fila,
  campos,
  onGuardar,
}: {
  fila: Record<string, string>;
  campos: string[];
  onGuardar: (cambios: Record<string, string>) => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.map((c) => [c, fila[c] ?? ""])),
  );
  return (
    <div className="flex flex-wrap items-end gap-2">
      {campos.map((campo) => (
        <label key={campo} className="min-w-0 flex-1 basis-32">
          <span className="gx-label">{ETIQUETA_CAMPO[campo] ?? campo}</span>
          <input
            className="gx-input"
            value={valores[campo] ?? ""}
            inputMode={CAMPOS_NUMERICOS.has(campo) ? "decimal" : undefined}
            onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
          />
        </label>
      ))}
      <button type="button" className="gx-btn-secondary" onClick={() => onGuardar(valores)}>
        Guardar
      </button>
    </div>
  );
}

function CambiarCodigo({
  actual,
  onGuardar,
}: { actual: string; onGuardar: (codigo: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [codigo, setCodigo] = useState(actual);
  if (!editando) {
    return (
      <button type="button" className="gx-btn-secondary" onClick={() => setEditando(true)}>
        Cambiar código
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 basis-40">
        <span className="gx-label">Código nuevo</span>
        <input className="gx-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
      </label>
      <button
        type="button"
        className="gx-btn-secondary"
        disabled={!codigo.trim() || codigo.trim() === actual}
        onClick={() => onGuardar(codigo)}
      >
        Guardar
      </button>
    </div>
  );
}

function FilaDepartamento({
  departamento: d,
  destino,
  numeroConfirmado,
  onDestino,
  onConfirmar,
}: {
  departamento: DepartamentoImportacion;
  destino: string;
  numeroConfirmado: boolean;
  onDestino: (departamento: string, destino: string) => void;
  onConfirmar: (claves: string[]) => void;
}) {
  const sugerencia = d.sugerencia;
  const numeroPendiente = d.soloNumero && /^\d+$/.test(destino.trim()) && !numeroConfirmado;
  return (
    <tr>
      <td className="gx-td font-medium">{d.nombre}</td>
      <td className="gx-td tabular-nums">{d.productos}</td>
      <td className="gx-td">
        <input
          className="gx-input min-w-40"
          list="departamentos-destino"
          aria-label={`Departamento para ${d.nombre}`}
          value={destino}
          onChange={(e) => onDestino(d.nombre, e.target.value)}
        />
      </td>
      <td className="gx-td">
        <div className="flex flex-wrap items-center gap-1">
          {d.existeEnCatalogo && <span className="gx-badge-info">Ya existe</span>}
          {sugerencia && (
            <span className={sugerencia.marcada ? "gx-badge-ok" : "gx-badge-warn"}>
              {MOTIVO_DEPARTAMENTO[sugerencia.motivo]}
            </span>
          )}
          {sugerencia && destino !== sugerencia.unirEn && (
            <button
              type="button"
              className="gx-btn-ghost text-xs"
              onClick={() => onDestino(d.nombre, sugerencia.unirEn)}
            >
              Unir en {sugerencia.unirEn}
            </button>
          )}
          {sugerencia && destino !== d.nombre && (
            <button
              type="button"
              className="gx-btn-ghost text-xs"
              onClick={() => onDestino(d.nombre, d.nombre)}
            >
              Dejar separado
            </button>
          )}
          {numeroPendiente && (
            <>
              <span className="gx-badge-warn">Es solo un número</span>
              <button
                type="button"
                className="gx-btn-ghost text-xs"
                onClick={() => onConfirmar([`departamento:${d.nombre}`])}
              >
                Dejar así
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
