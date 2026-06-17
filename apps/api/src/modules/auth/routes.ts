import type { AdminUser } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Config } from "../../config.js";
import { writeAudit } from "../../lib/audit.js";
import { loginBodySchema } from "./schemas.js";
import {
  consumeAdminBackupCode,
  createRefreshToken,
  findActiveAdminByEmail,
  findValidRefreshToken,
  generateTotpSecret,
  markMfaVerified,
  resetAdminBackupCodes,
  revokeRefreshToken,
  revokeRefreshTokenByPlaintext,
  setPendingMfaSecret,
  totpKeyUri,
  verifyPassword,
  verifyTotpCode,
} from "./service.js";

const REFRESH_COOKIE_NAME = "gaespos_refresh";
const MFA_TOKEN_TTL = "10m";

// TOTP de 6 dígitos o un código de respaldo (xxxx-xxxx).
const mfaCodeSchema = z.object({ code: z.string().min(6).max(14) });

const authRoutes: FastifyPluginAsync<{ config: Config }> = async (app, opts) => {
  const { config } = opts;
  const refreshCookieMaxAge = config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
  const isProd = config.NODE_ENV === "production";

  /** Emite la sesión completa (access JWT + refresh cookie) tras pasar password Y TOTP. */
  async function issueSession(req: FastifyRequest, reply: FastifyReply, admin: AdminUser) {
    const accessToken = await reply.jwtSign({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      kind: "admin",
    });

    const userAgent = req.headers["user-agent"] ?? undefined;
    const ipAddress = req.ip;
    const { plaintext } = await createRefreshToken(
      {
        adminUserId: admin.id,
        ttlDays: config.REFRESH_TOKEN_TTL_DAYS,
        ...(userAgent ? { userAgent } : {}),
        ...(ipAddress ? { ipAddress } : {}),
      },
      app.masterPrisma,
    );

    await app.masterPrisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    await writeAudit(app.masterPrisma, {
      actor: admin.email,
      action: "admin.login",
      ipAddress: req.ip,
    });

    reply.setCookie(REFRESH_COOKIE_NAME, plaintext, {
      path: "/auth",
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      signed: true,
      maxAge: refreshCookieMaxAge,
    });

    return {
      accessToken,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    };
  }

  /** Valida el token intermedio (kind admin_mfa) y devuelve el admin activo. */
  async function adminFromMfaToken(req: FastifyRequest): Promise<AdminUser | null> {
    try {
      await req.jwtVerify();
    } catch {
      return null;
    }
    if (req.user.kind !== "admin_mfa") return null;
    const admin = await app.masterPrisma.adminUser.findUnique({ where: { id: req.user.sub } });
    return admin?.active ? admin : null;
  }

  // Paso 1: password. Nunca emite sesión directa — siempre sigue el reto TOTP
  // (enrolamiento la primera vez, verificación las siguientes).
  app.post(
    "/login",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const body = loginBodySchema.parse(req.body);

      const admin = await findActiveAdminByEmail(body.email, app.masterPrisma);
      if (!admin || !(await verifyPassword(body.password, admin.passwordHash))) {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Credenciales inválidas",
        });
      }

      const mfaToken = await reply.jwtSign(
        { sub: admin.id, email: admin.email, kind: "admin_mfa" },
        { expiresIn: MFA_TOKEN_TTL },
      );
      const enrolado = Boolean(admin.mfaSecret && admin.mfaVerifiedAt);
      return enrolado ? { mfaRequired: true, mfaToken } : { mfaSetupRequired: true, mfaToken };
    },
  );

  // Paso 2a (primer login): genera el secret y la URL para la app autenticadora.
  app.post(
    "/mfa/setup",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const admin = await adminFromMfaToken(req);
      if (!admin) {
        return reply
          .code(401)
          .send({ statusCode: 401, error: "Unauthorized", message: "Token MFA inválido" });
      }
      if (admin.mfaSecret && admin.mfaVerifiedAt) {
        return reply
          .code(409)
          .send({ statusCode: 409, error: "Conflict", message: "MFA ya configurado" });
      }
      const secret = generateTotpSecret();
      await setPendingMfaSecret(admin.id, secret, app.masterPrisma);
      return { secret, otpauthUrl: totpKeyUri(admin.email, secret) };
    },
  );

  // Paso 2b (primer login): confirma el código → activa MFA → sesión.
  app.post(
    "/mfa/activate",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const admin = await adminFromMfaToken(req);
      if (!admin) {
        return reply
          .code(401)
          .send({ statusCode: 401, error: "Unauthorized", message: "Token MFA inválido" });
      }
      const { code } = mfaCodeSchema.parse(req.body);
      if (!admin.mfaSecret || !verifyTotpCode(code, admin.mfaSecret)) {
        return reply
          .code(401)
          .send({ statusCode: 401, error: "Unauthorized", message: "Código incorrecto" });
      }
      await markMfaVerified(admin.id, app.masterPrisma);
      const backupCodes = await resetAdminBackupCodes(admin.id, app.masterPrisma);
      await writeAudit(app.masterPrisma, {
        actor: admin.email,
        action: "admin.mfa_enrolled",
        ipAddress: req.ip,
      });
      const session = await issueSession(req, reply, admin);
      return { ...session, backupCodes };
    },
  );

  // Paso 2 (logins siguientes): verifica TOTP o un código de respaldo → sesión.
  app.post(
    "/mfa/verify",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const admin = await adminFromMfaToken(req);
      if (!admin) {
        return reply
          .code(401)
          .send({ statusCode: 401, error: "Unauthorized", message: "Token MFA inválido" });
      }
      const { code } = mfaCodeSchema.parse(req.body);
      const enrolado = Boolean(admin.mfaSecret && admin.mfaVerifiedAt);
      const totpOk = enrolado && admin.mfaSecret ? verifyTotpCode(code, admin.mfaSecret) : false;
      const backupOk = enrolado
        ? !totpOk && (await consumeAdminBackupCode(admin, code, app.masterPrisma))
        : false;
      if (!totpOk && !backupOk) {
        return reply
          .code(401)
          .send({ statusCode: 401, error: "Unauthorized", message: "Código incorrecto" });
      }
      if (backupOk) {
        await writeAudit(app.masterPrisma, {
          actor: admin.email,
          action: "admin.mfa_backup_code_used",
          ipAddress: req.ip,
        });
      }
      return issueSession(req, reply, admin);
    },
  );

  // Regenera los códigos de respaldo (sesión activa). Invalida los anteriores.
  app.post(
    "/mfa/backup-codes/regenerate",
    { preHandler: app.authenticateAdmin },
    async (req, reply) => {
      if (req.user.kind !== "admin") {
        return reply
          .code(401)
          .send({ statusCode: 401, error: "Unauthorized", message: "Sesión inválida" });
      }
      const admin = await app.masterPrisma.adminUser.findUnique({ where: { id: req.user.sub } });
      if (!admin || !admin.mfaVerifiedAt) {
        return reply
          .code(409)
          .send({ statusCode: 409, error: "Conflict", message: "MFA no está activo" });
      }
      const backupCodes = await resetAdminBackupCodes(admin.id, app.masterPrisma);
      await writeAudit(app.masterPrisma, {
        actor: admin.email,
        action: "admin.mfa_backup_regenerated",
        ipAddress: req.ip,
      });
      return { backupCodes };
    },
  );

  app.post("/refresh", async (req, reply) => {
    const cookie = req.cookies[REFRESH_COOKIE_NAME];
    if (!cookie) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Refresh token ausente",
      });
    }

    const unsigned = req.unsignCookie(cookie);
    if (!unsigned.valid || unsigned.value === null) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Refresh token inválido",
      });
    }

    const found = await findValidRefreshToken(unsigned.value, app.masterPrisma);
    if (!found) {
      reply.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth" });
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Refresh token expirado o revocado",
      });
    }

    await revokeRefreshToken(found.tokenId, app.masterPrisma);

    const userAgent = req.headers["user-agent"] ?? undefined;
    const ipAddress = req.ip;
    const { plaintext } = await createRefreshToken(
      {
        adminUserId: found.adminUser.id,
        ttlDays: config.REFRESH_TOKEN_TTL_DAYS,
        ...(userAgent ? { userAgent } : {}),
        ...(ipAddress ? { ipAddress } : {}),
      },
      app.masterPrisma,
    );

    const accessToken = await reply.jwtSign({
      sub: found.adminUser.id,
      email: found.adminUser.email,
      role: found.adminUser.role,
      kind: "admin",
    });

    reply.setCookie(REFRESH_COOKIE_NAME, plaintext, {
      path: "/auth",
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      signed: true,
      maxAge: refreshCookieMaxAge,
    });

    return { accessToken };
  });

  app.post("/logout", async (req, reply) => {
    const cookie = req.cookies[REFRESH_COOKIE_NAME];
    if (cookie) {
      const unsigned = req.unsignCookie(cookie);
      if (unsigned.valid && unsigned.value !== null) {
        await revokeRefreshTokenByPlaintext(unsigned.value, app.masterPrisma);
      }
    }
    reply.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth" });
    return { ok: true };
  });

  app.get(
    "/me",
    {
      preHandler: app.authenticateAdmin,
    },
    async (req, reply) => {
      const admin = await app.masterPrisma.adminUser.findUnique({
        where: { id: req.user.sub },
      });
      if (!admin || !admin.active) {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Usuario no encontrado o inactivo",
        });
      }
      return {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      };
    },
  );
};

export default authRoutes;
