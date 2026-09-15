import type { TenantPrismaClient } from "@gaespos/db";

/**
 * Revisión en seco de una carga masiva de productos: no guarda nada. Detecta lo
 * que un inventario exportado de otro sistema trae casi siempre (códigos
 * repetidos, columnas volteadas, precios por debajo del costo, departamentos
 * escritos de cinco formas) para que el usuario lo corrija o lo confirme antes
 * de importar, como en la vista previa de importación de Shopify o Square.
 */

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
  /** Estable para las mismas filas: el panel guarda con él la decisión del usuario. */
  id: string;
  tipo: TipoProblema;
  /** "bloqueante" impide importar; "aviso" se puede confirmar. */
  severidad: "bloqueante" | "aviso";
  /** Índices (desde 0) de las filas en el arreglo recibido. */
  filas: number[];
  mensaje: string;
  detalle: Record<string, string>;
}

export interface SugerenciaDepartamento {
  unirEn: string;
  /** escritura: mayúsculas/acentos/espacios · forma: singular/plural o "de" · parecido: posible error de dedo */
  motivo: "escritura" | "forma" | "parecido";
  /** Si el panel la muestra ya aceptada. Un posible error de dedo la decide el usuario. */
  marcada: boolean;
}

export interface DepartamentoImportacion {
  nombre: string;
  productos: number;
  existeEnCatalogo: boolean;
  soloNumero: boolean;
  sugerencia: SugerenciaDepartamento | null;
}

export interface RevisionImportacion {
  total: number;
  nuevos: number;
  actualizar: number;
  bloqueantes: number;
  avisos: number;
  problemas: ProblemaImportacion[];
  departamentos: DepartamentoImportacion[];
}

export type FilaImportacion = Record<string, string | undefined>;

const CAMPOS_NUMERICOS = [
  "precioBase",
  "costo",
  "stockInicial",
  "tasaIva",
  "precioMayoreo",
  "stockMinimo",
  "stockMaximo",
];

const ETIQUETAS: Record<string, string> = {
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

const DECIMAL = /^\d+(\.\d+)?$/;
/** Un precio que sube o baja a la mitad o más casi siempre es un error de captura. */
const CAMBIO_PRECIO_GRANDE = 0.5;
const PALABRAS_VACIAS = new Set(["DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "CON", "PARA"]);

function texto(valor: string | undefined): string {
  return (valor ?? "").trim();
}

function etiqueta(campo: string): string {
  return ETIQUETAS[campo] ?? campo;
}

function problema(
  tipo: TipoProblema,
  severidad: ProblemaImportacion["severidad"],
  filas: number[],
  mensaje: string,
  detalle: Record<string, string> = {},
): ProblemaImportacion {
  return { id: `${tipo}:${filas.join(",")}`, tipo, severidad, filas, mensaje, detalle };
}

function agrupar<T>(items: T[], clave: (item: T) => string): Map<string, number[]> {
  const grupos = new Map<string, number[]>();
  items.forEach((item, i) => {
    const k = clave(item);
    if (!k) return;
    const grupo = grupos.get(k);
    if (grupo) grupo.push(i);
    else grupos.set(k, [i]);
  });
  return grupos;
}

/**
 * Lo que rompería el catálogo si se importa: el mismo código en varias filas
 * (la última pisaría a las anteriores) o un código de barras que ya tiene otro
 * producto. La importación lo vuelve a revisar aunque alguien se salte la revisión.
 */
export async function problemasDeIntegridad(
  prisma: Pick<TenantPrismaClient, "productoCodigoBarras">,
  filas: Array<{ skuPadre?: string | undefined; codigoBarras?: string | undefined }>,
): Promise<ProblemaImportacion[]> {
  const problemas: ProblemaImportacion[] = [];

  for (const [codigo, indices] of agrupar(filas, (f) => texto(f.skuPadre))) {
    if (indices.length < 2) continue;
    problemas.push(
      problema(
        "codigo_repetido",
        "bloqueante",
        indices,
        `El código ${codigo} aparece en ${indices.length} filas`,
        { codigo },
      ),
    );
  }

  const porCodigoBarras = agrupar(filas, (f) => texto(f.codigoBarras));
  for (const [codigoBarras, indices] of porCodigoBarras) {
    const productos = new Set(indices.map((i) => texto(filas[i]?.skuPadre)));
    if (productos.size < 2) continue;
    problemas.push(
      problema(
        "codigo_barras_repetido",
        "bloqueante",
        indices,
        `El código de barras ${codigoBarras} lo tienen ${productos.size} productos distintos`,
        { codigoBarras },
      ),
    );
  }

  if (porCodigoBarras.size > 0) {
    const enUso = await prisma.productoCodigoBarras.findMany({
      where: { codigo: { in: [...porCodigoBarras.keys()] } },
      select: {
        codigo: true,
        variante: { select: { producto: { select: { skuPadre: true, nombre: true } } } },
      },
    });
    for (const usado of enUso) {
      const dueno = usado.variante.producto;
      const indices = (porCodigoBarras.get(usado.codigo) ?? []).filter(
        (i) => texto(filas[i]?.skuPadre) !== dueno.skuPadre,
      );
      if (indices.length === 0) continue;
      problemas.push(
        problema(
          "codigo_barras_en_uso",
          "bloqueante",
          indices,
          `El código de barras ${usado.codigo} ya es de "${dueno.nombre}" (${dueno.skuPadre})`,
          {
            codigoBarras: usado.codigo,
            codigoExistente: dueno.skuPadre,
            nombreExistente: dueno.nombre,
          },
        ),
      );
    }
  }
  return problemas;
}

function revisarFila(
  fila: FilaImportacion,
  i: number,
  obligatorias: string[],
): ProblemaImportacion[] {
  const problemas: ProblemaImportacion[] = [];
  const codigo = texto(fila.skuPadre);
  const nombre = texto(fila.nombre);

  const faltan = ["skuPadre", "nombre", "precioBase", ...obligatorias].filter(
    (campo, pos, todos) => todos.indexOf(campo) === pos && !texto(fila[campo]),
  );
  if (faltan.length > 0) {
    problemas.push(
      problema("dato_faltante", "bloqueante", [i], `Falta ${faltan.map(etiqueta).join(", ")}`, {
        campos: faltan.join(","),
      }),
    );
  }

  const invalidos = CAMPOS_NUMERICOS.filter((c) => texto(fila[c]) && !DECIMAL.test(texto(fila[c])));
  if (codigo.length > 60) invalidos.push("skuPadre");
  if (nombre.length > 240) invalidos.push("nombre");
  if (invalidos.length > 0) {
    problemas.push(
      problema(
        "dato_invalido",
        "bloqueante",
        [i],
        `Revisa ${invalidos.map(etiqueta).join(", ")}: el valor no se puede usar`,
        { campos: invalidos.join(",") },
      ),
    );
  }

  const invertidos = /^\d{4,14}$/.test(nombre) && !/^\d+$/.test(codigo) && codigo !== "";
  if (invertidos) {
    problemas.push(
      problema(
        "codigo_nombre_invertidos",
        "aviso",
        [i],
        `Parece que el código y el nombre vienen al revés ("${codigo}" / "${nombre}")`,
        { codigo: nombre, nombre: codigo },
      ),
    );
  } else if (
    nombre &&
    // "$132" o "CODIGO TG1092" dentro del nombre son restos de otras columnas;
    // la palabra "precio" sola no ("Etiqueta de precio" es un producto).
    (/\$\s*\d/.test(nombre) ||
      /\bc[oó]digo\s*[:#]?\s*[A-Z0-9-]{3,}/i.test(nombre) ||
      nombre.length < 3)
  ) {
    problemas.push(
      problema("nombre_sospechoso", "aviso", [i], `El nombre "${nombre}" no parece un producto`, {
        nombre,
      }),
    );
  }

  const precio = texto(fila.precioBase);
  const costo = texto(fila.costo);
  if (DECIMAL.test(precio) && DECIMAL.test(costo) && Number(costo) > Number(precio)) {
    problemas.push(
      problema("precio_bajo_costo", "aviso", [i], `Se vende en $${precio} y cuesta $${costo}`, {
        precio,
        costo,
      }),
    );
  }

  const existencia = texto(fila.stockInicial);
  if (DECIMAL.test(existencia) && !Number.isInteger(Number(existencia))) {
    problemas.push(
      problema("existencia_decimal", "aviso", [i], `Existencia con decimales: ${existencia}`, {
        existencia,
      }),
    );
  }
  return problemas;
}

// "Papelería", "PAPELERIA" y "papeleria " son el mismo departamento.
function claveEscritura(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// "BOLSAS DE REGALO" y "BOLSA REGALO" tienen la misma forma.
function claveForma(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((palabra) => palabra && !PALABRAS_VACIAS.has(palabra))
    .map(singular)
    .join("");
}

function singular(palabra: string): string {
  if (palabra.length <= 3 || !palabra.endsWith("S")) return palabra;
  // "FLORES" → "FLOR", pero "PELUCHES" → "PELUCHE".
  if (palabra.endsWith("ES") && /[RLNDZJ]$/.test(palabra.slice(0, -2))) return palabra.slice(0, -2);
  return palabra.slice(0, -1);
}

function unaLetraDeDiferencia(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diferencias = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++diferencias > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return diferencias + (a.length - i) + (b.length - j) <= 1;
}

function masUsado(nombres: string[], cuantos: (n: string) => number): string {
  return [...nombres].sort(
    (a, b) =>
      cuantos(b) - cuantos(a) ||
      Number(b === b.toUpperCase()) - Number(a === a.toUpperCase()) ||
      nombres.indexOf(a) - nombres.indexOf(b),
  )[0] as string;
}

async function revisarDepartamentos(
  prisma: Pick<TenantPrismaClient, "categoria">,
  filas: FilaImportacion[],
): Promise<DepartamentoImportacion[]> {
  const conteo = new Map<string, number>();
  for (const fila of filas) {
    const nombre = texto(fila.categoriaNombre);
    if (nombre) conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1);
  }
  if (conteo.size === 0) return [];

  const catalogo = await prisma.categoria.findMany({
    where: { isActive: true },
    select: { nombre: true },
  });
  const enCatalogo = new Map(catalogo.map((c) => [claveEscritura(c.nombre), c.nombre]));
  const nombres = [...conteo.keys()];
  // Si el archivo escribe sus departamentos en mayúsculas, esa versión gana
  // aunque otra escritura se repita más.
  const archivoEnMayusculas =
    nombres.filter((n) => n === n.toUpperCase()).length >= nombres.length * 0.6;

  // 1) Misma escritura: se unen solos (con la categoría que ya existe, si hay).
  const porEscritura = new Map<string, string>();
  const totalDe = new Map<string, number>();
  const gruposEscritura = new Map<string, string[]>();
  for (const n of nombres) {
    const k = claveEscritura(n);
    gruposEscritura.set(k, [...(gruposEscritura.get(k) ?? []), n]);
  }
  for (const [k, grupo] of gruposEscritura) {
    const enMayusculas = archivoEnMayusculas ? grupo.find((n) => n === n.toUpperCase()) : undefined;
    const canonico =
      enCatalogo.get(k) ?? enMayusculas ?? masUsado(grupo, (n) => conteo.get(n) ?? 0);
    for (const n of grupo) porEscritura.set(n, canonico);
    totalDe.set(
      canonico,
      grupo.reduce((s, n) => s + (conteo.get(n) ?? 0), 0),
    );
  }

  // 2) Misma forma (singular/plural, "de"): sugerido y marcado.
  const porForma = new Map<string, string>();
  const gruposForma = new Map<string, string[]>();
  for (const canonico of totalDe.keys()) {
    const k = claveForma(canonico);
    gruposForma.set(k, [...(gruposForma.get(k) ?? []), canonico]);
  }
  const totalForma = new Map<string, number>();
  for (const grupo of gruposForma.values()) {
    const existente = grupo.find((n) => enCatalogo.get(claveEscritura(n)) === n);
    const canonico = existente ?? masUsado(grupo, (n) => totalDe.get(n) ?? 0);
    for (const n of grupo) porForma.set(n, canonico);
    totalForma.set(
      canonico,
      grupo.reduce((s, n) => s + (totalDe.get(n) ?? 0), 0),
    );
  }

  // 3) Posible error de dedo (una letra, mismos números): sugerido sin marcar.
  const parecido = new Map<string, string>();
  const finales = [...totalForma.keys()];
  for (let a = 0; a < finales.length; a++) {
    for (let b = a + 1; b < finales.length; b++) {
      const na = finales[a] as string;
      const nb = finales[b] as string;
      const ka = claveForma(na);
      const kb = claveForma(nb);
      if (ka.length < 7 || kb.length < 7) continue;
      if (ka.replace(/\D/g, "") !== kb.replace(/\D/g, "")) continue;
      if (!unaLetraDeDiferencia(ka, kb)) continue;
      const [menor, mayor] =
        (totalForma.get(na) ?? 0) <= (totalForma.get(nb) ?? 0) ? [na, nb] : [nb, na];
      if (!parecido.has(menor)) parecido.set(menor, mayor);
    }
  }

  return nombres
    .map((nombre): DepartamentoImportacion => {
      const escritura = porEscritura.get(nombre) ?? nombre;
      const forma = porForma.get(escritura) ?? escritura;
      let sugerencia: SugerenciaDepartamento | null = null;
      if (nombre !== escritura) sugerencia = { unirEn: forma, motivo: "escritura", marcada: true };
      else if (escritura !== forma) sugerencia = { unirEn: forma, motivo: "forma", marcada: true };
      else if (parecido.has(forma)) {
        sugerencia = { unirEn: parecido.get(forma) as string, motivo: "parecido", marcada: false };
      }
      return {
        nombre,
        productos: conteo.get(nombre) ?? 0,
        existeEnCatalogo: enCatalogo.has(claveEscritura(nombre)),
        soloNumero: /^\d+$/.test(nombre),
        sugerencia,
      };
    })
    .sort((a, b) => b.productos - a.productos || a.nombre.localeCompare(b.nombre, "es"));
}

export async function revisarImportacion(
  prisma: Pick<TenantPrismaClient, "producto" | "productoCodigoBarras" | "categoria">,
  filas: FilaImportacion[],
  columnasObligatorias: string[] = [],
): Promise<RevisionImportacion> {
  const problemas = filas.flatMap((fila, i) => revisarFila(fila, i, columnasObligatorias));
  problemas.push(...(await problemasDeIntegridad(prisma, filas)));

  const codigos = [...new Set(filas.map((f) => texto(f.skuPadre)).filter(Boolean))];
  const existentes = codigos.length
    ? await prisma.producto.findMany({
        where: { skuPadre: { in: codigos } },
        select: {
          skuPadre: true,
          variantes: { where: { isDefault: true }, select: { precioBase: true }, take: 1 },
        },
      })
    : [];
  const precioActual = new Map(
    existentes.map((p) => [p.skuPadre, Number(p.variantes[0]?.precioBase ?? 0)]),
  );
  filas.forEach((fila, i) => {
    const antes = precioActual.get(texto(fila.skuPadre));
    const precio = texto(fila.precioBase);
    if (!antes || !DECIMAL.test(precio)) return;
    const despues = Number(precio);
    if (Math.abs(despues - antes) / antes < CAMBIO_PRECIO_GRANDE) return;
    problemas.push(
      problema(
        "cambio_precio_grande",
        "aviso",
        [i],
        `El precio de ${texto(fila.skuPadre)} cambia de $${antes} a $${precio}`,
        { antes: String(antes), despues: precio },
      ),
    );
  });

  const bloqueantes = problemas.filter((p) => p.severidad === "bloqueante").length;
  return {
    total: filas.length,
    nuevos: codigos.length - existentes.length,
    actualizar: existentes.length,
    bloqueantes,
    avisos: problemas.length - bloqueantes,
    problemas,
    departamentos: await revisarDepartamentos(prisma, filas),
  };
}
