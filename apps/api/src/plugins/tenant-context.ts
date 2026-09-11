import { type TenantPrismaClient, getTenantClient } from "@gaespos/db";
import {
  PERMISSIONS,
  type PermissionCode,
  PermissionDeniedError,
  type PermissionPrincipal,
  hasAnyPermission,
  hasPermission,
} from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { buildTenantPrincipal, loadTenantUserById } from "../modules/auth-tenant/service.js";
import { TIENDA_WEB_EMAIL } from "../modules/storefront/tienda-web.js";

export interface TenantPrincipal extends PermissionPrincipal {
  userId: string;
  email: string;
  tenantSlug: string;
}

declare module "fastify" {
  interface FastifyRequest {
    tenantPrisma: TenantPrismaClient;
    tenantSlug: string;
    principal: TenantPrincipal;
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
    if (req.user.kind !== "tenant" && req.user.kind !== "tienda_web") {
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

    const tenantPrisma = getTenantClient(req.user.tenantSlug);
    const user = await loadTenantUserById(req.user.sub, tenantPrisma);
    // Un token de tienda solo vale para el usuario de sistema de la tienda: si
    // apunta a una persona, alguien lo fabricó.
    const esTiendaWeb = req.user.kind === "tienda_web";
    if (!user || !user.isActive || (esTiendaWeb && user.email !== TIENDA_WEB_EMAIL)) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Usuario inactivo o no encontrado",
      });
    }
    const fresh = buildTenantPrincipal(user, req.user.tenantSlug);

    req.tenantSlug = req.user.tenantSlug;
    req.tenantPrisma = tenantPrisma;
    req.principal = {
      userId: fresh.id,
      email: fresh.email,
      tenantSlug: req.user.tenantSlug,
      // La tienda solo hace lo que hace un comprador, tenga los roles que tenga.
      permissions: esTiendaWeb ? [PERMISSIONS.ECOMMERCE_TIENDA_WEB] : fresh.permissions,
      isOwner: esTiendaWeb ? false : fresh.isOwner,
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
