import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import {
  PartnerPortalError,
  aceptarInvitacionConPassword,
  activarMfaPartner,
  comisionesPartner,
  iniciarSetupMfaPartner,
  partnerRequiereMfa,
  payoutsPartner,
  perfilPartner,
  referralsPartner,
  registrarLoginPartner,
  validarLoginPartner,
  verificarMfaPartner,
} from "./service.js";

const aceptarSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const codeSchema = z.object({ code: z.string().min(4).max(16) });

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof PartnerPortalError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error:
        err.statusCode === 401
          ? "Unauthorized"
          : err.statusCode >= 500
            ? "Internal"
            : "Bad Request",
      message: err.message,
    });
    return true;
  }
  return false;
}

/**
 * Portal self-serve del partner (ADR 013): email+password+2FA TOTP opt-in.
 * El alta sigue siendo del superadmin (invitación); aquí el partner la acepta
 * fijando su password y después consulta SU programa.
 */
const partnerPortalRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/aceptar-invitacion", async (req, reply) => {
    const body = aceptarSchema.parse(req.body);
    try {
      const result = await aceptarInvitacionConPassword(
        app.masterPrisma,
        body.token,
        body.password,
      );
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/auth/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);
    try {
      const partner = await validarLoginPartner(app.masterPrisma, body.email, body.password);
      if (partnerRequiereMfa(partner)) {
        const mfaToken = app.jwt.sign(
          { sub: partner.id, email: partner.emailContacto, kind: "partner_mfa" },
          { expiresIn: "5m" },
        );
        return { mfaRequired: true, mfaToken };
      }
      await registrarLoginPartner(app.masterPrisma, partner.id);
      const accessToken = app.jwt.sign({
        sub: partner.id,
        email: partner.emailContacto,
        kind: "partner",
      });
      return { accessToken, partner: await perfilPartner(app.masterPrisma, partner.id) };
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/auth/mfa/verify", async (req, reply) => {
    const body = codeSchema.parse(req.body);
    try {
      await req.jwtVerify();
    } catch {
      return reply
        .code(401)
        .send({ statusCode: 401, error: "Unauthorized", message: "Token inválido o expirado" });
    }
    if (req.user.kind !== "partner_mfa") {
      return reply
        .code(401)
        .send({ statusCode: 401, error: "Unauthorized", message: "Se requiere reto 2FA" });
    }
    try {
      await verificarMfaPartner(app.masterPrisma, req.user.sub, body.code);
      await registrarLoginPartner(app.masterPrisma, req.user.sub);
      const accessToken = app.jwt.sign({
        sub: req.user.sub,
        email: req.user.email,
        kind: "partner",
      });
      return { accessToken, partner: await perfilPartner(app.masterPrisma, req.user.sub) };
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.register(async (portal) => {
    portal.addHook("preHandler", portal.authenticatePartner);

    portal.post("/auth/mfa/setup", async (req, reply) => {
      try {
        return await iniciarSetupMfaPartner(portal.masterPrisma, req.user.sub);
      } catch (err) {
        if (handleErr(reply, err)) return;
        throw err;
      }
    });

    portal.post("/auth/mfa/activate", async (req, reply) => {
      const body = codeSchema.parse(req.body);
      try {
        return await activarMfaPartner(portal.masterPrisma, req.user.sub, body.code);
      } catch (err) {
        if (handleErr(reply, err)) return;
        throw err;
      }
    });

    portal.get("/me", async (req, reply) => {
      try {
        return await perfilPartner(portal.masterPrisma, req.user.sub);
      } catch (err) {
        if (handleErr(reply, err)) return;
        throw err;
      }
    });

    portal.get("/referrals", async (req) => referralsPartner(portal.masterPrisma, req.user.sub));

    portal.get("/commissions", async (req) => comisionesPartner(portal.masterPrisma, req.user.sub));

    portal.get("/payouts", async (req) => payoutsPartner(portal.masterPrisma, req.user.sub));
  });
};

export default partnerPortalRoutes;
