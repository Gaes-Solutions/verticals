import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { type MasterPrismaClient, type TenantPrismaClient, getTenantClient } from "@gaespos/db";
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import {
  buildTenantPrincipal,
  findTenantBySlug,
  loadTenantUserById,
  loadTenantUserMfa,
  recordTenantMfaStep,
  require2faParaUsuario,
  updateLastLogin,
  verifyPassword,
  verifyTenantTotpStep,
} from "./service.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_TOKEN_TTL = "10m";

function rp() {
  return {
    rpID: process.env.WEBAUTHN_RP_ID?.trim() || "app.angaes.com",
    rpName: process.env.WEBAUTHN_RP_NAME?.trim() || "GaesSoft",
    origin: process.env.WEBAUTHN_ORIGIN?.trim() || "https://app.angaes.com",
  };
}

interface ChallengePayload {
  jti: string;
  challenge: string;
  purpose: "reg" | "login";
  tenantSlug: string;
  usuarioId?: string;
  exp: number;
}

// El challenge viaja firmado (HMAC) al cliente y regresa en /verify: sin estado
// en servidor, a prueba de manipulación y con expiración corta.
function firmarChallenge(payload: ChallengePayload): string {
  const secret = process.env.JWT_SECRET ?? "";
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verificarChallenge(token: string): ChallengePayload | null {
  const secret = process.env.JWT_SECRET ?? "";
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const esperado = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as ChallengePayload;
    return payload.exp < Date.now() ? null : payload;
  } catch {
    return null;
  }
}

// Marca el challenge como consumido de forma atómica: la inserción del jti
// (PK único) falla con P2002 si ya se usó → replay rechazado. Cumple el
// requisito WebAuthn de challenge de un solo uso.
async function consumirChallenge(
  masterPrisma: MasterPrismaClient,
  jti: string,
  exp: number,
): Promise<boolean> {
  try {
    await masterPrisma.webauthnUsedChallenge.create({
      data: { id: jti, expiresAt: new Date(exp) },
    });
    return true;
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "P2002"
    ) {
      return false;
    }
    throw err;
  }
}

function transportsToArray(csv: string | null): AuthenticatorTransportFuture[] | undefined {
  return csv ? (csv.split(",") as AuthenticatorTransportFuture[]) : undefined;
}

function unauthorized(reply: FastifyReply, message = "No se pudo verificar la huella") {
  return reply.code(401).send({ statusCode: 401, error: "Unauthorized", message });
}

// El passkey solo cuenta como segundo factor si el autenticador verificó al
// usuario (biometría/PIN). Cuando la política del tenant exige 2FA y la aserción
// no fue verificada, se devuelve el token intermedio (kind tenant_mfa) para
// completar TOTP, igual que el login por contraseña — nunca una sesión completa.
async function retarSegundoFactor(
  reply: FastifyReply,
  tenantPrisma: TenantPrismaClient,
  principal: { id: string; email: string },
  tenantSlug: string,
) {
  const mfa = await loadTenantUserMfa(tenantPrisma, { id: principal.id });
  const enrolado = Boolean(mfa?.mfaEnabled && mfa.mfaSecret && mfa.mfaVerifiedAt);
  const mfaToken = await reply.jwtSign(
    { sub: principal.id, email: principal.email, tenantSlug, kind: "tenant_mfa" },
    { expiresIn: MFA_TOKEN_TTL },
  );
  return enrolado ? { mfaRequired: true, mfaToken } : { mfaSetupRequired: true, mfaToken };
}

async function verificarAsercionLogin(
  response: AuthenticationResponseJSON,
  cred: { credentialId: string; publicKey: string; counter: bigint; transports: string | null },
  expectedChallenge: string,
): Promise<{ newCounter: number; userVerified: boolean } | null> {
  const { rpID, origin } = rp();
  const trans = transportsToArray(cred.transports);
  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId,
        publicKey: new Uint8Array(Buffer.from(cred.publicKey, "base64url")),
        counter: Number(cred.counter),
        ...(trans ? { transports: trans } : {}),
      },
    });
    if (!verification.verified) return null;
    return {
      newCounter: verification.authenticationInfo.newCounter,
      userVerified: verification.authenticationInfo.userVerified,
    };
  } catch {
    return null;
  }
}

async function emitirSesionTenant(
  reply: FastifyReply,
  principal: ReturnType<typeof buildTenantPrincipal>,
) {
  await updateLastLogin(principal.tenantSlug, principal.id, undefined);
  const permissions = principal.isOwner ? ["*"] : principal.permissions;
  const accessToken = await reply.jwtSign({
    sub: principal.id,
    email: principal.email,
    tenantSlug: principal.tenantSlug,
    permissions,
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
      permissions,
    },
    tenant: { slug: principal.tenantSlug },
  };
}

const regOptionsSchema = z.object({
  password: z.string().min(1),
  totp: z.string().optional(),
});
const regVerifySchema = z.object({
  response: z.unknown(),
  challengeToken: z.string(),
  deviceName: z.string().max(60).optional(),
});
const loginOptSchema = z.object({ tenantSlug: z.string().min(3).max(40) });
const loginVerifySchema = z.object({
  tenantSlug: z.string().min(3).max(40),
  response: z.unknown(),
  challengeToken: z.string(),
});

const passkeyRoutes: FastifyPluginAsync = async (app) => {
  // ── Registro (el usuario ya está dentro): asocia una huella a su cuenta ──
  app.post(
    "/passkey/register/options",
    { preHandler: app.authenticateTenant },
    async (req, reply) => {
      if (req.user.kind !== "tenant") return unauthorized(reply);
      const { sub: usuarioId, tenantSlug, email } = req.user;
      const { password, totp } = regOptionsSchema.parse(req.body);
      const tenantPrisma = getTenantClient(tenantSlug);
      const u = await tenantPrisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { passwordHash: true },
      });
      if (!u || !(await verifyPassword(password, u.passwordHash))) {
        return unauthorized(reply, "Contraseña incorrecta");
      }
      const mfa = await loadTenantUserMfa(tenantPrisma, { id: usuarioId });
      if (mfa?.mfaEnabled && mfa.mfaSecret && mfa.mfaVerifiedAt) {
        const totpStep = totp ? verifyTenantTotpStep(totp, mfa.mfaSecret) : null;
        const totpOk =
          totpStep !== null && (mfa.mfaLastStep === null || totpStep > mfa.mfaLastStep);
        if (!totpOk || totpStep === null) {
          return unauthorized(reply, "Código incorrecto");
        }
        await recordTenantMfaStep(tenantPrisma, usuarioId, totpStep);
      }
      const existentes = await app.masterPrisma.webauthnCredential.findMany({
        where: { tenantSlug, usuarioId },
        select: { credentialId: true, transports: true },
      });
      const { rpID, rpName } = rp();
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: email,
        userID: new TextEncoder().encode(usuarioId),
        attestationType: "none",
        excludeCredentials: existentes.map((c) => {
          const t = transportsToArray(c.transports);
          return { id: c.credentialId, ...(t ? { transports: t } : {}) };
        }),
        authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      });
      const challengeToken = firmarChallenge({
        jti: randomUUID(),
        challenge: options.challenge,
        purpose: "reg",
        tenantSlug,
        usuarioId,
        exp: Date.now() + CHALLENGE_TTL_MS,
      });
      return { options, challengeToken };
    },
  );

  app.post(
    "/passkey/register/verify",
    { preHandler: app.authenticateTenant },
    async (req, reply) => {
      if (req.user.kind !== "tenant") return unauthorized(reply);
      const body = regVerifySchema.parse(req.body);
      const ch = verificarChallenge(body.challengeToken);
      if (
        !ch ||
        ch.purpose !== "reg" ||
        ch.tenantSlug !== req.user.tenantSlug ||
        ch.usuarioId !== req.user.sub
      ) {
        return reply
          .code(400)
          .send({ statusCode: 400, error: "Bad Request", message: "Challenge inválido" });
      }
      const { rpID, origin } = rp();
      try {
        const verification = await verifyRegistrationResponse({
          response: body.response as RegistrationResponseJSON,
          expectedChallenge: ch.challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
        });
        if (!verification.verified || !verification.registrationInfo) {
          return reply
            .code(400)
            .send({ statusCode: 400, error: "Bad Request", message: "Credencial no verificada" });
        }
        if (!(await consumirChallenge(app.masterPrisma, ch.jti, ch.exp))) {
          return reply
            .code(400)
            .send({ statusCode: 400, error: "Bad Request", message: "Challenge inválido" });
        }
        const cred = verification.registrationInfo.credential;
        await app.masterPrisma.webauthnCredential.create({
          data: {
            tenantSlug: req.user.tenantSlug,
            usuarioId: req.user.sub,
            credentialId: cred.id,
            publicKey: Buffer.from(cred.publicKey).toString("base64url"),
            counter: BigInt(cred.counter),
            transports: cred.transports?.join(",") ?? null,
            deviceName: body.deviceName ?? null,
          },
        });
        return { ok: true };
      } catch {
        return reply.code(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "No se pudo registrar la huella",
        });
      }
    },
  );

  // ── Login con huella (público) ──
  app.post("/passkey/login/options", async (req) => {
    const { tenantSlug } = loginOptSchema.parse(req.body);
    const { rpID } = rp();
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: [],
    });
    const challengeToken = firmarChallenge({
      jti: randomUUID(),
      challenge: options.challenge,
      purpose: "login",
      tenantSlug,
      exp: Date.now() + CHALLENGE_TTL_MS,
    });
    return { options, challengeToken };
  });

  app.post(
    "/passkey/login/verify",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = loginVerifySchema.parse(req.body);
      const ch = verificarChallenge(body.challengeToken);
      if (!ch || ch.purpose !== "login" || ch.tenantSlug !== body.tenantSlug) {
        return unauthorized(reply);
      }
      const response = body.response as AuthenticationResponseJSON;
      const cred = await app.masterPrisma.webauthnCredential.findUnique({
        where: { credentialId: response.id },
      });
      if (!cred || cred.tenantSlug !== body.tenantSlug) return unauthorized(reply);

      const asercion = await verificarAsercionLogin(response, cred, ch.challenge);
      if (!asercion) return unauthorized(reply);

      if (!(await consumirChallenge(app.masterPrisma, ch.jti, ch.exp))) {
        return unauthorized(reply);
      }

      await app.masterPrisma.webauthnCredential.update({
        where: { id: cred.id },
        data: { counter: BigInt(asercion.newCounter), lastUsedAt: new Date() },
      });

      const tenant = await findTenantBySlug(body.tenantSlug, app.masterPrisma);
      if (!tenant || tenant.status === "cancelled") return unauthorized(reply);
      const tenantPrisma = getTenantClient(body.tenantSlug);
      const user = await loadTenantUserById(cred.usuarioId, tenantPrisma);
      if (!user || !user.isActive) return unauthorized(reply);

      const principal = buildTenantPrincipal(user, body.tenantSlug);
      const requerido = await require2faParaUsuario(
        tenantPrisma,
        tenant.vertical,
        principal.roleCodes,
      );
      if (requerido && !asercion.userVerified) {
        return retarSegundoFactor(reply, tenantPrisma, principal, body.tenantSlug);
      }

      return emitirSesionTenant(reply, principal);
    },
  );

  // ── Gestión de huellas del propio usuario (Seguridad) ──
  app.get("/passkey/list", { preHandler: app.authenticateTenant }, async (req, reply) => {
    if (req.user.kind !== "tenant") return unauthorized(reply);
    return app.masterPrisma.webauthnCredential.findMany({
      where: { tenantSlug: req.user.tenantSlug, usuarioId: req.user.sub },
      select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.delete("/passkey/:id", { preHandler: app.authenticateTenant }, async (req, reply) => {
    if (req.user.kind !== "tenant") return unauthorized(reply);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await app.masterPrisma.webauthnCredential.deleteMany({
      where: { id, tenantSlug: req.user.tenantSlug, usuarioId: req.user.sub },
    });
    return { ok: true };
  });
};

export default passkeyRoutes;
