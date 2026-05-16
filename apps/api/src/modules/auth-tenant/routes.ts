import { getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync } from "fastify";
import { tenantLoginBodySchema } from "./schemas.js";
import {
  buildTenantPrincipal,
  findTenantBySlug,
  loadTenantUserForLogin,
  updateLastLogin,
  verifyPassword,
} from "./service.js";

const authTenantRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/login",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const body = tenantLoginBodySchema.parse(req.body);

      const tenant = await findTenantBySlug(body.tenantSlug, app.masterPrisma);
      if (!tenant || tenant.status === "cancelled") {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Credenciales inválidas",
        });
      }

      const tenantPrisma = getTenantClient(body.tenantSlug);
      const user = await loadTenantUserForLogin(body.email, tenantPrisma);
      if (!user || !user.isActive) {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Credenciales inválidas",
        });
      }

      const passwordOk = await verifyPassword(body.password, user.passwordHash);
      if (!passwordOk) {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Credenciales inválidas",
        });
      }

      const principal = buildTenantPrincipal(user, body.tenantSlug);
      await updateLastLogin(body.tenantSlug, user.id, body.sucursalId);

      const accessToken = await reply.jwtSign({
        sub: principal.id,
        email: principal.email,
        tenantSlug: principal.tenantSlug,
        permissions: principal.isOwner ? ["*"] : principal.permissions,
        kind: "tenant",
      });

      return {
        accessToken,
        user: {
          id: principal.id,
          email: principal.email,
          nombre: principal.nombre,
          apellidos: principal.apellidos,
          tipoUsuario: principal.tipoUsuario,
          isOwner: principal.isOwner,
          roleCodes: principal.roleCodes,
          permissions: principal.isOwner ? ["*"] : principal.permissions,
        },
        tenant: {
          slug: tenant.slug,
        },
      };
    },
  );

  app.get(
    "/me",
    {
      preHandler: app.authenticateTenant,
    },
    async (req, reply) => {
      if (req.user.kind !== "tenant") {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Token inválido",
        });
      }
      const tenantPrisma = getTenantClient(req.user.tenantSlug);
      const user = await tenantPrisma.usuario.findUnique({
        where: { id: req.user.sub },
        include: {
          roles: { include: { rol: true } },
        },
      });
      if (!user || !user.isActive) {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Usuario no encontrado o inactivo",
        });
      }
      const principal = buildTenantPrincipal(
        {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          apellidos: user.apellidos,
          tipoUsuario: user.tipoUsuario,
          passwordHash: user.passwordHash,
          isActive: user.isActive,
          roles: user.roles.map((r) => ({ codigo: r.rol.codigo, permisos: r.rol.permisos })),
        },
        req.user.tenantSlug,
      );
      return {
        id: principal.id,
        email: principal.email,
        nombre: principal.nombre,
        apellidos: principal.apellidos,
        tipoUsuario: principal.tipoUsuario,
        isOwner: principal.isOwner,
        tenantSlug: principal.tenantSlug,
        roleCodes: principal.roleCodes,
        permissions: principal.isOwner ? ["*"] : principal.permissions,
      };
    },
  );
};

export default authTenantRoutes;
