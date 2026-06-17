import type { Prisma, TenantPrismaClient } from "@gaespos/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const jsonObj = z.record(z.string(), z.unknown());
const asJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

const crearSchema = z.object({
  recurso: z.string().min(1).max(60),
  nombre: z.string().min(1).max(120),
  filtros: jsonObj.optional(),
  ordenamiento: jsonObj.optional(),
  columnasVisibles: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
  esCompartida: z.boolean().optional(),
});

const editarSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  filtros: jsonObj.optional(),
  ordenamiento: jsonObj.optional(),
  columnasVisibles: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
  esCompartida: z.boolean().optional(),
});

const idParam = z.object({ id: z.string().min(1) });
const listQuery = z.object({ recurso: z.string().min(1).max(60).optional() });

/**
 * Vistas guardadas (atajos personalizables): filtros/orden/columnas que cada
 * usuario guarda por recurso (ej. "ventas del mes", "bajo stock"). Cada quien
 * gestiona las suyas; las marcadas `esCompartida` las ve todo el equipo (solo
 * lectura para quien no es su dueño).
 */
const vistasGuardadasRoutes: FastifyPluginAsync = async (app) => {
  /** Al marcar una vista como default, quita el default de las demás del mismo recurso/usuario. */
  async function limpiarOtrosDefault(
    prisma: TenantPrismaClient,
    usuarioId: string,
    recurso: string,
    exceptoId: string,
  ): Promise<void> {
    await prisma.usuarioVistaGuardada.updateMany({
      where: { usuarioId, recurso, isDefault: true, id: { not: exceptoId } },
      data: { isDefault: false },
    });
  }

  app.get("/", async (req) => {
    const { recurso } = listQuery.parse(req.query);
    const usuarioId = req.principal.userId;
    return req.tenantPrisma.usuarioVistaGuardada.findMany({
      where: {
        ...(recurso ? { recurso } : {}),
        OR: [{ usuarioId }, { esCompartida: true }],
      },
      orderBy: [{ isDefault: "desc" }, { nombre: "asc" }],
    });
  });

  app.post("/", async (req, reply) => {
    const body = crearSchema.parse(req.body);
    const usuarioId = req.principal.userId;
    const creada = await req.tenantPrisma.usuarioVistaGuardada.create({
      data: {
        usuarioId,
        recurso: body.recurso,
        nombre: body.nombre,
        ...(body.filtros !== undefined ? { filtros: asJson(body.filtros) } : {}),
        ...(body.ordenamiento !== undefined ? { ordenamiento: asJson(body.ordenamiento) } : {}),
        ...(body.columnasVisibles !== undefined ? { columnasVisibles: body.columnasVisibles } : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        ...(body.esCompartida !== undefined ? { esCompartida: body.esCompartida } : {}),
      },
    });
    if (creada.isDefault) {
      await limpiarOtrosDefault(req.tenantPrisma, usuarioId, creada.recurso, creada.id);
    }
    return reply.code(201).send(creada);
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = editarSchema.parse(req.body);
    const existente = await req.tenantPrisma.usuarioVistaGuardada.findUnique({ where: { id } });
    if (!existente || existente.usuarioId !== req.principal.userId) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Vista no encontrada" });
    }
    const actualizada = await req.tenantPrisma.usuarioVistaGuardada.update({
      where: { id },
      data: {
        ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
        ...(body.filtros !== undefined ? { filtros: asJson(body.filtros) } : {}),
        ...(body.ordenamiento !== undefined ? { ordenamiento: asJson(body.ordenamiento) } : {}),
        ...(body.columnasVisibles !== undefined ? { columnasVisibles: body.columnasVisibles } : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        ...(body.esCompartida !== undefined ? { esCompartida: body.esCompartida } : {}),
      },
    });
    if (actualizada.isDefault) {
      await limpiarOtrosDefault(
        req.tenantPrisma,
        actualizada.usuarioId,
        actualizada.recurso,
        actualizada.id,
      );
    }
    return actualizada;
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const existente = await req.tenantPrisma.usuarioVistaGuardada.findUnique({ where: { id } });
    if (!existente || existente.usuarioId !== req.principal.userId) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Vista no encontrada" });
    }
    await req.tenantPrisma.usuarioVistaGuardada.delete({ where: { id } });
    return { ok: true };
  });
};

export default vistasGuardadasRoutes;
