import { propagarEliminacionPlantilla, propagarPlantilla } from "@gaespos/db";
import { isKnownPermission, listPermissionsByArea } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../lib/audit.js";

const VERTICALES: { value: string; label: string }[] = [
  { value: "todas", label: "Todas (universal)" },
  { value: "retail_mayoreo", label: "Tienda / Retail / Mayoreo" },
  { value: "abarrotes", label: "Abarrotes" },
  { value: "salud_vet", label: "Veterinaria" },
  { value: "salud_humana", label: "Salud humana / Consultorio" },
  { value: "despacho_contable", label: "Despacho contable" },
  { value: "otro", label: "Otro" },
];
const VERTICAL_VALUES = VERTICALES.map((v) => v.value);

const permisoSchema = z.string().refine((p) => p === "*" || isKnownPermission(p), {
  message: "Permiso desconocido",
});

const crearSchema = z.object({
  vertical: z.enum(VERTICAL_VALUES as [string, ...string[]]),
  codigo: z.string().regex(/^[a-z][a-z0-9_-]{1,49}$/, "Código inválido (a-z, 0-9, _-)"),
  nombre: z.string().min(2).max(120),
  descripcion: z.string().max(300).optional(),
  permisos: z.array(permisoSchema).max(300),
});

const editarSchema = z.object({
  nombre: z.string().min(2).max(120).optional(),
  descripcion: z.string().max(300).nullable().optional(),
  permisos: z.array(permisoSchema).max(300).optional(),
  activo: z.boolean().optional(),
});

const idParam = z.object({ id: z.string().min(1) });

/** Roles predefinidos gobernados por el superadmin, por vertical. Vínculo vivo. */
const adminRolesPlantillaRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  function requireSuperadmin(req: FastifyRequest, reply: FastifyReply): boolean {
    if (req.user.kind === "admin" && req.user.role === "superadmin") return true;
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Solo un superadmin puede gestionar los roles predefinidos",
    });
    return false;
  }

  function actorDe(req: FastifyRequest): string {
    return req.user.kind === "admin" ? req.user.email : "?";
  }

  app.get("/verticales", async () => VERTICALES);

  app.get("/catalogo-permisos", async () => listPermissionsByArea());

  app.get("/", async (req) => {
    const query = z.object({ vertical: z.string().optional() }).parse(req.query);
    return app.masterPrisma.rolePlantilla.findMany({
      where: query.vertical ? { vertical: query.vertical } : {},
      orderBy: [{ vertical: "asc" }, { codigo: "asc" }],
    });
  });

  app.post("/", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const body = crearSchema.parse(req.body);
    const existente = await app.masterPrisma.rolePlantilla.findUnique({
      where: { vertical_codigo: { vertical: body.vertical, codigo: body.codigo } },
    });
    if (existente) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "Ya existe un rol con ese código en esa vertical",
      });
    }
    const creada = await app.masterPrisma.rolePlantilla.create({
      data: {
        vertical: body.vertical,
        codigo: body.codigo,
        nombre: body.nombre,
        descripcion: body.descripcion ?? null,
        permisos: body.permisos,
      },
    });
    const afectados = await propagarPlantilla(creada);
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "role_plantilla.created",
      resource: "role_plantilla",
      resourceId: creada.id,
      metadata: { vertical: creada.vertical, codigo: creada.codigo, tenantsAfectados: afectados },
      ipAddress: req.ip,
    });
    return reply.code(201).send({ ...creada, tenantsAfectados: afectados });
  });

  app.patch("/:id", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const body = editarSchema.parse(req.body);
    const existente = await app.masterPrisma.rolePlantilla.findUnique({ where: { id } });
    if (!existente) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Plantilla no encontrada" });
    }
    const actualizada = await app.masterPrisma.rolePlantilla.update({
      where: { id },
      data: {
        ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
        ...(body.descripcion !== undefined ? { descripcion: body.descripcion } : {}),
        ...(body.permisos !== undefined ? { permisos: body.permisos } : {}),
        ...(body.activo !== undefined ? { activo: body.activo } : {}),
      },
    });
    const afectados = await propagarPlantilla(actualizada);
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "role_plantilla.updated",
      resource: "role_plantilla",
      resourceId: id,
      metadata: { codigo: actualizada.codigo, tenantsAfectados: afectados },
      ipAddress: req.ip,
    });
    return { ...actualizada, tenantsAfectados: afectados };
  });

  app.delete("/:id", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const { id } = idParam.parse(req.params);
    const existente = await app.masterPrisma.rolePlantilla.findUnique({ where: { id } });
    if (!existente) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Plantilla no encontrada" });
    }
    await propagarEliminacionPlantilla(existente.vertical, existente.codigo);
    await app.masterPrisma.rolePlantilla.delete({ where: { id } });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "role_plantilla.deleted",
      resource: "role_plantilla",
      resourceId: id,
      metadata: { vertical: existente.vertical, codigo: existente.codigo },
      ipAddress: req.ip,
    });
    return { ok: true };
  });
};

export default adminRolesPlantillaRoutes;
