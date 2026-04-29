import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { Config } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: string };
    user: { sub: string; email: string; role: string };
  }
}

const authPlugin: FastifyPluginAsync<{ config: Config }> = async (app, opts) => {
  await app.register(fastifyCookie, {
    secret: opts.config.COOKIE_SECRET,
  });

  await app.register(fastifyJwt, {
    secret: opts.config.JWT_SECRET,
    sign: {
      expiresIn: `${opts.config.ACCESS_TOKEN_TTL_MIN}m`,
    },
  });

  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch (_err) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Token inválido o expirado",
      });
    }
  });
};

export default fp(authPlugin, { name: "auth", dependencies: ["db"] });
