import { type TenantPrismaClient, getTenantClient } from "@gaespos/db";
import {
  type PermissionCode,
  PermissionDeniedError,
  type PermissionPrincipal,
  hasAnyPermission,
  hasPermission,
} from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    tenantPrisma: TenantPrismaClient;
    tenantSlug: string;
    principal: PermissionPrincipal;
    requirePerm: (perm: PermissionCode | PermissionCode[]) => void;
    requireAnyPerm: (perms: PermissionCode[]) => void;
  }
}

const tenantContextPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch (_err) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Token inválido o expirado",
      });
    }
    if (req.user.kind !== "tenant") {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Se requiere sesión de usuario de tenant",
      });
    }

    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: req.user.tenantSlug },
    });
    if (!tenant || tenant.status === "cancelled") {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Tenant inactivo o no encontrado",
      });
    }

    const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const isOwner = permissions.length === 1 && permissions[0] === "*";

    req.tenantSlug = req.user.tenantSlug;
    req.tenantPrisma = getTenantClient(req.user.tenantSlug);
    req.principal = {
      permissions,
      isOwner,
    };
    req.requirePerm = (perm) => {
      if (!hasPermission(req.principal, perm)) {
        throw new PermissionDeniedError(Array.isArray(perm) ? perm : [perm]);
      }
    };
    req.requireAnyPerm = (perms) => {
      if (!hasAnyPermission(req.principal, perms)) {
        throw new PermissionDeniedError(perms);
      }
    };
  });
};

export default fp(tenantContextPlugin, { name: "tenant-context", dependencies: ["auth"] });
