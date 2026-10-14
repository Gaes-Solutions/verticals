import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySensible from "@fastify/sensible";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { Config } from "../config.js";

const securityPlugin: FastifyPluginAsync<{ config: Config }> = async (app, opts) => {
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: opts.config.NODE_ENV === "production",
  });

  await app.register(fastifyCors, {
    origin: opts.config.CORS_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
  });

  await app.register(fastifyRateLimit, {
    max: opts.config.RATE_LIMIT_MAX,
    timeWindow: opts.config.RATE_LIMIT_WINDOW,
    keyGenerator: (req) => {
      // Shopper requests arrive through the same BFF address. A verified identity
      // gets its own budget; unsigned/expired tokens keep the existing IP limit.
      const header = req.headers.authorization;
      if (header?.startsWith("Bearer ")) {
        try {
          const user = app.jwt.verify<{ kind: string; tenantSlug?: string; sub?: string }>(
            header.slice(7),
          );
          if (user.kind === "cliente" && user.tenantSlug && user.sub)
            return `cliente:${user.tenantSlug}:${user.sub}`;
        } catch {
          /* Untrusted identity must never choose its own rate bucket. */
        }
      }
      return req.ip;
    },
  });

  await app.register(fastifySensible);
};

export default fp(securityPlugin, { name: "security" });
