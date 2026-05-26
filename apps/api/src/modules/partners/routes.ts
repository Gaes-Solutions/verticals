import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  commissionAprobarSchema,
  commissionListQuerySchema,
  commissionRechazarSchema,
  linkCreateSchema,
  linkIdParamSchema,
  partnerCreateSchema,
  partnerIdParamSchema,
  partnerInvitarSchema,
  partnerUpdateSchema,
  payoutCrearSchema,
  payoutMarcarPagadoSchema,
  recalcularComisionesSchema,
  referralListQuerySchema,
  slugParamSchema,
} from "./schemas.js";
import {
  PartnerError,
  aceptarInvitacion,
  aprobarComision,
  crearInvitacion,
  crearLink,
  crearPayout,
  marcarPayoutPagado,
  recalcularComisionesPeriodo,
  recalcularNivelPartner,
  rechazarComision,
  registrarClick,
} from "./service.js";

function errLabel(s: number): string {
  if (s >= 500) return "Internal";
  if (s === 404) return "Not Found";
  if (s === 409) return "Conflict";
  return "Bad Request";
}

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof PartnerError) {
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

const partnersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticateAdmin);

  app.get("/", async (req) => {
    const q = req.query as { tipo?: string; estado?: string; nivel?: string };
    const where: Record<string, unknown> = {};
    if (q.tipo) where.tipo = q.tipo;
    if (q.estado) where.estado = q.estado;
    if (q.nivel) where.nivel = q.nivel;
    return app.masterPrisma.partner.findMany({
      where,
      include: {
        _count: { select: { referrals: true, links: true, commissions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get("/:id", async (req, reply) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    const p = await app.masterPrisma.partner.findUnique({
      where: { id },
      include: {
        branding: true,
        links: true,
        referrals: { include: { link: { select: { slug: true, nombre: true } } } },
        invitaciones: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    if (!p) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Partner no encontrado" });
    }
    return p;
  });

  app.post("/", async (req, reply) => {
    const body = partnerCreateSchema.parse(req.body);
    try {
      const partner = await app.masterPrisma.partner.create({
        data: {
          codigo: body.codigo,
          razonSocial: body.razonSocial,
          ...(body.rfc ? { rfc: body.rfc } : {}),
          emailContacto: body.emailContacto,
          ...(body.telefonoContacto ? { telefonoContacto: body.telefonoContacto } : {}),
          tipo: body.tipo,
          ...(body.nivel ? { nivel: body.nivel } : {}),
          ...(body.ciudad ? { ciudad: body.ciudad } : {}),
          ...(body.estadoMx ? { estadoMx: body.estadoMx } : {}),
          ...(body.paginaWeb ? { paginaWeb: body.paginaWeb } : {}),
          ...(body.notasInternas ? { notasInternas: body.notasInternas } : {}),
          estado: "activo",
          fechaIngreso: new Date(),
        },
      });
      return reply.code(201).send(partner);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unique constraint")) {
        return reply
          .code(409)
          .send({ statusCode: 409, error: "Conflict", message: "Código o email duplicado" });
      }
      throw err;
    }
  });

  app.patch("/:id", async (req) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    const body = partnerUpdateSchema.parse(req.body);
    return app.masterPrisma.partner.update({
      where: { id },
      data: {
        ...(body.razonSocial !== undefined ? { razonSocial: body.razonSocial } : {}),
        ...(body.emailContacto !== undefined ? { emailContacto: body.emailContacto } : {}),
        ...(body.telefonoContacto !== undefined ? { telefonoContacto: body.telefonoContacto } : {}),
        ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
        ...(body.nivel !== undefined ? { nivel: body.nivel } : {}),
        ...(body.comisionPctOverride !== undefined
          ? { comisionPctOverride: body.comisionPctOverride }
          : {}),
        ...(body.estado !== undefined ? { estado: body.estado } : {}),
        ...(body.isAcceptingNewReferrals !== undefined
          ? { isAcceptingNewReferrals: body.isAcceptingNewReferrals }
          : {}),
        ...(body.ciudad !== undefined ? { ciudad: body.ciudad } : {}),
        ...(body.estadoMx !== undefined ? { estadoMx: body.estadoMx } : {}),
        ...(body.paginaWeb !== undefined ? { paginaWeb: body.paginaWeb } : {}),
        ...(body.notasInternas !== undefined ? { notasInternas: body.notasInternas } : {}),
      },
    });
  });

  app.post("/invitar", async (req, reply) => {
    const body = partnerInvitarSchema.parse(req.body);
    try {
      const enviadaPorAdminId = req.user.kind === "admin" ? req.user.sub : undefined;
      const result = await crearInvitacion(app.masterPrisma, {
        codigo: body.codigo,
        razonSocial: body.razonSocial,
        emailContacto: body.emailContacto,
        tipo: body.tipo,
        expiraEnHoras: body.expiraEnHoras,
        ...(enviadaPorAdminId ? { enviadaPorAdminId } : {}),
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/links", async (req, reply) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    const body = linkCreateSchema.parse(req.body);
    try {
      const result = await crearLink(app.masterPrisma, {
        partnerId: id,
        slug: body.slug,
        nombre: body.nombre,
        ...(body.targetPath ? { targetPath: body.targetPath } : {}),
        ...(body.utmSource ? { utmSource: body.utmSource } : {}),
        ...(body.utmMedium ? { utmMedium: body.utmMedium } : {}),
        ...(body.utmCampaign ? { utmCampaign: body.utmCampaign } : {}),
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/:id/links", async (req) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    return app.masterPrisma.partnerLink.findMany({
      where: { partnerId: id },
      orderBy: { createdAt: "desc" },
    });
  });

  app.delete("/links/:id", async (req, reply) => {
    const { id } = linkIdParamSchema.parse(req.params);
    await app.masterPrisma.partnerLink.update({ where: { id }, data: { isActive: false } });
    return reply.code(204).send();
  });

  app.post("/:id/recalcular-nivel", async (req, reply) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    try {
      const result = await recalcularNivelPartner(app.masterPrisma, id);
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/recalcular-comisiones", async (req, reply) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    const body = recalcularComisionesSchema.parse(req.body);
    try {
      const result = await recalcularComisionesPeriodo(app.masterPrisma, id, body.periodoYyyymm);
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/referrals/all", async (req) => {
    const q = referralListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.partnerId) where.partnerId = q.partnerId;
    if (q.estado) where.estado = q.estado;
    return app.masterPrisma.referral.findMany({
      where,
      include: {
        partner: { select: { codigo: true, razonSocial: true } },
        link: { select: { slug: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/referrals/:id/transicionar/trial", async (req, reply) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    try {
      const { transicionReferralEstado } = await import("./service.js");
      await transicionReferralEstado(app.masterPrisma, id, "trial");
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/referrals/:id/transicionar/paying", async (req, reply) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    try {
      const { transicionReferralEstado } = await import("./service.js");
      await transicionReferralEstado(app.masterPrisma, id, "paying");
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/referrals/:id/transicionar/churned", async (req, reply) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    try {
      const { transicionReferralEstado } = await import("./service.js");
      await transicionReferralEstado(app.masterPrisma, id, "churned");
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/commissions/all", async (req) => {
    const q = commissionListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.partnerId) where.partnerId = q.partnerId;
    if (q.periodoYyyymm) where.periodoYyyymm = q.periodoYyyymm;
    if (q.estado) where.estado = q.estado;
    return app.masterPrisma.commission.findMany({
      where,
      include: { partner: { select: { codigo: true, razonSocial: true } } },
      orderBy: [{ periodoYyyymm: "desc" }, { createdAt: "desc" }],
    });
  });

  app.post("/commissions/:id/aprobar", async (req, reply) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    commissionAprobarSchema.parse(req.body ?? {});
    try {
      await aprobarComision(app.masterPrisma, id, req.user.sub);
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/commissions/:id/rechazar", async (req, reply) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    const body = commissionRechazarSchema.parse(req.body);
    try {
      await rechazarComision(app.masterPrisma, id, body.motivo);
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/payouts", async (req, reply) => {
    const body = payoutCrearSchema.parse(req.body);
    try {
      const result = await crearPayout(app.masterPrisma, {
        partnerId: body.partnerId,
        periodoYyyymm: body.periodoYyyymm,
        metodoPago: body.metodoPago,
        creadoPorAdminId: req.user.sub,
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/payouts/:id/marcar-pagado", async (req, reply) => {
    const { id } = partnerIdParamSchema.parse(req.params);
    const body = payoutMarcarPagadoSchema.parse(req.body);
    try {
      await marcarPayoutPagado(app.masterPrisma, id, body.folioBancario, body.invoicePartnerUrl);
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/payouts/all", async (req) => {
    const q = req.query as { partnerId?: string; estado?: string };
    const where: Record<string, unknown> = {};
    if (q.partnerId) where.partnerId = q.partnerId;
    if (q.estado) where.estado = q.estado;
    return app.masterPrisma.payout.findMany({
      where,
      include: {
        partner: { select: { codigo: true, razonSocial: true } },
        _count: { select: { commissions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });
};

/**
 * Endpoint público (sin auth) para tracking de click de un link de partner.
 * No registra cookie por servidor (eso lo hace el frontend setting cookie).
 * Solo expone meta del link y registra el click+attribution.
 */
export const partnersPublicRoutes: FastifyPluginAsync = async (app) => {
  app.post("/p/:slug/click", async (req, reply) => {
    const { slug } = slugParamSchema.parse(req.params);
    const cookieValueExisting = (req.headers["x-partner-attribution"] as string) || undefined;
    try {
      const result = await registrarClick(app.masterPrisma, {
        slug,
        ...(req.ip ? { ipAddress: req.ip } : {}),
        ...(req.headers["user-agent"] ? { userAgent: req.headers["user-agent"] as string } : {}),
        ...(cookieValueExisting ? { cookieValueExisting } : {}),
      });
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/p/:slug/accept-invite", async (req, reply) => {
    const token = (req.body as { token?: string })?.token;
    if (!token) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "token requerido",
      });
    }
    try {
      const result = await aceptarInvitacion(app.masterPrisma, token);
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};

export default partnersRoutes;
