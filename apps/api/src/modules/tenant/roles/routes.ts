import {
  type AreaNegocio,
  PERMISSIONS,
  PRESET_ROLES_RETAIL,
  areaAppliesToVertical,
  listPermissionsByArea,
} from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import { rolCreateSchema, rolIdParamSchema, rolUpdateSchema } from "./schemas.js";

// Área de negocio de cada rol preset (para agruparlos como plantillas).
const PRESET_ROLE_AREA: Record<string, AreaNegocio> = {
  dueno: "general",
  gerente: "general",
  contador_interno: "general",
  cajero: "tienda",
  vendedor: "tienda",
  almacen: "tienda",
  medico: "salud",
  enfermera: "salud",
  recepcion: "salud",
};

const rolesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.ROLES_LEER);
    const items = await req.tenantPrisma.rol.findMany({
      orderBy: [{ isPreset: "desc" }, { codigo: "asc" }],
    });
    return items;
  });

  // Catálogo de permisos del dueño: SOLO los de su vertical (general + su área).
  // El mezclado entre verticales es exclusivo del superadmin (roles predefinidos).
  app.get("/catalogo-permisos", async (req) => {
    req.requirePerm(PERMISSIONS.ROLES_LEER);
    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: req.tenantSlug },
      select: { vertical: true },
    });
    const areas = listPermissionsByArea(tenant?.vertical ?? undefined).filter((a) => a.aplica);
    return { verticalActual: tenant?.vertical ?? null, areas };
  });

  // Plantillas para que el dueño arranque un rol custom: SOLO las de su vertical
  // (general + su área). Excluye el wildcard (dueño = acceso total).
  app.get("/plantillas", async (req) => {
    req.requirePerm(PERMISSIONS.ROLES_LEER);
    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: req.tenantSlug },
      select: { vertical: true },
    });
    const vertical = tenant?.vertical ?? undefined;
    return PRESET_ROLES_RETAIL.filter((r) => {
      if ((r.permisos as readonly string[]).includes("*")) return false;
      return areaAppliesToVertical(PRESET_ROLE_AREA[r.codigo] ?? "general", vertical);
    }).map((r) => ({
      codigo: r.codigo,
      nombre: r.nombre,
      descripcion: r.descripcion ?? null,
      area: PRESET_ROLE_AREA[r.codigo] ?? "general",
      permisos: r.permisos,
    }));
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
