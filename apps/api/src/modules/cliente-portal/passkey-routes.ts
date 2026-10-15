import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { MasterPrismaClient } from "@gaespos/db";
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ClientePortalError, loginCliente, tenantClienteDe } from "./service.js";

const input = z.object({
  origin: z.string().url().max(300),
  tenantSlug: z.string().min(1).max(60).optional(),
});
const proof = input.extend({ response: z.unknown(), challengeToken: z.string().min(1).max(4000) });
const challengeSchema = z.object({
  kind: z.literal("cliente_passkey_challenge"),
  aud: z.literal("cliente-passkey-v1"),
  jti: z.string().uuid(),
  challenge: z.string().min(1),
  purpose: z.enum(["register", "login"]),
  tenantSlug: z.string(),
  origin: z.string(),
  rpId: z.string(),
  clienteId: z.string().optional(),
  exp: z.number(),
});
const fail = () =>
  new ClientePortalError(401, "No pudimos verificar la llave de acceso. Vuelve a intentarlo.");
const transports = (csv: string | null) =>
  (csv ? csv.split(",") : []) as AuthenticatorTransportFuture[];
export const customerHandle = (tenant: string, customer: string) =>
  createHash("sha256")
    .update(JSON.stringify([tenant, customer]))
    .digest();

/** Exact origin + tenant binding, including verified custom domains. No Host-derived trust. */
export async function customerRp(master: MasterPrismaClient, origin: string, tenantSlug: string) {
  const u = new URL(origin);
  if (u.origin !== origin || u.username || u.password) throw fail();
  let configured: Record<string, string> = {};
  try {
    configured = JSON.parse(process.env.CUSTOMER_WEBAUTHN_ORIGINS ?? "{}");
  } catch {
    throw fail();
  }
  const allowed = configured[origin] === tenantSlug;
  const local =
    u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname) && allowed;
  if (u.protocol !== "https:" && !local) throw fail();
  if (!allowed) {
    const domain = await master.tiendaDominio.findUnique({ where: { host: u.hostname } });
    if (u.port || !domain?.verificado || domain.tenantSlug !== tenantSlug) throw fail();
  }
  return { origin, rpId: u.hostname };
}

const routes: FastifyPluginAsync<{ challengeSecret: string }> = async (app, opts) => {
  const secret = createHmac("sha256", opts.challengeSecret)
    .update("customer-passkey-challenges-v1")
    .digest();
  function sign(payload: Omit<z.infer<typeof challengeSchema>, "exp">) {
    const body = Buffer.from(
      JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 300 }),
    ).toString("base64url");
    return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
  }
  function readSigned(token: string) {
    const parts = token.split(".");
    if (parts.length !== 2) throw fail();
    const expected = createHmac("sha256", secret).update(parts[0]!).digest();
    const received = Buffer.from(parts[1]!, "base64url");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw fail();
    const result = challengeSchema.parse(
      JSON.parse(Buffer.from(parts[0]!, "base64url").toString()),
    );
    if (result.exp <= Date.now() / 1000) throw fail();
    return result;
  }
  const limited = { rateLimit: { max: 20, timeWindow: "1 minute" } };
  const authenticated = { preHandler: app.authenticateCliente, config: limited };
  async function principal(tenantSlug: string, clienteId: string) {
    const db = await tenantClienteDe(tenantSlug);
    const c = await db.cliente.findFirst({
      where: { id: clienteId, isActive: true, passwordHash: { not: null } },
    });
    if (!c?.emailPrincipal) throw fail();
    return { id: c.id, nombre: c.nombre, email: c.emailPrincipal };
  }
  async function consume(jti: string, exp: number) {
    const inserted = await app.masterPrisma.webauthnUsedChallenge.createMany({
      data: [{ id: jti, expiresAt: new Date(exp * 1000) }],
      skipDuplicates: true,
    });
    if (inserted.count !== 1) throw fail();
  }
  function readChallenge(
    token: string,
    purpose: "register" | "login",
    tenant: string,
    origin: string,
    customer?: string,
  ) {
    try {
      const c = readSigned(token);
      if (
        c.purpose !== purpose ||
        c.tenantSlug !== tenant ||
        c.origin !== origin ||
        c.clienteId !== customer
      )
        throw fail();
      return c;
    } catch {
      throw fail();
    }
  }
  // Keep error responses useful without leaking credential material or account existence.
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ClientePortalError)
      return reply.code(error.statusCode).send({ message: error.message });
    if (error instanceof z.ZodError)
      return reply.code(400).send({ message: "Revisa los datos y vuelve a intentarlo." });
    const status =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    if (status >= 400 && status < 500)
      return reply.code(status).send({
        message:
          status === 429
            ? "Demasiados intentos. Espera un momento y vuelve a intentarlo."
            : "Solicitud inválida.",
      });
    app.log.error({ err: error }, "Customer passkey operation failed");
    return reply
      .code(503)
      .send({ message: "No pudimos completar esta operación. Vuelve a intentarlo." });
  });
  app.post("/register-options", authenticated, async (req) => {
    if (req.user.kind !== "cliente") throw fail();
    const body = input.extend({ password: z.string().min(1).max(120) }).parse(req.body);
    const { tenantSlug, sub } = req.user;
    const rp = await customerRp(app.masterPrisma, body.origin, tenantSlug);
    const c = await principal(tenantSlug, sub);
    const logged = await loginCliente({ tenantSlug, email: c.email, password: body.password });
    if (logged.id !== sub) throw fail();
    const existing = await app.masterPrisma.clientePasskey.findMany({
      where: { tenantSlug, clienteId: sub, rpId: rp.rpId },
    });
    if (existing.length >= 10)
      throw new ClientePortalError(
        409,
        "Ya tienes diez llaves. Elimina una antes de agregar otra.",
      );
    const options = await generateRegistrationOptions({
      rpID: rp.rpId,
      rpName: "Tu tienda · Cuenta",
      userID: customerHandle(tenantSlug, sub),
      userName: c.email,
      userDisplayName: c.nombre,
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      excludeCredentials: existing.map((x) => ({
        id: x.credentialId,
        transports: transports(x.transports),
      })),
    });
    const challengeToken = sign({
      kind: "cliente_passkey_challenge",
      aud: "cliente-passkey-v1",
      jti: randomUUID(),
      challenge: options.challenge,
      purpose: "register",
      tenantSlug,
      clienteId: sub,
      ...rp,
    });
    return { options, challengeToken };
  });
  app.post("/register-verify", authenticated, async (req) => {
    if (req.user.kind !== "cliente") throw fail();
    const body = proof.extend({ deviceName: z.string().trim().min(1).max(60) }).parse(req.body);
    const { tenantSlug, sub } = req.user;
    const rp = await customerRp(app.masterPrisma, body.origin, tenantSlug);
    const c = readChallenge(body.challengeToken, "register", tenantSlug, rp.origin, sub);
    if (c.rpId !== rp.rpId) throw fail();
    await principal(tenantSlug, sub);
    await consume(c.jti, c.exp);
    let result: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      result = await verifyRegistrationResponse({
        response: body.response as RegistrationResponseJSON,
        expectedChallenge: c.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpId,
        requireUserVerification: true,
      });
    } catch {
      throw fail();
    }
    if (!result.verified || !result.registrationInfo?.userVerified) throw fail();
    const credential = result.registrationInfo.credential;
    await app.masterPrisma.clientePasskey.create({
      data: {
        tenantSlug,
        clienteId: sub,
        rpId: rp.rpId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: BigInt(credential.counter),
        transports: credential.transports?.join(",") ?? null,
        deviceName: body.deviceName,
      },
    });
    return { ok: true };
  });
  app.post("/login-options", { config: limited }, async (req) => {
    const body = input.extend({ tenantSlug: z.string().min(1).max(60) }).parse(req.body);
    const rp = await customerRp(app.masterPrisma, body.origin, body.tenantSlug);
    await tenantClienteDe(body.tenantSlug);
    const options = await generateAuthenticationOptions({
      rpID: rp.rpId,
      userVerification: "required",
    });
    const challengeToken = sign({
      kind: "cliente_passkey_challenge",
      aud: "cliente-passkey-v1",
      jti: randomUUID(),
      challenge: options.challenge,
      purpose: "login",
      tenantSlug: body.tenantSlug,
      ...rp,
    });
    return { options, challengeToken };
  });
  app.post("/login-verify", { config: limited }, async (req, reply) => {
    const body = proof.extend({ tenantSlug: z.string().min(1).max(60) }).parse(req.body);
    const rp = await customerRp(app.masterPrisma, body.origin, body.tenantSlug);
    const c = readChallenge(body.challengeToken, "login", body.tenantSlug, rp.origin);
    if (c.rpId !== rp.rpId) throw fail();
    const response = body.response as AuthenticationResponseJSON;
    if (!response || typeof response.id !== "string" || !response.response) throw fail();
    const cred = await app.masterPrisma.clientePasskey.findUnique({
      where: { credentialId: response.id },
    });
    if (!cred || cred.tenantSlug !== body.tenantSlug || cred.rpId !== rp.rpId) throw fail();
    if (
      response.response.userHandle &&
      response.response.userHandle !==
        customerHandle(cred.tenantSlug, cred.clienteId).toString("base64url")
    )
      throw fail();
    const user = await principal(cred.tenantSlug, cred.clienteId);
    await consume(c.jti, c.exp);
    let result: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: c.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpId,
        credential: {
          id: cred.credentialId,
          publicKey: new Uint8Array(Buffer.from(cred.publicKey, "base64url")),
          counter: Number(cred.counter),
          transports: transports(cred.transports),
        },
        requireUserVerification: true,
      });
    } catch {
      throw fail();
    }
    if (!result.verified || !result.authenticationInfo.userVerified) throw fail();
    const updated = await app.masterPrisma.clientePasskey.updateMany({
      where: { id: cred.id, counter: cred.counter },
      data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: new Date() },
    });
    if (updated.count !== 1) throw fail();
    const accessToken = await reply.jwtSign({
      sub: user.id,
      email: user.email,
      tenantSlug: cred.tenantSlug,
      kind: "cliente",
    });
    return { accessToken, cliente: user };
  });
  app.post("/list", authenticated, async (req) => {
    if (req.user.kind !== "cliente") throw fail();
    const body = input.parse(req.body);
    const rp = await customerRp(app.masterPrisma, body.origin, req.user.tenantSlug);
    await principal(req.user.tenantSlug, req.user.sub);
    return app.masterPrisma.clientePasskey.findMany({
      where: { tenantSlug: req.user.tenantSlug, clienteId: req.user.sub, rpId: rp.rpId },
      select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "desc" },
    });
  });
  app.post("/remove", authenticated, async (req) => {
    if (req.user.kind !== "cliente") throw fail();
    const body = input.extend({ id: z.string().min(1) }).parse(req.body);
    const rp = await customerRp(app.masterPrisma, body.origin, req.user.tenantSlug);
    await principal(req.user.tenantSlug, req.user.sub);
    const deleted = await app.masterPrisma.clientePasskey.deleteMany({
      where: {
        id: body.id,
        tenantSlug: req.user.tenantSlug,
        clienteId: req.user.sub,
        rpId: rp.rpId,
      },
    });
    if (deleted.count !== 1) throw new ClientePortalError(404, "La llave ya no está disponible.");
    return { ok: true };
  });
};
export default routes;
