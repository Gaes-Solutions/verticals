import { createHmac } from "node:crypto";
import { type Server, createServer } from "node:http";
import { getTenantClient, masterPrisma } from "@gaespos/db";
import { type Browser, type CDPSession, type Page, chromium } from "@playwright/test";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { customerRp } from "../src/modules/cliente-portal/passkey-routes.js";
import { buildTestApp, createTestTenant, makeTestConfig } from "./helpers.js";
const tenant = "test-passkeys-a";
const otherTenant = "test-passkeys-b";
let origin: string;
let app: FastifyInstance;
let token: string;
let other: string;
let id: string;
let server: Server;
let browser: Browser;
let page: Page;
let cdp: CDPSession;
let authenticator: string;
let credentialId: string;
const consumed: string[] = [];
const header = (t = token) => ({ authorization: `Bearer ${t}` });
const post = (action: string, payload: Record<string, unknown>, t?: string) =>
  app.inject({
    method: "POST",
    url: `/auth/cliente/passkey/${action}`,
    headers: header(t),
    payload,
  });
async function options() {
  const r = await post("register-options", { origin, password: "PasskeyQA2026!" });
  expect(r.statusCode).toBe(200);
  const data = r.json();
  consumed.push(
    JSON.parse(Buffer.from(data.challengeToken.split(".")[0], "base64url").toString()).jti,
  );
  return data;
}
async function loginOptions() {
  const r = await post("login-options", { origin, tenantSlug: tenant });
  expect(r.statusCode).toBe(200);
  const d = r.json();
  consumed.push(
    JSON.parse(Buffer.from(d.challengeToken.split(".")[0], "base64url").toString()).jti,
  );
  return d;
}
async function create(options: unknown) {
  return (await page.evaluate(
    `(async()=>{const c=await navigator.credentials.create({publicKey:PublicKeyCredential.parseCreationOptionsFromJSON(${JSON.stringify(options)})});return c.toJSON()})()`,
  )) as Record<string, unknown>;
}
async function assertion(options: unknown) {
  return (await page.evaluate(
    `(async()=>{const c=await navigator.credentials.get({publicKey:PublicKeyCredential.parseRequestOptionsFromJSON(${JSON.stringify(options)})});return c.toJSON()})()`,
  )) as {
    id: string;
    response: { signature: string; userHandle: string; authenticatorData: string };
  };
}
async function register() {
  const o = await options();
  const response = await create(o.options);
  credentialId = response.id as string;
  const r = await post("register-verify", {
    origin,
    response,
    challengeToken: o.challengeToken,
    deviceName: "Teléfono QA",
  });
  expect(r.statusCode).toBe(200);
  return { ...o, response };
}
beforeAll(async () => {
  server = createServer((_req, res) => res.end("<!doctype html><title>Passkey test</title>"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://localhost:${(server.address() as { port: number }).port}`;
  vi.stubEnv("CUSTOMER_WEBAUTHN_ORIGINS", JSON.stringify({ [origin]: tenant }));
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto(origin);
  cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  app = await buildTestApp();
  await createTestTenant(tenant, "Passkey QA");
  await createTestTenant(otherTenant, "Other QA");
  for (const email of ["passkey-a@example.invalid", "passkey-b@example.invalid"]) {
    const r = await app.inject({
      method: "POST",
      url: "/auth/cliente/registro",
      payload: { tenantSlug: tenant, nombre: "QA", email, password: "PasskeyQA2026!" },
    });
    expect(r.statusCode).toBe(201);
    if (!token) {
      token = r.json().accessToken;
      id = r.json().cliente.id;
    } else other = r.json().accessToken;
  }
});
beforeEach(async () => {
  if (authenticator)
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: authenticator });
  authenticator = (
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    })
  ).authenticatorId;
});
afterAll(async () => {
  await masterPrisma.clientePasskey.deleteMany({ where: { tenantSlug: tenant } });
  await masterPrisma.webauthnUsedChallenge.deleteMany({ where: { id: { in: consumed } } });
  await masterPrisma.tiendaDominio.deleteMany({ where: { host: "passkey-store.test" } });
  await app?.close();
  await browser?.close();
  if (server) await new Promise<void>((r) => server.close(() => r()));
  vi.unstubAllEnvs();
});
describe("real WebAuthn cryptography and customer isolation", () => {
  it("requires a customer session and password confirmation for enrollment", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/auth/cliente/passkey/register-options",
      payload: { origin, password: "PasskeyQA2026!" },
    });
    expect(r.statusCode).toBe(401);
    expect((await post("register-options", { origin, password: "wrong" })).statusCode).toBe(401);
  });
  it("requires user verification and a challenge cannot become an access token", async () => {
    const o = await options();
    expect(o.options.authenticatorSelection).toMatchObject({
      residentKey: "required",
      userVerification: "required",
    });
    expect((await loginOptions()).options.userVerification).toBe("required");
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/cliente-portal/me",
          headers: header(o.challengeToken),
        })
      ).statusCode,
    ).toBe(401);
  });
  it("rejects untrusted origins, altered tokens and enrollment into another account", async () => {
    expect(
      (
        await post("register-options", {
          origin: "https://attacker.example",
          password: "PasskeyQA2026!",
        })
      ).statusCode,
    ).toBe(401);
    const o = await options();
    const response = await create(o.options);
    const payload = { origin, challengeToken: o.challengeToken, response, deviceName: "Phone" };
    expect((await post("register-verify", payload, other)).statusCode).toBe(401);
    expect(
      (await post("register-verify", { ...payload, challengeToken: `${o.challengeToken}x` }))
        .statusCode,
    ).toBe(401);
  });
  it("rejects expired enrollment challenges", async () => {
    const o = await options();
    const p = JSON.parse(Buffer.from(o.challengeToken.split(".")[0], "base64url").toString());
    p.exp = Math.floor(Date.now() / 1000) - 1;
    const body = Buffer.from(JSON.stringify(p)).toString("base64url");
    const secret = createHmac("sha256", makeTestConfig().JWT_SECRET)
      .update("customer-passkey-challenges-v1")
      .digest();
    const expired = `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
    expect(
      (
        await post("register-verify", {
          origin,
          challengeToken: expired,
          response: await create(o.options),
          deviceName: "Phone",
        })
      ).statusCode,
    ).toBe(401);
  });
  it("rejects enrollment data with the user-verification flag removed", async () => {
    const o = await options();
    const response = await create(o.options);
    const registration = response.response as { attestationObject: string };
    const decoded = isoCBOR.decodeFirst<Map<string, unknown>>(
      new Uint8Array(Buffer.from(registration.attestationObject, "base64url")),
    );
    const authData = decoded.get("authData") as Uint8Array;
    authData[32] = authData[32]! & ~0x04;
    registration.attestationObject = Buffer.from(
      isoCBOR.encode(decoded as Parameters<typeof isoCBOR.encode>[0]),
    ).toString("base64url");
    expect(
      (
        await post("register-verify", {
          origin,
          challengeToken: o.challengeToken,
          response,
          deviceName: "Unverified",
        })
      ).statusCode,
    ).toBe(401);
  });
  it("accepts a real browser credential once and lists only this customer's metadata", async () => {
    const o = await register();
    expect(
      (
        await post("register-verify", {
          origin,
          response: o.response,
          challengeToken: o.challengeToken,
          deviceName: "Phone",
        })
      ).statusCode,
    ).toBe(401);
    const list = await post("list", { origin });
    expect(list.statusCode).toBe(200);
    expect(list.json().length).toBeGreaterThan(0);
    expect(list.body).not.toMatch(/publicKey|credentialId|clienteId/);
    expect((await post("list", { origin }, other)).json()).toEqual([]);
    expect((await post("remove", { origin, id: list.json()[0].id }, other)).statusCode).toBe(404);
  });
  it("issues one session on concurrent replay and rejects assertions without UV", async () => {
    await register();
    const o = await loginOptions();
    const response = await assertion(o.options);
    const payload = { origin, tenantSlug: tenant, challengeToken: o.challengeToken, response };
    const results = await Promise.all([
      post("login-verify", payload),
      post("login-verify", payload),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    const success = results.find((r) => r.statusCode === 200)!;
    expect(app.jwt.verify<{ kind: string; sub: string }>(success.json().accessToken)).toMatchObject(
      { kind: "cliente", sub: id },
    );
    const next = await loginOptions();
    await cdp.send("WebAuthn.setUserVerified", {
      authenticatorId: authenticator,
      isUserVerified: false,
    });
    next.options.userVerification = "discouraged";
    expect(
      (
        await post("login-verify", {
          ...payload,
          challengeToken: next.challengeToken,
          response: await assertion(next.options),
        })
      ).statusCode,
    ).toBe(401);
  });
  it("rejects corrupted signatures and challenges from a different ceremony", async () => {
    await register();
    const first = await loginOptions();
    const response = await assertion(first.options);
    const second = await loginOptions();
    expect(
      (
        await post("login-verify", {
          origin,
          tenantSlug: tenant,
          challengeToken: second.challengeToken,
          response,
        })
      ).statusCode,
    ).toBe(401);
    response.response.signature = "AAAA";
    expect(
      (
        await post("login-verify", {
          origin,
          tenantSlug: tenant,
          challengeToken: first.challengeToken,
          response,
        })
      ).statusCode,
    ).toBe(401);
  });
  it("rejects another store and a deactivated customer", async () => {
    await register();
    const o = await loginOptions();
    const response = await assertion(o.options);
    const payload = { origin, tenantSlug: otherTenant, challengeToken: o.challengeToken, response };
    expect((await post("login-verify", payload)).statusCode).toBe(401);
    const db = getTenantClient(tenant);
    await db.cliente.update({ where: { id }, data: { isActive: false } });
    try {
      expect((await post("login-verify", { ...payload, tenantSlug: tenant })).statusCode).toBe(401);
    } finally {
      await db.cliente.update({ where: { id }, data: { isActive: true } });
    }
  });
  it("revocation prevents future authentication", async () => {
    await register();
    const key = await masterPrisma.clientePasskey.findUniqueOrThrow({ where: { credentialId } });
    expect((await post("remove", { origin, id: key.id })).statusCode).toBe(200);
    const o = await loginOptions();
    expect(
      (
        await post("login-verify", {
          origin,
          tenantSlug: tenant,
          challengeToken: o.challengeToken,
          response: await assertion(o.options),
        })
      ).statusCode,
    ).toBe(401);
  });
  it("accepts only verified custom domains for their matching store", async () => {
    await masterPrisma.tiendaDominio.create({
      data: { host: "passkey-store.test", tenantSlug: tenant, tipo: "propio", verificado: false },
    });
    await expect(customerRp(masterPrisma, "https://passkey-store.test", tenant)).rejects.toThrow();
    await masterPrisma.tiendaDominio.update({
      where: { host: "passkey-store.test" },
      data: { verificado: true },
    });
    expect(await customerRp(masterPrisma, "https://passkey-store.test", tenant)).toMatchObject({
      rpId: "passkey-store.test",
    });
    await expect(
      customerRp(masterPrisma, "https://passkey-store.test", otherTenant),
    ).rejects.toThrow();
    await expect(
      customerRp(masterPrisma, "https://passkey-store.test:8443", tenant),
    ).rejects.toThrow();
  });
});
