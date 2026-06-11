import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../lib/audit.js";

const DIA_MS = 24 * 60 * 60 * 1000;

const invoicesQuery = z.object({
  status: z.enum(["draft", "open", "paid", "void", "uncollectible"]).optional(),
  tenantId: z.string().optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(100))
    .default(50),
});

const subsQuery = z.object({
  status: z.enum(["trialing", "active", "past_due", "canceled", "paused", "unpaid"]).optional(),
});

const voidSchema = z.object({ motivo: z.string().min(3).max(300) });

/** Operación de cobranza global (estilo Stripe Dashboard interno). */
const adminBillingOpsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  app.get("/overview", async () => {
    const master = app.masterPrisma;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const [ingresosHoy, fallidosAbiertos, renovaciones48h, suspendidos, reintentosPendientes] =
      await Promise.all([
        master.invoicePayment.aggregate({
          where: { status: "succeeded", createdAt: { gte: hoy } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        master.invoice.count({ where: { status: "open", attempts: { gt: 0 } } }),
        master.subscription.count({
          where: {
            status: "active",
            currentPeriodEnd: { gte: hoy, lte: new Date(hoy.getTime() + 2 * DIA_MS) },
          },
        }),
        master.tenant.count({ where: { status: "suspended" } }),
        master.invoice.count({ where: { status: "open", nextRetryAt: { not: null } } }),
      ]);

    return {
      ingresosHoy: (ingresosHoy._sum.amount ?? 0) / 100,
      pagosHoy: ingresosHoy._count._all,
      facturasConFallos: fallidosAbiertos,
      renovacionesProximas48h: renovaciones48h,
      tenantsSuspendidos: suspendidos,
      reintentosPendientes,
    };
  });

  app.get("/invoices", async (req) => {
    const q = invoicesQuery.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.tenantId) where.tenantId = q.tenantId;
    const [total, items] = await Promise.all([
      app.masterPrisma.invoice.count({ where }),
      app.masterPrisma.invoice.findMany({
        where,
        include: { tenant: { select: { slug: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/subscriptions", async (req) => {
    const q = subsQuery.parse(req.query);
    return app.masterPrisma.subscription.findMany({
      where: q.status ? { status: q.status } : {},
      include: {
        tenant: { select: { slug: true, name: true, status: true } },
        plan: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  });

  // Write-off: anula una factura incobrable (con motivo, queda en audit).
  app.post("/invoices/:id/void", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const { motivo } = voidSchema.parse(req.body);
    const invoice = await app.masterPrisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Factura no encontrada" });
    }
    if (invoice.status === "paid" || invoice.status === "void") {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: `Factura en estado ${invoice.status}, no se puede anular`,
      });
    }
    const updated = await app.masterPrisma.invoice.update({
      where: { id },
      data: { status: "void", nextRetryAt: null },
    });
    await writeAudit(app.masterPrisma, {
      actor: req.user.kind === "admin" ? req.user.email : "?",
      action: "billing.invoice_void",
      resource: "invoice",
      resourceId: id,
      metadata: { motivo, invoiceNumber: invoice.invoiceNumber, total: invoice.total },
      ipAddress: req.ip,
    });
    return updated;
  });
};

export default adminBillingOpsRoutes;
