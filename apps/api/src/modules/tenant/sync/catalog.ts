import { createHash, randomUUID } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";
import {
  PERMISSIONS,
  type PermissionPrincipal,
  hasPermission,
  requirePermission,
} from "@gaespos/permissions";
import type { CatalogManifest, CatalogPage } from "@gaespos/sync";

type Tx = Parameters<Parameters<TenantPrismaClient["$transaction"]>[0]>[0];
const PAGE_SIZE = 500;
export const catalogClientSelect = {
  id: true,
  nombre: true,
  apellidos: true,
  tipo: true,
  isDefault: true,
  emailPrincipal: true,
  telefonoPrincipal: true,
  rfc: true,
  isActive: true,
  archivedAt: true,
  updatedAt: true,
} as const;

export class CatalogError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
function permissionsHash(principal: PermissionPrincipal): string {
  return createHash("sha256")
    .update(
      JSON.stringify([principal.isOwner === true, [...new Set(principal.permissions)].sort()]),
    )
    .digest("hex");
}
interface EntitySource {
  entityType: string;
  fetch(tx: Tx, after: string | null): Promise<{ id: string }[]>;
}
function sources(principal: PermissionPrincipal): EntitySource[] {
  return [
    {
      entityType: "producto",
      fetch: (tx, after) =>
        tx.producto.findMany({
          where: { ...(after ? { id: { gt: after } } : {}), isActive: true, archivedAt: null },
          orderBy: { id: "asc" },
          take: PAGE_SIZE,
          select: {
            id: true,
            skuPadre: true,
            nombre: true,
            categoriaId: true,
            tipoVenta: true,
            unidadMedida: true,
            aplicaIva: true,
            tasaIva: true,
            aplicaIeps: true,
            tasaIeps: true,
            permiteDescuento: true,
            requiresBalanza: true,
            requiresLote: true,
            requiresSerie: true,
            updatedAt: true,
          },
        }),
    },
    {
      entityType: "variante",
      fetch: (tx, after) =>
        tx.productoVariante.findMany({
          where: {
            ...(after ? { id: { gt: after } } : {}),
            isActive: true,
            archivedAt: null,
            producto: { isActive: true, archivedAt: null },
          },
          orderBy: { id: "asc" },
          take: PAGE_SIZE,
          select: {
            id: true,
            productoId: true,
            sku: true,
            nombreVariante: true,
            precioBase: true,
            updatedAt: true,
            codigosBarras: { select: { codigo: true, isPrimary: true } },
          },
        }),
    },
    {
      entityType: "cliente",
      fetch: (tx, after) =>
        hasPermission(principal, PERMISSIONS.CLIENTES_LEER)
          ? tx.cliente.findMany({
              where: { ...(after ? { id: { gt: after } } : {}), isActive: true, archivedAt: null },
              orderBy: { id: "asc" },
              take: PAGE_SIZE,
              select: catalogClientSelect,
            })
          : Promise.resolve([]),
    },
    {
      entityType: "promocion",
      fetch: (tx, after) =>
        hasPermission(principal, PERMISSIONS.VENTAS_CREAR)
          ? tx.promocion.findMany({
              where: {
                ...(after ? { id: { gt: after } } : {}),
                status: { in: ["activa", "programada"] },
                requiereCodigo: false,
              },
              orderBy: { id: "asc" },
              take: PAGE_SIZE,
              select: {
                id: true,
                nombre: true,
                tipo: true,
                condiciones: true,
                acciones: true,
                vigenciaInicio: true,
                vigenciaFin: true,
                horarios: true,
                canales: true,
                sucursalesAplicables: true,
                stackConOtras: true,
                prioridad: true,
                limiteUsosTotal: true,
                limiteUsosCliente: true,
                usosActuales: true,
                updatedAt: true,
                productos: { select: { productoId: true, rol: true } },
              },
            })
          : Promise.resolve([]),
    },
  ];
}
async function materializePages(
  tx: Tx,
  id: string,
  principal: PermissionPrincipal,
): Promise<number> {
  let pageCount = 0;
  for (const source of sources(principal)) {
    let after: string | null = null;
    while (true) {
      const rows = await source.fetch(tx, after);
      const payload = JSON.parse(JSON.stringify({ entityType: source.entityType, rows })) as object;
      await tx.syncCatalogPage.create({
        data: { snapshotId: id, pageIndex: pageCount++, payload },
      });
      if (rows.length < PAGE_SIZE) break;
      after = rows.at(-1)?.id ?? null;
      if (!after) throw new CatalogError(503, "Página de catálogo incompleta");
    }
  }
  return pageCount;
}
async function createSnapshotOnce(
  prisma: TenantPrismaClient,
  principal: PermissionPrincipal,
  userId: string,
): Promise<CatalogManifest> {
  return prisma.$transaction(
    async (tx) => {
      const locks = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ${userId}, 7710031)) AS locked`;
      if (!locks[0]?.locked)
        throw new CatalogError(
          409,
          "Ya hay una descarga preparándose para esta cuenta; vuelve a intentar",
        );
      const times = await tx.$queryRaw<{ now: Date }[]>`SELECT CURRENT_TIMESTAMP AS now`;
      const now = times[0]?.now;
      if (!now) throw new CatalogError(503, "No se pudo preparar el catálogo");
      const expiresAt = new Date(now.getTime() + 15 * 60_000);
      await tx.syncCatalogSnapshot.deleteMany({
        where: { OR: [{ usuarioId: userId }, { expiresAt: { lt: now } }] },
      });
      const id = randomUUID();
      await tx.syncCatalogSnapshot.create({
        data: {
          id,
          usuarioId: userId,
          permissionsHash: permissionsHash(principal),
          expiresAt,
          serverTime: now,
          pageCount: 0,
        },
      });
      const pageCount = await materializePages(tx, id, principal);
      await tx.syncCatalogSnapshot.update({ where: { id }, data: { pageCount } });
      return {
        id,
        userId,
        serverTime: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        pageCount,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 60_000, maxWait: 5000 },
  );
}
export async function createCatalogSnapshot(
  prisma: TenantPrismaClient,
  principal: PermissionPrincipal,
  userId: string,
): Promise<CatalogManifest> {
  requirePermission(principal, [
    PERMISSIONS.SYNC_USAR,
    PERMISSIONS.PRODUCTOS_LEER,
    PERMISSIONS.PRECIOS_LEER,
  ]);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await createSnapshotOnce(prisma, principal, userId);
    } catch (error) {
      if (
        !(
          error &&
          typeof error === "object" &&
          "code" in error &&
          ["P2034", "P2002"].includes(String(error.code))
        )
      )
        throw error;
    }
  }
  throw new CatalogError(409, "Otra descarga está actualizándose; vuelve a intentar");
}
export async function readCatalogPage(
  prisma: TenantPrismaClient,
  principal: PermissionPrincipal,
  userId: string,
  id: string,
  pageIndex: number,
): Promise<CatalogPage> {
  requirePermission(principal, [
    PERMISSIONS.SYNC_USAR,
    PERMISSIONS.PRODUCTOS_LEER,
    PERMISSIONS.PRECIOS_LEER,
  ]);
  const page = await prisma.syncCatalogPage.findFirst({
    where: {
      snapshotId: id,
      pageIndex,
      snapshot: {
        usuarioId: userId,
        permissionsHash: permissionsHash(principal),
        expiresAt: { gt: new Date() },
      },
    },
  });
  if (!page)
    throw new CatalogError(
      404,
      "La descarga caducó o ya no está disponible; actualiza el catálogo",
    );
  const payload = page.payload as unknown as Pick<CatalogPage, "entityType" | "rows">;
  return { snapshotId: id, pageIndex, ...payload };
}
