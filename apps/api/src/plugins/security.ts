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
  });

  await app.register(fastifySensible);
};

export default fp(securityPlugin, { name: "security" });
