import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { clientesDeSegmento, recalcularRfm } from "./service.js";

const idParam = z.object({ id: z.string().min(1) });
const crearSchema = z.object({
  nombre: z.string().min(1).max(160),
  descripcion: z.string().max(500).optional(),
  tipo: z.enum(["estatico", "dinamico_rfm", "dinamico_query"]).default("dinamico_rfm"),
  definicion: z.record(z.string(), z.unknown()).default({}),
});

const segmentosRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.SEGMENTOS_GESTIONAR);
    return req.tenantPrisma.segmentoCliente.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.SEGMENTOS_GESTIONAR);
    const body = crearSchema.parse(req.body);
    const seg = await req.tenantPrisma.segmentoCliente.create({
      data: {
        nombre: body.nombre,
        ...(body.descripcion ? { descripcion: body.descripcion } : {}),
        tipo: body.tipo,
        definicion: body.definicion as object,
      },
    });
    return reply.code(201).send(seg);
  });

  app.get("/:id/clientes", async (req) => {
    req.requirePerm(PERMISSIONS.SEGMENTOS_GESTIONAR);
    const { id } = idParam.parse(req.params);
    const clienteIds = await clientesDeSegmento(req.tenantPrisma, id);
    return { total: clienteIds.length, clienteIds };
  });

  app.post("/recalcular-rfm", async (req) => {
    req.requirePerm(PERMISSIONS.SEGMENTOS_GESTIONAR);
    return recalcularRfm(req.tenantPrisma);
  });

  app.get("/rfm/metricas", async (req) => {
    req.requirePerm(PERMISSIONS.SEGMENTOS_GESTIONAR);
    const q = req.query as { segmento?: string };
    const where: Record<string, unknown> = {};
    if (q.segmento) where.segmentoRfmCalculado = q.segmento;
    return req.tenantPrisma.clienteMetricasRfm.findMany({
      where,
      include: { cliente: { select: { id: true, nombre: true, apellidos: true } } },
      orderBy: { monetary: "desc" },
      take: 200,
    });
  });
};

export default segmentosRoutes;
