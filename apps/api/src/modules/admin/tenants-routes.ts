import { onboardTenant } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../lib/audit.js";

const VERTICALES = [
  "retail_mayoreo",
  "abarrotes",
  "salud_vet",
  "salud_humana",
  "despacho_contable",
  "otro",
] as const;

const crearSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/, "Slug: 3-40 caracteres [a-z 0-9 -]"),
  name: z.string().min(2).max(120),
  planCode: z.string().min(2).max(40),
  vertical: z.enum(VERTICALES).optional(),
  ownerEmail: z.string().email().toLowerCase(),
  ownerNombre: z.string().min(2).max(120).optional(),
  ownerPassword: z.string().min(8).max(200).optional(),
});

/**
 * Alta y listado de clientes (tenants) desde el panel de plataforma. Crear hace
 * el onboarding completo (schema + migraciones + defaults + usuario dueño listo
 * para entrar a web-admin). Solo rol superadmin puede crear.
 */
function errLabel(code: number): string {
  if (code === 409) return "Conflict";
  if (code === 400) return "Bad Request";
  return "Error";
}

const adminTenantsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  function requireSuperadmin(req: FastifyRequest, reply: FastifyReply): boolean {
    if (req.user.kind === "admin" && req.user.role === "superadmin") return true;
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Solo un superadmin puede dar de alta clientes",
    });
    return false;
  }

  function actorDe(req: FastifyRequest): string {
    return req.user.kind === "admin" ? req.user.email : "?";
  }

  app.get("/", async () => {
    const tenants = await app.masterPrisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: { plan: { select: { code: true, name: true } } },
    });
    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      plan: t.plan.code,
      planNombre: t.plan.name,
      vertical: t.vertical,
      trialEndsAt: t.trialEndsAt,
      createdAt: t.createdAt,
    }));
  });

  app.get("/planes", async () => {
    const planes = await app.masterPrisma.plan.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { code: true, name: true },
    });
    return planes;
  });

  async function validarAlta(
    body: z.infer<typeof crearSchema>,
  ): Promise<{ code: number; message: string } | null> {
    const existente = await app.masterPrisma.tenant.findUnique({ where: { slug: body.slug } });
    if (existente) return { code: 409, message: "Ya existe un cliente con ese slug" };
    const plan = await app.masterPrisma.plan.findUnique({ where: { code: body.planCode } });
    if (!plan || !plan.active) return { code: 400, message: "Plan no encontrado o inactivo" };
    return null;
  }

  app.post("/", async (req, reply) => {
    if (!requireSuperadmin(req, reply)) return;
    const body = crearSchema.parse(req.body);

    const problema = await validarAlta(body);
    if (problema) {
      return reply.code(problema.code).send({
        statusCode: problema.code,
        error: errLabel(problema.code),
        message: problema.message,
      });
    }

    try {
      const result = await onboardTenant({
        slug: body.slug,
        name: body.name,
        planCode: body.planCode,
        ownerEmail: body.ownerEmail,
        ...(body.vertical ? { vertical: body.vertical } : {}),
        ...(body.ownerNombre ? { ownerNombre: body.ownerNombre } : {}),
        ...(body.ownerPassword ? { ownerPassword: body.ownerPassword } : {}),
      });
      await writeAudit(app.masterPrisma, {
        actor: actorDe(req),
        action: "tenant.onboarded",
        resource: "tenant",
        resourceId: result.slug,
        metadata: { name: body.name, plan: body.planCode, ownerEmail: body.ownerEmail },
        ipAddress: req.ip,
      });
      return reply.code(201).send({
        slug: result.slug,
        name: body.name,
        ownerEmail: result.ownerEmail,
        ownerPassword: result.ownerPassword ?? body.ownerPassword ?? null,
        passwordGenerada: result.ownerPassword !== null,
      });
    } catch (err) {
      req.log.error({ err }, "fallo onboarding de tenant");
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal",
        message: err instanceof Error ? err.message : "No se pudo crear el cliente",
      });
    }
  });
};

export default adminTenantsRoutes;
