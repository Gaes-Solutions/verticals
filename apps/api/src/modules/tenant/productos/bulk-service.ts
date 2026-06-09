import type { TenantPrismaClient } from "@gaespos/db";

/** Resultado por fila — el front lo muestra como reporte de importación. */
export interface FilaResultado {
  fila: number;
  sku: string;
  accion: "creado" | "actualizado" | "error";
  mensaje?: string;
}

export interface BulkResumen {
  total: number;
  creados: number;
  actualizados: number;
  errores: number;
  filas: FilaResultado[];
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resumir(filas: FilaResultado[]): BulkResumen {
  return {
    total: filas.length,
    creados: filas.filter((f) => f.accion === "creado").length,
    actualizados: filas.filter((f) => f.accion === "actualizado").length,
    errores: filas.filter((f) => f.accion === "error").length,
    filas,
  };
}

export interface ProductoBulkRow {
  skuPadre: string;
  nombre: string;
  categoriaNombre?: string | undefined;
  precioBase: string;
  aplicaIva?: boolean | undefined;
  tasaIva?: string | undefined;
  codigoBarras?: string | undefined;
}

/** Cache de categorías por nombre (normalizado) para no re-crear en el mismo import. */
async function resolverCategoriaId(
  prisma: TenantPrismaClient,
  cache: Map<string, string>,
  nombre: string,
): Promise<string> {
  const key = nombre.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const existente = await prisma.categoria.findFirst({
    where: { nombre: { equals: nombre.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  if (existente) {
    cache.set(key, existente.id);
    return existente.id;
  }
  // auto-alta: el slug debe ser único, desempata con sufijo si choca
  let slug = slugify(nombre) || `cat-${cache.size + 1}`;
  if (await prisma.categoria.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }
  const creada = await prisma.categoria.create({
    data: { nombre: nombre.trim(), slug },
    select: { id: true },
  });
  cache.set(key, creada.id);
  return creada.id;
}

/**
 * Upsert masivo de productos por skuPadre. Procesa fila por fila (una fila mala
 * no tumba el resto) y devuelve un reporte. Crea la categoría por nombre si no
 * existe. El precio va a la variante default (sku = skuPadre).
 */
export async function bulkUpsertProductos(
  prisma: TenantPrismaClient,
  rows: ProductoBulkRow[],
): Promise<BulkResumen> {
  const filas: FilaResultado[] = [];
  const catCache = new Map<string, string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const numFila = i + 1;
    try {
      const categoriaId = row.categoriaNombre
        ? await resolverCategoriaId(prisma, catCache, row.categoriaNombre)
        : undefined;

      const existente = await prisma.producto.findFirst({
        where: { skuPadre: row.skuPadre },
        select: {
          id: true,
          variantes: { where: { isDefault: true }, select: { id: true }, take: 1 },
        },
      });

      if (existente) {
        await prisma.producto.update({
          where: { id: existente.id },
          data: {
            nombre: row.nombre,
            ...(categoriaId ? { categoriaId } : {}),
            ...(row.aplicaIva !== undefined ? { aplicaIva: row.aplicaIva } : {}),
            ...(row.tasaIva !== undefined ? { tasaIva: row.tasaIva } : {}),
          },
        });
        const varDefault = existente.variantes[0];
        if (varDefault) {
          await prisma.productoVariante.update({
            where: { id: varDefault.id },
            data: { precioBase: row.precioBase },
          });
        }
        filas.push({ fila: numFila, sku: row.skuPadre, accion: "actualizado" });
      } else {
        await prisma.producto.create({
          data: {
            skuPadre: row.skuPadre,
            nombre: row.nombre,
            ...(categoriaId ? { categoriaId } : {}),
            aplicaIva: row.aplicaIva ?? true,
            tasaIva: row.tasaIva ?? "16",
            variantes: {
              create: [
                {
                  sku: row.skuPadre,
                  precioBase: row.precioBase,
                  isDefault: true,
                  ...(row.codigoBarras
                    ? {
                        codigosBarras: {
                          create: [{ codigo: row.codigoBarras, isPrimary: true, tipo: "ean13" }],
                        },
                      }
                    : {}),
                },
              ],
            },
          },
        });
        filas.push({ fila: numFila, sku: row.skuPadre, accion: "creado" });
      }
    } catch (err) {
      filas.push({
        fila: numFila,
        sku: row.skuPadre,
        accion: "error",
        mensaje: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }
  return resumir(filas);
}

export interface PrecioBulkRow {
  sku: string;
  precioBase: string;
}

/** Actualización masiva de precio base por SKU de variante. */
export async function bulkActualizarPrecios(
  prisma: TenantPrismaClient,
  rows: PrecioBulkRow[],
): Promise<BulkResumen> {
  const filas: FilaResultado[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const numFila = i + 1;
    try {
      const variante = await prisma.productoVariante.findUnique({
        where: { sku: row.sku },
        select: { id: true },
      });
      if (!variante) {
        filas.push({ fila: numFila, sku: row.sku, accion: "error", mensaje: "SKU no encontrado" });
        continue;
      }
      await prisma.productoVariante.update({
        where: { id: variante.id },
        data: { precioBase: row.precioBase },
      });
      filas.push({ fila: numFila, sku: row.sku, accion: "actualizado" });
    } catch (err) {
      filas.push({
        fila: numFila,
        sku: row.sku,
        accion: "error",
        mensaje: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }
  return resumir(filas);
}
