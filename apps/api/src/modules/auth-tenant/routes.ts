import { type TenantPrismaClient, getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { tenantLoginBodySchema, tenantMfaCodeSchema, tenantMfaDisableSchema } from "./schemas.js";
import {
  type TenantPrincipal,
  buildTenantPrincipal,
  consumeTenantBackupCode,
  disableTenantMfa,
  enableTenantMfa,
  findTenantBySlug,
  generateTenantTotpSecret,
  loadTenantUserForLogin,
  loadTenantUserMfa,
  require2faParaUsuario,
  resetTenantBackupCodes,
  setTenantPendingSecret,
  tenantTotpKeyUri,
  updateLastLogin,
  verifyPassword,
  verifyTenantTotp,
} from "./service.js";

const MFA_TOKEN_TTL = "10m";

function unauthorized(reply: FastifyReply, message = "Credenciales inválidas") {
  return reply.code(401).send({ statusCode: 401, error: "Unauthorized", message });
}

const authTenantRoutes: FastifyPluginAsync = async (app) => {
  /** Arma la respuesta de sesión completa (access token + user + tenant). */
  async function issueSession(
    reply: FastifyReply,
    principal: TenantPrincipal,
    tenantSlug: string,
    sucursalId?: string,
  ) {
    await updateLastLogin(tenantSlug, principal.id, sucursalId);
    const accessToken = await reply.jwtSign({
      sub: principal.id,
      email: principal.email,
      tenantSlug: principal.tenantSlug,
      permissions: principal.isOwner ? ["*"] : principal.permissions,
      kind: "tenant",
    });
    return {
      accessToken,
      user: {
        id: principal.id,
        email: principal.email,
        nombre: principal.nombre,
        apellidos: principal.apellidos,
        tipoUsuario: principal.tipoUsuario,
        isOwner: principal.isOwner,
        roleCodes: principal.roleCodes,
        permissions: principal.isOwner ? ["*"] : principal.permissions,
      },
      tenant: { slug: tenantSlug },
    };
  }

  /** Carga el principal completo (roles/permisos) de un usuario por id. */
  async function loadPrincipalById(
    tenantPrisma: TenantPrismaClient,
    tenantSlug: string,
    userId: string,
  ): Promise<TenantPrincipal | null> {
    const u = await tenantPrisma.usuario.findUnique({
      where: { id: userId },
      include: { roles: { include: { rol: true } } },
    });
    if (!u || !u.isActive) return null;
    return buildTenantPrincipal(
      {
        id: u.id,
        email: u.email,
        nombre: u.nombre,
        apellidos: u.apellidos,
        tipoUsuario: u.tipoUsuario,
        passwordHash: u.passwordHash,
        isActive: u.isActive,
        roles: u.roles.map((r) => ({ codigo: r.rol.codigo, permisos: r.rol.permisos })),
      },
      tenantSlug,
    );
  }

  /** Valida el token intermedio (kind tenant_mfa) y devuelve el contexto del usuario. */
  async function ctxFromMfaToken(req: FastifyRequest) {
    try {
      await req.jwtVerify();
    } catch {
      return null;
    }
    if (req.user.kind !== "tenant_mfa") return null;
    const tenantSlug = req.user.tenantSlug;
    const tenantPrisma = getTenantClient(tenantSlug);
    const user = await loadTenantUserMfa(tenantPrisma, { id: req.user.sub });
    if (!user || !user.isActive) return null;
    return { user, tenantSlug, tenantPrisma };
  }

  app.post(
    "/login",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = tenantLoginBodySchema.parse(req.body);

      const tenant = await findTenantBySlug(body.tenantSlug, app.masterPrisma);
      if (!tenant || tenant.status === "cancelled") return unauthorized(reply);

      const tenantPrisma = getTenantClient(body.tenantSlug);
      const user = await loadTenantUserForLogin(body.email, tenantPrisma);
      if (!user || !user.isActive) return unauthorized(reply);
      if (!(await verifyPassword(body.password, user.passwordHash))) return unauthorized(reply);

      const principal = buildTenantPrincipal(user, body.tenantSlug);
      const mfa = await loadTenantUserMfa(tenantPrisma, { id: user.id });
      const enrolado = Boolean(mfa?.mfaEnabled && mfa.mfaSecret && mfa.mfaVerifiedAt);
      const requerido = await require2faParaUsuario(
        tenantPrisma,
        tenant.vertical,
        principal.roleCodes,
      );

      if (enrolado || requerido) {
        const mfaToken = await reply.jwtSign(
          { sub: user.id, email: user.email, tenantSlug: body.tenantSlug, kind: "tenant_mfa" },
          { expiresIn: MFA_TOKEN_TTL },
        );
        return enrolado ? { mfaRequired: true, mfaToken } : { mfaSetupRequired: true, mfaToken };
      }

      return issueSession(reply, principal, body.tenantSlug, body.sucursalId);
    },
  );

  // Enrolamiento durante el login (forzado por política): genera el secret.
  app.post(
    "/mfa/setup",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const ctx = await ctxFromMfaToken(req);
      if (!ctx) return unauthorized(reply, "Token MFA inválido");
      if (ctx.user.mfaEnabled && ctx.user.mfaVerifiedAt) {
        return reply
          .code(409)
          .send({ statusCode: 409, error: "Conflict", message: "MFA ya configurado" });
      }
      const secret = generateTenantTotpSecret();
      await setTenantPendingSecret(ctx.tenantPrisma, ctx.user.id, secret);
      return { secret, otpauthUrl: tenantTotpKeyUri(ctx.user.email, ctx.tenantSlug, secret) };
    },
  );

  // Confirma el código del enrolamiento → activa MFA → sesión + códigos de respaldo.
  app.post(
    "/mfa/activate",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const ctx = await ctxFromMfaToken(req);
      if (!ctx) return unauthorized(reply, "Token MFA inválido");
      const { code } = tenantMfaCodeSchema.parse(req.body);
      if (!ctx.user.mfaSecret || !verifyTenantTotp(code, ctx.user.mfaSecret)) {
        return unauthorized(reply, "Código incorrecto");
      }
      const backupCodes = await enableTenantMfa(ctx.tenantPrisma, ctx.user.id);
      const principal = await loadPrincipalById(ctx.tenantPrisma, ctx.tenantSlug, ctx.user.id);
      if (!principal) return unauthorized(reply);
      const session = await issueSession(reply, principal, ctx.tenantSlug);
      return { ...session, backupCodes };
    },
  );

  // Logins siguientes (ya enrolado): verifica TOTP o un código de respaldo → sesión.
  app.post(
    "/mfa/verify",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const ctx = await ctxFromMfaToken(req);
      if (!ctx) return unauthorized(reply, "Token MFA inválido");
      const { code } = tenantMfaCodeSchema.parse(req.body);
      const enrolado = Boolean(ctx.user.mfaEnabled && ctx.user.mfaSecret && ctx.user.mfaVerifiedAt);
      if (!enrolado) return unauthorized(reply, "MFA no configurado");
      const totpOk = ctx.user.mfaSecret ? verifyTenantTotp(code, ctx.user.mfaSecret) : false;
      const backupOk = !totpOk && (await consumeTenantBackupCode(ctx.tenantPrisma, ctx.user, code));
      if (!totpOk && !backupOk) return unauthorized(reply, "Código incorrecto");
      const principal = await loadPrincipalById(ctx.tenantPrisma, ctx.tenantSlug, ctx.user.id);
      if (!principal) return unauthorized(reply);
      return issueSession(reply, principal, ctx.tenantSlug);
    },
  );

  // ───── Self-service (sesión activa): activar/desactivar el 2FA propio ─────

  app.get("/mfa/estado", { preHandler: app.authenticateTenant }, async (req, reply) => {
    if (req.user.kind !== "tenant") return unauthorized(reply);
    const tenantSlug = req.user.tenantSlug;
    const tenantPrisma = getTenantClient(tenantSlug);
    const mfa = await loadTenantUserMfa(tenantPrisma, { id: req.user.sub });
    if (!mfa) return unauthorized(reply);
    const principal = await loadPrincipalById(tenantPrisma, tenantSlug, req.user.sub);
    const tenant = await findTenantBySlug(tenantSlug, app.masterPrisma);
    const requerido = await require2faParaUsuario(
      tenantPrisma,
      tenant?.vertical ?? null,
      principal?.roleCodes ?? [],
    );
    return {
      enabled: Boolean(mfa.mfaEnabled && mfa.mfaVerifiedAt),
      backupCodesRestantes: mfa.mfaBackupCodes.length,
      requerido,
    };
  });

  app.post("/mfa/enroll", { preHandler: app.authenticateTenant }, async (req, reply) => {
    if (req.user.kind !== "tenant") return unauthorized(reply);
    const tenantPrisma = getTenantClient(req.user.tenantSlug);
    const mfa = await loadTenantUserMfa(tenantPrisma, { id: req.user.sub });
    if (!mfa) return unauthorized(reply);
    if (mfa.mfaEnabled && mfa.mfaVerifiedAt) {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "MFA ya está activo" });
    }
    const secret = generateTenantTotpSecret();
    await setTenantPendingSecret(tenantPrisma, req.user.sub, secret);
    return { secret, otpauthUrl: tenantTotpKeyUri(mfa.email, req.user.tenantSlug, secret) };
  });

  app.post("/mfa/enroll/confirm", { preHandler: app.authenticateTenant }, async (req, reply) => {
    if (req.user.kind !== "tenant") return unauthorized(reply);
    const tenantPrisma = getTenantClient(req.user.tenantSlug);
    const { code } = tenantMfaCodeSchema.parse(req.body);
    const mfa = await loadTenantUserMfa(tenantPrisma, { id: req.user.sub });
    if (!mfa?.mfaSecret || !verifyTenantTotp(code, mfa.mfaSecret)) {
      return unauthorized(reply, "Código incorrecto");
    }
    const backupCodes = await enableTenantMfa(tenantPrisma, req.user.sub);
    return { backupCodes };
  });

  app.post("/mfa/disable", { preHandler: app.authenticateTenant }, async (req, reply) => {
    if (req.user.kind !== "tenant") return unauthorized(reply);
    const tenantSlug = req.user.tenantSlug;
    const tenantPrisma = getTenantClient(tenantSlug);
    const { password } = tenantMfaDisableSchema.parse(req.body);
    const u = await tenantPrisma.usuario.findUnique({
      where: { id: req.user.sub },
      select: { passwordHash: true },
    });
    if (!u || !(await verifyPassword(password, u.passwordHash))) {
      return unauthorized(reply, "Contraseña incorrecta");
    }
    const principal = await loadPrincipalById(tenantPrisma, tenantSlug, req.user.sub);
    const tenant = await findTenantBySlug(tenantSlug, app.masterPrisma);
    const requerido = await require2faParaUsuario(
      tenantPrisma,
      tenant?.vertical ?? null,
      principal?.roleCodes ?? [],
    );
    if (requerido) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "Tu negocio exige 2FA para tu rol; no puedes desactivarlo.",
      });
    }
    await disableTenantMfa(tenantPrisma, req.user.sub);
    return { ok: true };
  });

  app.post(
    "/mfa/backup-codes/regenerate",
    { preHandler: app.authenticateTenant },
    async (req, reply) => {
      if (req.user.kind !== "tenant") return unauthorized(reply);
      const tenantPrisma = getTenantClient(req.user.tenantSlug);
      const { code } = tenantMfaCodeSchema.parse(req.body);
      const mfa = await loadTenantUserMfa(tenantPrisma, { id: req.user.sub });
      if (!mfa?.mfaEnabled || !mfa.mfaSecret || !verifyTenantTotp(code, mfa.mfaSecret)) {
        return unauthorized(reply, "Código incorrecto");
      }
      const backupCodes = await resetTenantBackupCodes(tenantPrisma, req.user.sub);
      return { backupCodes };
    },
  );

  app.get("/me", { preHandler: app.authenticateTenant }, async (req, reply) => {
    if (req.user.kind !== "tenant") {
      return reply
        .code(401)
        .send({ statusCode: 401, error: "Unauthorized", message: "Token inválido" });
    }
    const tenantPrisma = getTenantClient(req.user.tenantSlug);
    const principal = await loadPrincipalById(tenantPrisma, req.user.tenantSlug, req.user.sub);
    if (!principal) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Usuario no encontrado o inactivo",
      });
    }
    return {
      id: principal.id,
      email: principal.email,
      nombre: principal.nombre,
      apellidos: principal.apellidos,
      tipoUsuario: principal.tipoUsuario,
      isOwner: principal.isOwner,
      tenantSlug: principal.tenantSlug,
      roleCodes: principal.roleCodes,
      permissions: principal.isOwner ? ["*"] : principal.permissions,
    };
  });
};

export default authTenantRoutes;
