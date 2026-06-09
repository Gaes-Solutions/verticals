import { PERMISSIONS, listPermissionsByCategory } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import { rolCreateSchema, rolIdParamSchema, rolUpdateSchema } from "./schemas.js";

const rolesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.ROLES_LEER);
    const items = await req.tenantPrisma.rol.findMany({
      orderBy: [{ isPreset: "desc" }, { codigo: "asc" }],
    });
    return items;
  });

  // Catálogo de permisos disponibles, agrupado por categoría y FILTRADO por la
  // vertical del negocio (un retail no ve permisos de clínica/Doctoralia, etc.).
  app.get("/catalogo-permisos", async (req) => {
    req.requirePerm(PERMISSIONS.ROLES_LEER);
    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: req.tenantSlug },
      select: { vertical: true },
    });
    return listPermissionsByCategory(tenant?.vertical ?? undefined);
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ROLES_LEER);
    const params = rolIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.rol.findUnique({ where: { id: params.id } });
    if (!item) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Rol no encontrado",
      });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ROLES_CREAR);
    const body = rolCreateSchema.parse(req.body);
    const created = await req.tenantPrisma.rol.create({
      data: {
        codigo: body.codigo,
        nombre: body.nombre,
        ...(body.descripcion !== undefined ? { descripcion: body.descripcion } : {}),
        permisos: body.permisos,
        isPreset: false,
      },
    });
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ROLES_ACTUALIZAR);
    const params = rolIdParamSchema.parse(req.params);
    const body = rolUpdateSchema.parse(req.body);
    const existing = await req.tenantPrisma.rol.findUnique({ where: { id: params.id } });
    if (!existing) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Rol no encontrado",
      });
    }
    if (existing.isPreset) {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Los roles preset son de sólo lectura. Crea un rol custom para personalizar.",
      });
    }
    const updated = await req.tenantPrisma.rol.update({
      where: { id: params.id },
      data: stripUndefined(body) as Parameters<typeof req.tenantPrisma.rol.update>[0]["data"],
    });
    return updated;
  });

  app.delete("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ROLES_ARCHIVAR);
    const params = rolIdParamSchema.parse(req.params);
    const existing = await req.tenantPrisma.rol.findUnique({ where: { id: params.id } });
    if (!existing) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Rol no encontrado",
      });
    }
    if (existing.isPreset) {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Los roles preset no se pueden archivar.",
      });
    }
    const archived = await req.tenantPrisma.rol.update({
      where: { id: params.id },
      data: { isActive: false },
    });
    return archived;
  });
};

export default rolesRoutes;
