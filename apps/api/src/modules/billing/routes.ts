import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  changePlanSchema,
  couponApplySchema,
  loginAdminTenantSchema,
  paymentMethodSchema,
  signupSchema,
  webhookSchema,
} from "./schemas.js";
import {
  BillingError,
  agregarPaymentMethod,
  aplicarCuponASubscripcion,
  cambiarPlan,
  correrDunningCiclo,
  correrTrialConversions,
  getBillingContext,
  listInvoices,
  loginAdminTenant,
  procesarWebhookPagoMock,
  setMockChargeFailures,
  signupPublico,
} from "./service.js";

function errLabel(s: number): string {
  if (s >= 500) return "Internal";
  if (s === 404) return "Not Found";
  if (s === 409) return "Conflict";
  if (s === 403) return "Forbidden";
  if (s === 401) return "Unauthorized";
  return "Bad Request";
}

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof BillingError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: errLabel(err.statusCode),
      message: err.message,
      ...(err.extra ?? {}),
    });
    return true;
  }
  return false;
}

function tenantIdFrom(req: FastifyRequest): string {
  if (req.user.kind !== "admin_tenant") {
    throw new BillingError(401, "Sesión de admin del tenant requerida");
  }
  return req.user.tenantId;
}

/**
 * Rutas públicas: signup self-serve + login admin tenant.
 */
export const billingPublicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/auth/plans", async () => {
    const plans = await app.masterPrisma.plan.findMany({
      where: { isPublic: true },
      orderBy: { tierOrder: "asc" },
      select: { id: true, code: true, name: true, priceCents: true, currency: true },
    });
    return plans;
  });

  app.post(
    "/auth/signup",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = signupSchema.parse(req.body);
      try {
        const result = await signupPublico(app.masterPrisma, body);
        const accessToken = await reply.jwtSign({
          sub: result.admin.id,
          email: result.admin.email,
          tenantId: result.tenant.id,
          tenantSlug: result.tenant.slug,
          roleAdmin: result.admin.roleAdmin,
          kind: "admin_tenant",
        });
        return reply.code(201).send({
          accessToken,
          tenant: {
            id: result.tenant.id,
            slug: result.tenant.slug,
            name: result.tenant.name,
            status: result.tenant.status,
            trialEndsAt: result.tenant.trialEndsAt,
            vertical: result.tenant.vertical,
            currencyDefault: result.tenant.currencyDefault,
          },
          subscription: {
            id: result.subscription.id,
            status: result.subscription.status,
            trialEnd: result.subscription.trialEnd,
          },
        });
      } catch (err) {
        if (handleErr(reply, err)) return;
        throw err;
      }
    },
  );

  app.post(
    "/auth/admin-tenant/login",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = loginAdminTenantSchema.parse(req.body);
      try {
        const principal = await loginAdminTenant(app.masterPrisma, body);
        const accessToken = await reply.jwtSign({
          sub: principal.id,
          email: principal.email,
          tenantId: principal.tenantId,
          tenantSlug: principal.tenantSlug,
          roleAdmin: principal.roleAdmin,
          kind: "admin_tenant",
        });
        return { accessToken, admin: principal };
      } catch (err) {
        if (handleErr(reply, err)) return;
        throw err;
      }
    },
  );
};

/**
 * Endpoints del admin del tenant para gestionar su cuenta SaaS.
 */
export const billingAdminTenantRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdminTenant);

  app.get("/billing/me", async (req) => getBillingContext(app.masterPrisma, tenantIdFrom(req)));

  app.get("/billing/invoices", async (req) => listInvoices(app.masterPrisma, tenantIdFrom(req)));

  app.post("/billing/payment-methods", async (req, reply) => {
    const body = paymentMethodSchema.parse(req.body);
    const pm = await agregarPaymentMethod(app.masterPrisma, tenantIdFrom(req), body);
    return reply.code(201).send(pm);
  });

  app.post("/billing/subscription/coupon", async (req, reply) => {
    const body = couponApplySchema.parse(req.body);
    try {
      return await aplicarCuponASubscripcion(app.masterPrisma, tenantIdFrom(req), body.code);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/billing/subscription/change-plan", async (req, reply) => {
    const body = changePlanSchema.parse(req.body);
    try {
      return await cambiarPlan(app.masterPrisma, tenantIdFrom(req), body.planCode);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};

/**
 * Rutas mock (sin auth: simulan webhook del proveedor real). En producción el
 * proveedor real (Stripe/Conekta) firma el payload y se verifica antes.
 */
export const billingWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/billing/webhook",
    { config: { rateLimit: { max: 100, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = webhookSchema.parse(req.body);
      try {
        return await procesarWebhookPagoMock(app.masterPrisma, body.invoiceId);
      } catch (err) {
        if (handleErr(reply, err)) return;
        throw err;
      }
    },
  );
};

/**
 * Endpoints de operación de billing — solo admin GaesSoft. Disparan los workers
 * (en producción los corre un cron BullMQ; aquí endpoint para tests/demos).
 */
export const billingAdminGaesSoftRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  app.post("/admin/billing/run-trial-conversions", async () =>
    correrTrialConversions(app.masterPrisma),
  );

  app.post("/admin/billing/run-dunning", async () => correrDunningCiclo(app.masterPrisma));

  // Solo para demos/dev: encola N fallos en el cobro mock de un payment method.
  app.post("/admin/billing/mock-set-failures", async (req) => {
    const body = z
      .object({ paymentMethodId: z.string().min(1), fails: z.number().int().min(0).max(20) })
      .parse(req.body);
    setMockChargeFailures(body.paymentMethodId, body.fails);
    return { paymentMethodId: body.paymentMethodId, fails: body.fails };
  });
};
