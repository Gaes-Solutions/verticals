import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../../config.js";
import { loginBodySchema } from "./schemas.js";
import {
  createRefreshToken,
  findActiveAdminByEmail,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenByPlaintext,
  verifyPassword,
} from "./service.js";

const REFRESH_COOKIE_NAME = "gaespos_refresh";

const authRoutes: FastifyPluginAsync<{ config: Config }> = async (app, opts) => {
  const { config } = opts;
  const refreshCookieMaxAge = config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
  const isProd = config.NODE_ENV === "production";

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
      if (!admin) {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Credenciales inválidas",
        });
      }

      const passwordOk = await verifyPassword(body.password, admin.passwordHash);
      if (!passwordOk) {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Credenciales inválidas",
        });
      }

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
