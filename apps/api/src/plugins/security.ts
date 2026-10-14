import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySensible from "@fastify/sensible";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
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

  type Identity = { kind: string; tenantSlug?: string; sub?: string };
  const identities = new WeakMap<FastifyRequest, Identity | null>();
  function verifiedIdentity(req: FastifyRequest): Identity | null {
    if (identities.has(req)) return identities.get(req) ?? null;
    let user: Identity | null = null;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        user = app.jwt.verify<Identity>(header.slice(7));
      } catch {}
    }
    identities.set(req, user);
    return user;
  }
  await app.register(fastifyRateLimit, {
    // The signed storefront service aggregates many browsers. Separate bounded
    // read capacity from checkout writes; neither changes endpoint authorization.
    max: (req) =>
      req.method === "GET" && verifiedIdentity(req)?.kind === "tienda_web"
        ? opts.config.STOREFRONT_READ_RATE_LIMIT_MAX
        : opts.config.RATE_LIMIT_MAX,
    timeWindow: opts.config.RATE_LIMIT_WINDOW,
    keyGenerator: (req) => {
      // Shopper requests arrive through the same BFF address. A verified identity
      // gets its own budget; unsigned/expired tokens keep the existing IP limit.
      const user = verifiedIdentity(req);
      if (user?.kind === "cliente" && user.tenantSlug && user.sub)
        return `cliente:${user.tenantSlug}:${user.sub}`;
      if (user?.kind === "tienda_web" && user.tenantSlug && user.sub)
        return `tienda_web:${req.method === "GET" ? "read" : "write"}:${user.tenantSlug}:${user.sub}`;
      return req.ip;
    },
  });

  await app.register(fastifySensible);
};

export default fp(securityPlugin, { name: "security" });
