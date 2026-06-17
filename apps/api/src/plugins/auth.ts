import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { Config } from "../config.js";

type AdminTokenPayload = {
  sub: string;
  email: string;
  role: string;
  kind: "admin";
};

// Token intermedio: password validada, falta el reto TOTP (no da acceso a nada más).
type AdminMfaTokenPayload = {
  sub: string;
  email: string;
  kind: "admin_mfa";
};

type TenantTokenPayload = {
  sub: string;
  email: string;
  tenantSlug: string;
  permissions: string[];
  kind: "tenant";
};

// Token intermedio del usuario del negocio: password validada, falta el reto TOTP.
type TenantMfaTokenPayload = {
  sub: string;
  email: string;
  tenantSlug: string;
  kind: "tenant_mfa";
};

type PatientTokenPayload = {
  sub: string;
  phoneE164: string;
  kind: "patient";
};

type AdminTenantTokenPayload = {
  sub: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
  roleAdmin: "owner" | "billing_only" | "viewer";
  kind: "admin_tenant";
};

type ClienteTokenPayload = {
  sub: string;
  email: string;
  tenantSlug: string;
  kind: "cliente";
};

type ClienteB2bTokenPayload = {
  sub: string; // usuarioB2bId
  clienteB2bId: string;
  email: string;
  rol: "admin" | "comprador";
  tenantSlug: string;
  kind: "cliente_b2b";
};

type TokenPayload =
  | AdminTokenPayload
  | AdminMfaTokenPayload
  | TenantTokenPayload
  | TenantMfaTokenPayload
  | PatientTokenPayload
  | AdminTenantTokenPayload
  | ClienteTokenPayload
  | ClienteB2bTokenPayload;

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateTenant: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticatePatient: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdminTenant: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateCliente: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateClienteB2b: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

function rejectUnauthorized(reply: FastifyReply, message: string) {
  return reply.code(401).send({
    statusCode: 401,
    error: "Unauthorized",
    message,
  });
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
      return rejectUnauthorized(reply, "Token inválido o expirado");
    }
  });

  app.decorate("authenticateAdmin", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch (_err) {
      return rejectUnauthorized(reply, "Token inválido o expirado");
    }
    if (req.user.kind !== "admin") {
      return rejectUnauthorized(reply, "Se requiere sesión de administrador");
    }
  });

  app.decorate("authenticateTenant", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch (_err) {
      return rejectUnauthorized(reply, "Token inválido o expirado");
    }
    if (req.user.kind !== "tenant") {
      return rejectUnauthorized(reply, "Se requiere sesión de usuario de tenant");
    }
  });

  app.decorate("authenticatePatient", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch (_err) {
      return rejectUnauthorized(reply, "Token inválido o expirado");
    }
    if (req.user.kind !== "patient") {
      return rejectUnauthorized(reply, "Se requiere sesión de paciente");
    }
  });

  app.decorate("authenticateAdminTenant", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch (_err) {
      return rejectUnauthorized(reply, "Token inválido o expirado");
    }
    if (req.user.kind !== "admin_tenant") {
      return rejectUnauthorized(reply, "Se requiere sesión de admin del tenant");
    }
  });

  app.decorate("authenticateCliente", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch (_err) {
      return rejectUnauthorized(reply, "Token inválido o expirado");
    }
    if (req.user.kind !== "cliente") {
      return rejectUnauthorized(reply, "Se requiere sesión de cliente");
    }
  });

  app.decorate("authenticateClienteB2b", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch (_err) {
      return rejectUnauthorized(reply, "Token inválido o expirado");
    }
    if (req.user.kind !== "cliente_b2b") {
      return rejectUnauthorized(reply, "Se requiere sesión de cliente mayorista");
    }
  });
};

export default fp(authPlugin, { name: "auth", dependencies: ["db"] });
