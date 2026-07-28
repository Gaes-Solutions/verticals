import { PERMISSIONS, PermissionDeniedError } from "@gaespos/permissions";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  type UsuarioUpdateInput,
  assignRolSchema,
  assignSucursalSchema,
  changeOwnPasswordSchema,
  resetPasswordSchema,
  usuarioCreateSchema,
  usuarioIdParamSchema,
  usuarioUpdateSchema,
} from "./schemas.js";

const OWNER_WILDCARD = "*";

/**
 * Impide la escalada de privilegios al asignar roles: nadie puede otorgar un rol
 * más privilegiado que él mismo. El dueño (isOwner) puede otorgar cualquier rol;
 * cualquier otro actor no puede otorgar el rol wildcard (`dueno`) ni un rol que
 * contenga un permiso que el actor no posee.
 */
async function assertCanGrantRoles(req: FastifyRequest, rolIds: readonly string[]): Promise<void> {
  if (req.principal.isOwner) return;
  const uniqueIds = [...new Set(rolIds)];
  if (uniqueIds.length === 0) return;
  const roles = await req.tenantPrisma.rol.findMany({
    where: { id: { in: uniqueIds } },
    select: { permisos: true },
  });
  const actorPerms = new Set(req.principal.permissions);
  for (const rol of roles) {
    const perms = Array.isArray(rol.permisos) ? (rol.permisos as string[]) : [];
    if (perms.includes(OWNER_WILDCARD) || perms.some((p) => !actorPerms.has(p))) {
      throw new PermissionDeniedError([PERMISSIONS.USUARIOS_ASIGNAR_ROL]);
    }
  }
}

/**
 * Un usuario es "dueño" si alguno de sus roles contiene el permiso wildcard (`*`).
 */
async function isTargetOwner(req: FastifyRequest, targetId: string): Promise<boolean> {
  const target = await req.tenantPrisma.usuario.findUnique({
    where: { id: targetId },
    select: { roles: { select: { rol: { select: { permisos: true } } } } },
  });
  if (!target) return false;
  return target.roles.some(
    (r) =>
      Array.isArray(r.rol.permisos) &&
      (r.rol.permisos as readonly string[]).includes(OWNER_WILDCARD),
  );
}

/**
 * Impide que un actor que no es dueño desactive/archive a un dueño del tenant,
 * evitando el bloqueo (lockout) de las cuentas de mayor privilegio.
 */
async function assertCanDeactivateTarget(req: FastifyRequest, targetId: string): Promise<void> {
  if (req.principal.isOwner) return;
  if (await isTargetOwner(req, targetId)) {
    throw new PermissionDeniedError([PERMISSIONS.USUARIOS_ARCHIVAR]);
  }
}

async function buildUsuarioUpdateData(body: UsuarioUpdateInput): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};
  if (body.nombre !== undefined) data.nombre = body.nombre;
  if (body.apellidos !== undefined) data.apellidos = body.apellidos;
  if (body.telefono !== undefined) data.telefono = body.telefono;
  if (body.tipoUsuario !== undefined) data.tipoUsuario = body.tipoUsuario;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.codigoEscaneo !== undefined) data.codigoEscaneo = body.codigoEscaneo;
  if (body.pin !== undefined) {
    data.pinHash = body.pin === null ? null : await argon2Hash(body.pin);
  }
  return data;
}

const usuariosRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.USUARIOS_LEER);
    const items = await req.tenantPrisma.usuario.findMany({
      orderBy: { email: "asc" },
      include: {
        roles: { include: { rol: { select: { id: true, codigo: true, nombre: true } } } },
        sucursales: { include: { sucursal: { select: { id: true, codigo: true, nombre: true } } } },
      },
    });
    return items.map((u) => ({
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      apellidos: u.apellidos,
      telefono: u.telefono,
      tipoUsuario: u.tipoUsuario,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      roles: u.roles.map((r) => r.rol),
      sucursales: u.sucursales.map((s) => ({ ...s.sucursal, isPrimary: s.isPrimary })),
    }));
  });

  app.post("/me/change-password", async (req, reply) => {
    const body = changeOwnPasswordSchema.parse(req.body);
    const currentUserId = req.user.kind === "tenant" ? req.user.sub : null;
    if (!currentUserId) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Se requiere sesión de usuario",
      });
    }

    const user = await req.tenantPrisma.usuario.findUnique({
      where: { id: currentUserId },
      select: { passwordHash: true },
    });
    if (!user || !(await argon2Verify(user.passwordHash, body.currentPassword))) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "La contraseña actual no es correcta",
      });
    }

    await req.tenantPrisma.usuario.update({
      where: { id: currentUserId },
      data: { passwordHash: await argon2Hash(body.newPassword) },
    });
    return reply.code(204).send();
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.USUARIOS_LEER);
    const params = usuarioIdParamSchema.parse(req.params);
    const u = await req.tenantPrisma.usuario.findUnique({
      where: { id: params.id },
      include: {
        roles: { include: { rol: { select: { id: true, codigo: true, nombre: true } } } },
        sucursales: { include: { sucursal: { select: { id: true, codigo: true, nombre: true } } } },
      },
    });
    if (!u) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Usuario no encontrado",
      });
    }
    return {
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      apellidos: u.apellidos,
      telefono: u.telefono,
      tipoUsuario: u.tipoUsuario,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      roles: u.roles.map((r) => r.rol),
      sucursales: u.sucursales.map((s) => ({ ...s.sucursal, isPrimary: s.isPrimary })),
    };
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.USUARIOS_CREAR);
    const body = usuarioCreateSchema.parse(req.body);
    await assertCanGrantRoles(req, body.rolIds);
    const passwordHash = await argon2Hash(body.password);
    const pinHash = body.pin ? await argon2Hash(body.pin) : null;

    const data: Record<string, unknown> = {
      email: body.email,
      passwordHash,
      pinHash,
      codigoEscaneo: body.codigoEscaneo ?? null,
      nombre: body.nombre,
      tipoUsuario: body.tipoUsuario,
    };
    if (body.apellidos !== undefined) data.apellidos = body.apellidos;
    if (body.telefono !== undefined) data.telefono = body.telefono;
    if (body.rolIds.length) {
      data.roles = { create: body.rolIds.map((rolId) => ({ rolId })) };
    }
    if (body.sucursalIds.length) {
      data.sucursales = {
        create: body.sucursalIds.map((sucursalId, idx) => ({
          sucursalId,
          isPrimary: idx === 0,
        })),
      };
    }

    const created = await req.tenantPrisma.usuario.create({
      data: data as Parameters<typeof req.tenantPrisma.usuario.create>[0]["data"],
    });
    return reply.code(201).send({ id: created.id, email: created.email });
  });

  app.patch("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.USUARIOS_ACTUALIZAR);
    const params = usuarioIdParamSchema.parse(req.params);
    const body = usuarioUpdateSchema.parse(req.body);
    if (body.isActive === false) {
      await assertCanDeactivateTarget(req, params.id);
    }
    const data = await buildUsuarioUpdateData(body);
    const updated = await req.tenantPrisma.usuario.update({
      where: { id: params.id },
      data,
    });
    return { id: updated.id, email: updated.email };
  });

  app.delete("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.USUARIOS_ARCHIVAR);
    const params = usuarioIdParamSchema.parse(req.params);
    await assertCanDeactivateTarget(req, params.id);
    const archived = await req.tenantPrisma.usuario.update({
      where: { id: params.id },
      data: { isActive: false, terminatedAt: new Date() },
    });
    return { id: archived.id, isActive: archived.isActive };
  });

  app.post("/:id/roles", async (req, reply) => {
    req.requirePerm(PERMISSIONS.USUARIOS_ASIGNAR_ROL);
    const params = usuarioIdParamSchema.parse(req.params);
    const body = assignRolSchema.parse(req.body);
    await assertCanGrantRoles(req, [body.rolId]);
    await req.tenantPrisma.usuarioRol.upsert({
      where: { usuarioId_rolId: { usuarioId: params.id, rolId: body.rolId } },
      update: {},
      create: { usuarioId: params.id, rolId: body.rolId },
    });
    return reply.code(204).send();
  });

  app.delete("/:id/roles/:rolId", async (req, reply) => {
    req.requirePerm(PERMISSIONS.USUARIOS_ASIGNAR_ROL);
    const params = usuarioIdParamSchema.parse(req.params);
    const rolId = (req.params as { rolId?: string }).rolId;
    if (!rolId) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "rolId requerido",
      });
    }
    if (!req.principal.isOwner && (await isTargetOwner(req, params.id))) {
      throw new PermissionDeniedError([PERMISSIONS.USUARIOS_ASIGNAR_ROL]);
    }
    await req.tenantPrisma.usuarioRol.deleteMany({
      where: { usuarioId: params.id, rolId },
    });
    return reply.code(204).send();
  });

  app.post("/:id/sucursales", async (req, reply) => {
    req.requirePerm(PERMISSIONS.USUARIOS_ASIGNAR_ROL);
    const params = usuarioIdParamSchema.parse(req.params);
    const body = assignSucursalSchema.parse(req.body);
    if (body.isPrimary === true) {
      await req.tenantPrisma.usuarioSucursal.updateMany({
        where: { usuarioId: params.id },
        data: { isPrimary: false },
      });
    }
    await req.tenantPrisma.usuarioSucursal.upsert({
      where: { usuarioId_sucursalId: { usuarioId: params.id, sucursalId: body.sucursalId } },
      update: { isPrimary: body.isPrimary ?? false },
      create: {
        usuarioId: params.id,
        sucursalId: body.sucursalId,
        isPrimary: body.isPrimary ?? false,
      },
    });
    return reply.code(204).send();
  });

  app.post("/:id/reset-password", async (req, reply) => {
    req.requirePerm(PERMISSIONS.USUARIOS_RESET_PASSWORD);
    const params = usuarioIdParamSchema.parse(req.params);
    const body = resetPasswordSchema.parse(req.body);

    const target = await req.tenantPrisma.usuario.findUnique({
      where: { id: params.id },
      select: { roles: { select: { rol: { select: { permisos: true } } } } },
    });
    if (!target) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Usuario no encontrado",
      });
    }
    if (!req.principal.isOwner) {
      const actorPerms = new Set(req.principal.permissions);
      const targetOutranksActor = target.roles.some((r) => {
        const perms = Array.isArray(r.rol.permisos) ? (r.rol.permisos as readonly string[]) : [];
        return perms.includes(OWNER_WILDCARD) || perms.some((p) => !actorPerms.has(p));
      });
      if (targetOutranksActor) {
        return reply.code(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "No puedes restablecer la contraseña de un usuario con mayor privilegio.",
        });
      }
    }

    const passwordHash = await argon2Hash(body.newPassword);
    await req.tenantPrisma.usuario.update({
      where: { id: params.id },
      data: { passwordHash },
    });
    return reply.code(204).send();
  });
};

export default usuariosRoutes;
