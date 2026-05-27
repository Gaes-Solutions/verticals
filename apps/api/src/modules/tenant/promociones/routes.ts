import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  promocionCreateSchema,
  promocionIdParamSchema,
  promocionListQuerySchema,
  promocionUpdateSchema,
} from "./schemas.js";

const promocionesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.PROMOCIONES_GESTIONAR);
    const q = promocionListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.tipo) where.tipo = q.tipo;
    return req.tenantPrisma.promocion.findMany({
      where,
      include: { productos: true, _count: { select: { aplicaciones: true } } },
      orderBy: [{ prioridad: "asc" }, { createdAt: "desc" }],
    });
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PROMOCIONES_GESTIONAR);
    const { id } = promocionIdParamSchema.parse(req.params);
    const promo = await req.tenantPrisma.promocion.findUnique({
      where: { id },
      include: { productos: true, aplicaciones: { take: 50, orderBy: { createdAt: "desc" } } },
    });
    if (!promo) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Promoción no encontrada" });
    }
    return promo;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PROMOCIONES_GESTIONAR);
    const body = promocionCreateSchema.parse(req.body);
    try {
      const promo = await req.tenantPrisma.promocion.create({
        data: {
          nombre: body.nombre,
          ...(body.descripcion ? { descripcion: body.descripcion } : {}),
          tipo: body.tipo,
          acciones: body.acciones as object,
          condiciones: body.condiciones as object,
          vigenciaInicio: new Date(body.vigenciaInicio),
          ...(body.vigenciaFin ? { vigenciaFin: new Date(body.vigenciaFin) } : {}),
          ...(body.horarios ? { horarios: body.horarios as object } : {}),
          canales: body.canales,
          sucursalesAplicables: body.sucursalesAplicables,
          stackConOtras: body.stackConOtras,
          prioridad: body.prioridad,
          ...(body.limiteUsosTotal ? { limiteUsosTotal: body.limiteUsosTotal } : {}),
          ...(body.limiteUsosCliente ? { limiteUsosCliente: body.limiteUsosCliente } : {}),
          requiereCodigo: body.requiereCodigo,
          ...(body.codigo ? { codigo: body.codigo } : {}),
          status: "draft",
          ...(body.productos
            ? {
                productos: {
                  create: body.productos.map((p) => ({ productoId: p.productoId, rol: p.rol })),
                },
              }
            : {}),
        },
        include: { productos: true },
      });
      return reply.code(201).send(promo);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unique constraint")) {
        return reply
          .code(409)
          .send({ statusCode: 409, error: "Conflict", message: "Código de promoción duplicado" });
      }
      throw err;
    }
  });

  app.patch("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.PROMOCIONES_GESTIONAR);
    const { id } = promocionIdParamSchema.parse(req.params);
    const body = promocionUpdateSchema.parse(req.body);
    return req.tenantPrisma.promocion.update({
      where: { id },
      data: {
        ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
        ...(body.descripcion !== undefined ? { descripcion: body.descripcion } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.vigenciaFin ? { vigenciaFin: new Date(body.vigenciaFin) } : {}),
        ...(body.prioridad !== undefined ? { prioridad: body.prioridad } : {}),
        ...(body.stackConOtras !== undefined ? { stackConOtras: body.stackConOtras } : {}),
      },
    });
  });

  app.post("/:id/activar", async (req) => {
    req.requirePerm(PERMISSIONS.PROMOCIONES_GESTIONAR);
    const { id } = promocionIdParamSchema.parse(req.params);
    return req.tenantPrisma.promocion.update({ where: { id }, data: { status: "activa" } });
  });

  app.post("/:id/pausar", async (req) => {
    req.requirePerm(PERMISSIONS.PROMOCIONES_GESTIONAR);
    const { id } = promocionIdParamSchema.parse(req.params);
    return req.tenantPrisma.promocion.update({ where: { id }, data: { status: "pausada" } });
  });
};

export default promocionesRoutes;
