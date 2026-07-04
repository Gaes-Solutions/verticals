import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  VisitaError,
  agregarFoto,
  cancelarVisita,
  cerrarVisita,
  checkinVisita,
  cierreDia,
} from "./service.js";

const idParamSchema = z.object({ id: z.string().cuid() });

const listQuerySchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  vendedorId: z.string().cuid().optional(),
  clienteB2bId: z.string().cuid().optional(),
  estado: z.enum(["planeada", "hecha", "cancelada"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const crearSchema = z.object({
  clienteB2bId: z.string().cuid(),
  tipo: z.enum(["visita", "llamada"]).default("visita"),
  fechaPlaneada: z.string().datetime(),
  notas: z.string().max(2000).optional(),
});

const checkinSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const cerrarSchema = z.object({
  resultado: z.string().max(2000).optional(),
  notas: z.string().max(2000).optional(),
  duracionLlamadaSeg: z.number().int().min(0).max(86_400).optional(),
});

const cancelarSchema = z.object({ motivoNoVisita: z.string().min(1).max(500) });

const fotoSchema = z.object({
  dataUrl: z.string().startsWith("data:image/").max(200_000),
  etiqueta: z.enum(["anaquel", "fachada", "exhibidor", "otro"]).optional(),
});

const cierreDiaQuerySchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  vendedorId: z.string().cuid().optional(),
});

function handleErr<T>(
  reply: { code: (n: number) => { send: (b: unknown) => T } },
  err: unknown,
): T | null {
  if (err instanceof VisitaError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
    });
  }
  return null;
}

function puedeVerTodas(req: {
  principal: { isOwner?: boolean; permissions: readonly string[] };
}): boolean {
  return (
    req.principal.isOwner || req.principal.permissions.includes(PERMISSIONS.COMISIONES_LEER_TODAS)
  );
}

const visitasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.VISITAS_LEER);
    const q = listQuerySchema.parse(req.query);
    const vendedorId = puedeVerTodas(req) ? q.vendedorId : req.principal.userId;
    const where: Record<string, unknown> = {
      ...(vendedorId ? { vendedorId } : {}),
      ...(q.clienteB2bId ? { clienteB2bId: q.clienteB2bId } : {}),
      ...(q.estado ? { estado: q.estado } : {}),
    };
    if (q.fecha) {
      const inicio = new Date(`${q.fecha}T00:00:00`);
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 1);
      where.fechaPlaneada = { gte: inicio, lt: fin };
    }
    const [total, items] = await Promise.all([
      req.tenantPrisma.visita.count({ where }),
      req.tenantPrisma.visita.findMany({
        where,
        include: {
          clienteB2b: {
            select: { id: true, razonSocial: true, nombreComercial: true, telefonoPrincipal: true },
          },
          vendedor: { select: { id: true, nombre: true } },
          fotos: { select: { id: true, etiqueta: true, createdAt: true } },
        },
        orderBy: { fechaPlaneada: "asc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VISITAS_GESTIONAR);
    const body = crearSchema.parse(req.body);
    const cliente = await req.tenantPrisma.clienteB2b.findUnique({
      where: { id: body.clienteB2bId },
      select: { id: true },
    });
    if (!cliente) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cliente B2B no encontrado" });
    }
    const visita = await req.tenantPrisma.visita.create({
      data: {
        vendedorId: req.principal.userId,
        clienteB2bId: body.clienteB2bId,
        tipo: body.tipo,
        fechaPlaneada: new Date(body.fechaPlaneada),
        ...(body.notas ? { notas: body.notas } : {}),
      },
    });
    return reply.code(201).send(visita);
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VISITAS_LEER);
    const { id } = idParamSchema.parse(req.params);
    const visita = await req.tenantPrisma.visita.findUnique({
      where: { id },
      include: {
        clienteB2b: { select: { id: true, razonSocial: true, nombreComercial: true } },
        vendedor: { select: { id: true, nombre: true } },
        fotos: true,
      },
    });
    if (!visita) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Visita no encontrada" });
    }
    if (!puedeVerTodas(req) && visita.vendedorId !== req.principal.userId) {
      return reply
        .code(403)
        .send({ statusCode: 403, error: "Forbidden", message: "Visita de otro vendedor" });
    }
    return visita;
  });

  app.post("/:id/checkin", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VISITAS_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    const body = checkinSchema.parse(req.body ?? {});
    try {
      return await checkinVisita(req.tenantPrisma, {
        id,
        vendedorId: req.principal.userId,
        ...(body.lat !== undefined ? { lat: body.lat } : {}),
        ...(body.lng !== undefined ? { lng: body.lng } : {}),
      });
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/cerrar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VISITAS_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    const body = cerrarSchema.parse(req.body ?? {});
    try {
      return await cerrarVisita(req.tenantPrisma, {
        id,
        vendedorId: req.principal.userId,
        ...(body.resultado !== undefined ? { resultado: body.resultado } : {}),
        ...(body.notas !== undefined ? { notas: body.notas } : {}),
        ...(body.duracionLlamadaSeg !== undefined
          ? { duracionLlamadaSeg: body.duracionLlamadaSeg }
          : {}),
      });
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VISITAS_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    const body = cancelarSchema.parse(req.body);
    try {
      return await cancelarVisita(req.tenantPrisma, {
        id,
        vendedorId: req.principal.userId,
        motivoNoVisita: body.motivoNoVisita,
      });
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/fotos", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VISITAS_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    const body = fotoSchema.parse(req.body);
    try {
      const foto = await agregarFoto(req.tenantPrisma, {
        id,
        vendedorId: req.principal.userId,
        dataUrl: body.dataUrl,
        ...(body.etiqueta ? { etiqueta: body.etiqueta } : {}),
      });
      return reply.code(201).send(foto);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.get("/cierre-dia", async (req, reply) => {
    req.requirePerm(PERMISSIONS.VISITAS_LEER);
    const q = cierreDiaQuerySchema.parse(req.query);
    let vendedorId = req.principal.userId;
    if (q.vendedorId && q.vendedorId !== req.principal.userId) {
      if (!puedeVerTodas(req)) {
        return reply
          .code(403)
          .send({ statusCode: 403, error: "Forbidden", message: "Cierre de otro vendedor" });
      }
      vendedorId = q.vendedorId;
    }
    const fecha = q.fecha ? new Date(`${q.fecha}T12:00:00`) : new Date();
    return cierreDia(req.tenantPrisma, vendedorId, fecha);
  });
};

export default visitasRoutes;
