import type { TenantPrismaClient } from "@gaespos/db";
import { type PermissionCode, hasPermission, mergeRolePermissions } from "@gaespos/permissions";

export interface NuevaNotificacion {
  tipo: string;
  titulo: string;
  cuerpo: string;
  link?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/** Crea una notificación in-app para un empleado del tenant. */
export async function notificarUsuario(
  prisma: TenantPrismaClient,
  usuarioId: string,
  n: NuevaNotificacion,
): Promise<void> {
  await prisma.notificacion.create({
    data: {
      destinatarioTipo: "usuario",
      usuarioId,
      tipo: n.tipo,
      titulo: n.titulo,
      cuerpo: n.cuerpo,
      ...(n.link ? { link: n.link } : {}),
      ...(n.metadata ? { metadata: n.metadata as object } : {}),
    },
  });
}

/** Crea una notificación in-app para un cliente de la tienda. */
export async function notificarCliente(
  prisma: TenantPrismaClient,
  clienteId: string,
  n: NuevaNotificacion,
): Promise<void> {
  await prisma.notificacion.create({
    data: {
      destinatarioTipo: "cliente",
      clienteId,
      tipo: n.tipo,
      titulo: n.titulo,
      cuerpo: n.cuerpo,
      ...(n.link ? { link: n.link } : {}),
      ...(n.metadata ? { metadata: n.metadata as object } : {}),
    },
  });
}

/** IDs de empleados activos cuyos roles otorgan el permiso (o son dueños). */
export async function usuariosConPermiso(
  prisma: TenantPrismaClient,
  permiso: PermissionCode,
): Promise<string[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { isActive: true },
    select: { id: true, roles: { select: { rol: { select: { permisos: true } } } } },
  });
  const ids: string[] = [];
  for (const u of usuarios) {
    const permArrays = u.roles.map((r) =>
      Array.isArray(r.rol.permisos) ? (r.rol.permisos as ReadonlyArray<string>) : [],
    );
    const merged = mergeRolePermissions(permArrays);
    const isOwner = merged.length === 1 && (merged[0] as unknown as string) === "*";
    if (hasPermission({ permissions: merged, isOwner }, permiso)) ids.push(u.id);
  }
  return ids;
}

/** Notifica a todos los empleados con un permiso (best-effort, en paralelo). */
export async function notificarUsuariosConPermiso(
  prisma: TenantPrismaClient,
  permiso: PermissionCode,
  n: NuevaNotificacion,
): Promise<void> {
  const ids = await usuariosConPermiso(prisma, permiso);
  if (ids.length === 0) return;
  await prisma.notificacion.createMany({
    data: ids.map((usuarioId) => ({
      destinatarioTipo: "usuario" as const,
      usuarioId,
      tipo: n.tipo,
      titulo: n.titulo,
      cuerpo: n.cuerpo,
      ...(n.link ? { link: n.link } : {}),
      ...(n.metadata ? { metadata: n.metadata as object } : {}),
    })),
  });
}

interface ListaOpts {
  soloNoLeidas?: boolean;
  limit?: number;
}

export async function listarNotificacionesUsuario(
  prisma: TenantPrismaClient,
  usuarioId: string,
  opts: ListaOpts = {},
): Promise<{ items: unknown[]; noLeidas: number }> {
  const where = { usuarioId, ...(opts.soloNoLeidas ? { leida: false } : {}) };
  const [items, noLeidas] = await Promise.all([
    prisma.notificacion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 30,
    }),
    prisma.notificacion.count({ where: { usuarioId, leida: false } }),
  ]);
  return { items, noLeidas };
}

export async function listarNotificacionesCliente(
  prisma: TenantPrismaClient,
  clienteId: string,
  opts: ListaOpts = {},
): Promise<{ items: unknown[]; noLeidas: number }> {
  const where = { clienteId, ...(opts.soloNoLeidas ? { leida: false } : {}) };
  const [items, noLeidas] = await Promise.all([
    prisma.notificacion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 30,
    }),
    prisma.notificacion.count({ where: { clienteId, leida: false } }),
  ]);
  return { items, noLeidas };
}

/** Marca una notificación como leída validando que pertenezca al destinatario. */
export async function marcarLeida(
  prisma: TenantPrismaClient,
  destinatario: { usuarioId?: string; clienteId?: string },
  notificacionId: string,
): Promise<boolean> {
  const result = await prisma.notificacion.updateMany({
    where: {
      id: notificacionId,
      ...(destinatario.usuarioId ? { usuarioId: destinatario.usuarioId } : {}),
      ...(destinatario.clienteId ? { clienteId: destinatario.clienteId } : {}),
      leida: false,
    },
    data: { leida: true, leidaAt: new Date() },
  });
  return result.count > 0;
}

export async function marcarTodasLeidas(
  prisma: TenantPrismaClient,
  destinatario: { usuarioId?: string; clienteId?: string },
): Promise<number> {
  const result = await prisma.notificacion.updateMany({
    where: {
      ...(destinatario.usuarioId ? { usuarioId: destinatario.usuarioId } : {}),
      ...(destinatario.clienteId ? { clienteId: destinatario.clienteId } : {}),
      leida: false,
    },
    data: { leida: true, leidaAt: new Date() },
  });
  return result.count;
}
