import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../lib/audit.js";

/**
 * Soporte: bandeja de tickets de la plataforma (GaesSoft atendiendo a sus
 * clientes). Cualquier admin (superadmin/support/billing) puede gestionar.
 */

const idParamSchema = z.object({ id: z.string().min(1) });

const crearSchema = z.object({
  subject: z.string().min(2).max(200),
  mensaje: z.string().min(1).max(5000),
  tenantSlug: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  category: z.enum(["billing", "technical", "onboarding", "account", "other"]).default("other"),
  createdByEmail: z.string().email().optional(),
});

const mensajeSchema = z.object({
  body: z.string().min(1).max(5000),
  internalNote: z.boolean().default(false),
});

const patchSchema = z.object({
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  category: z.enum(["billing", "technical", "onboarding", "account", "other"]).optional(),
  assignedToId: z.string().nullable().optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  tenantSlug: z.string().optional(),
  assignedToId: z.string().optional(),
});

function actorDe(req: FastifyRequest): string {
  return req.user.kind === "admin" ? req.user.email : "?";
}

const ticketsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  app.get("/agentes", async () => {
    return app.masterPrisma.adminUser.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    });
  });

  app.get("/", async (req) => {
    const q = listQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.priority) where.priority = q.priority;
    if (q.assignedToId) where.assignedToId = q.assignedToId;
    if (q.tenantSlug) {
      const tenant = await app.masterPrisma.tenant.findUnique({
        where: { slug: q.tenantSlug },
        select: { id: true },
      });
      where.tenantId = tenant?.id ?? "__none__";
    }
    return app.masterPrisma.supportTicket.findMany({
      where,
      orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }],
      include: {
        tenant: { select: { slug: true, name: true } },
        assignedTo: { select: { name: true, email: true } },
        _count: { select: { messages: true } },
      },
      take: 200,
    });
  });

  app.get("/:id", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const ticket = await app.masterPrisma.supportTicket.findUnique({
      where: { id },
      include: {
        tenant: { select: { slug: true, name: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Ticket no encontrado" });
    }
    return ticket;
  });

  app.post("/", async (req, reply) => {
    const body = crearSchema.parse(req.body);
    let tenantId: string | null = null;
    if (body.tenantSlug) {
      const tenant = await app.masterPrisma.tenant.findUnique({
        where: { slug: body.tenantSlug },
        select: { id: true },
      });
      if (!tenant) {
        return reply
          .code(400)
          .send({ statusCode: 400, error: "Bad Request", message: "Cliente no encontrado" });
      }
      tenantId = tenant.id;
    }
    const ticket = await app.masterPrisma.supportTicket.create({
      data: {
        subject: body.subject,
        priority: body.priority,
        category: body.category,
        createdByEmail: body.createdByEmail ?? actorDe(req),
        ...(tenantId ? { tenantId } : {}),
        messages: {
          create: {
            authorType: "admin",
            authorEmail: actorDe(req),
            body: body.mensaje,
          },
        },
      },
      include: { messages: true },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "ticket.created",
      resource: "ticket",
      resourceId: ticket.id,
      metadata: { subject: ticket.subject },
      ipAddress: req.ip,
    });
    return reply.code(201).send(ticket);
  });

  app.post("/:id/mensajes", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = mensajeSchema.parse(req.body);
    const ticket = await app.masterPrisma.supportTicket.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!ticket) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Ticket no encontrado" });
    }
    const [mensaje] = await app.masterPrisma.$transaction([
      app.masterPrisma.supportTicketMessage.create({
        data: {
          ticketId: id,
          authorType: "admin",
          authorEmail: actorDe(req),
          body: body.body,
          internalNote: body.internalNote,
        },
      }),
      app.masterPrisma.supportTicket.update({
        where: { id },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return reply.code(201).send(mensaje);
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = patchSchema.parse(req.body);
    const ticket = await app.masterPrisma.supportTicket.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!ticket) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Ticket no encontrado" });
    }
    const cerrando = body.status === "closed" || body.status === "resolved";
    const updated = await app.masterPrisma.supportTicket.update({
      where: { id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.assignedToId !== undefined ? { assignedToId: body.assignedToId } : {}),
        ...(body.status !== undefined ? { closedAt: cerrando ? new Date() : null } : {}),
      },
    });
    await writeAudit(app.masterPrisma, {
      actor: actorDe(req),
      action: "ticket.updated",
      resource: "ticket",
      resourceId: id,
      metadata: { ...(body.status ? { status: body.status } : {}) },
      ipAddress: req.ip,
    });
    return updated;
  });
};

export default ticketsRoutes;
