import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, cleanupTestTenants, createTenantUser, createTestTenant } from "./helpers.js";

const SLUG = "test-2fa";
const OWNER = { email: "owner-2fa@test.local", password: "Owner!2026x" };
const CAJERO = { email: "cajero-2fa@test.local", password: "Cajero!2026x" };

let app: FastifyInstance;
let ownerSecret = "";
let ownerBackupCodes: string[] = [];

beforeAll(async () => {
  await cleanupTestTenants();
  app = await buildTestApp();
  await createTestTenant(SLUG);
  await createTenantUser(SLUG, { ...OWNER, rolCodigo: "dueno", nombre: "Dueño 2FA" });
  await createTenantUser(SLUG, { ...CAJERO, rolCodigo: "cajero", nombre: "Cajero 2FA" });
});

afterAll(async () => {
  await cleanupTestTenants();
  if (app) await app.close();
});

function login(email: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/auth/tenant/login",
    payload: { tenantSlug: SLUG, email, password },
  });
}

/** Token del dueño resolviendo el reto 2FA si ya lo tiene activo. */
async function ownerToken(): Promise<string> {
  const l = await login(OWNER.email, OWNER.password);
  const body = l.json() as { accessToken?: string; mfaToken?: string };
  if (body.accessToken) return body.accessToken;
  const res = await app.inject({
    method: "POST",
    url: "/auth/tenant/mfa/verify",
    headers: { authorization: `Bearer ${body.mfaToken}` },
    payload: { code: authenticator.generate(ownerSecret) },
  });
  return (res.json() as { accessToken: string }).accessToken;
}

describe("tenant 2FA — opt-in self-service", () => {
  let token: string;

  it("sin 2FA: login entrega sesión directa", async () => {
    const res = await login(OWNER.email, OWNER.password);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken?: string; mfaRequired?: boolean };
    expect(body.accessToken).toBeTruthy();
    expect(body.mfaRequired).toBeUndefined();
    token = body.accessToken as string;
  });

  it("estado inicial: deshabilitado y no requerido", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/tenant/mfa/estado",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ enabled: false, requerido: false });
  });

  it("enroll → confirm activa el 2FA y entrega códigos de respaldo", async () => {
    const enroll = await app.inject({
      method: "POST",
      url: "/auth/tenant/mfa/enroll",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(enroll.statusCode).toBe(200);
    ownerSecret = (enroll.json() as { secret: string }).secret;
    expect(ownerSecret).toBeTruthy();

    const confirm = await app.inject({
      method: "POST",
      url: "/auth/tenant/mfa/enroll/confirm",
      headers: { authorization: `Bearer ${token}` },
      payload: { code: authenticator.generate(ownerSecret) },
    });
    expect(confirm.statusCode).toBe(200);
    ownerBackupCodes = (confirm.json() as { backupCodes: string[] }).backupCodes;
    expect(ownerBackupCodes).toHaveLength(10);
  });

  it("login posterior pide 2FA (mfaRequired)", async () => {
    const res = await login(OWNER.email, OWNER.password);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { mfaRequired?: boolean; mfaToken?: string };
    expect(body.mfaRequired).toBe(true);
    expect(body.mfaToken).toBeTruthy();
  });

  it("verify con TOTP correcto → sesión", async () => {
    const l = await login(OWNER.email, OWNER.password);
    const mfaToken = (l.json() as { mfaToken: string }).mfaToken;
    const res = await app.inject({
      method: "POST",
      url: "/auth/tenant/mfa/verify",
      headers: { authorization: `Bearer ${mfaToken}` },
      payload: { code: authenticator.generate(ownerSecret) },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { accessToken?: string }).accessToken).toBeTruthy();
  });

  it("verify con código incorrecto → 401", async () => {
    const l = await login(OWNER.email, OWNER.password);
    const mfaToken = (l.json() as { mfaToken: string }).mfaToken;
    const res = await app.inject({
      method: "POST",
      url: "/auth/tenant/mfa/verify",
      headers: { authorization: `Bearer ${mfaToken}` },
      payload: { code: "000000" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("verify con un código de respaldo → sesión, y es de un solo uso", async () => {
    const code = ownerBackupCodes[0] as string;
    const l = await login(OWNER.email, OWNER.password);
    const mfaToken = (l.json() as { mfaToken: string }).mfaToken;
    const res = await app.inject({
      method: "POST",
      url: "/auth/tenant/mfa/verify",
      headers: { authorization: `Bearer ${mfaToken}` },
      payload: { code },
    });
    expect(res.statusCode).toBe(200);

    const l2 = await login(OWNER.email, OWNER.password);
    const mfaToken2 = (l2.json() as { mfaToken: string }).mfaToken;
    const reuse = await app.inject({
      method: "POST",
      url: "/auth/tenant/mfa/verify",
      headers: { authorization: `Bearer ${mfaToken2}` },
      payload: { code },
    });
    expect(reuse.statusCode).toBe(401);
  });
});

describe("tenant 2FA — política del negocio", () => {
  it("el dueño exige 2FA al rol cajero → cajero sin 2FA debe enrolar", async () => {
    const token = await ownerToken();
    const put = await app.inject({
      method: "PUT",
      url: "/t/seguridad/politica-2fa",
      headers: { authorization: `Bearer ${token}` },
      payload: { require2faTodos: false, require2faRoles: ["cajero"] },
    });
    expect(put.statusCode).toBe(200);

    const res = await login(CAJERO.email, CAJERO.password);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { mfaSetupRequired?: boolean; mfaToken?: string };
    expect(body.mfaSetupRequired).toBe(true);
    expect(body.mfaToken).toBeTruthy();
  });

  it("cajero enrola desde el mfaToken forzado (setup → activate)", async () => {
    const l = await login(CAJERO.email, CAJERO.password);
    const mfaToken = (l.json() as { mfaToken: string }).mfaToken;
    const setup = await app.inject({
      method: "POST",
      url: "/auth/tenant/mfa/setup",
      headers: { authorization: `Bearer ${mfaToken}` },
    });
    expect(setup.statusCode).toBe(200);
    const secret = (setup.json() as { secret: string }).secret;
    const activate = await app.inject({
      method: "POST",
      url: "/auth/tenant/mfa/activate",
      headers: { authorization: `Bearer ${mfaToken}` },
      payload: { code: authenticator.generate(secret) },
    });
    expect(activate.statusCode).toBe(200);
    const body = activate.json() as { accessToken?: string; backupCodes?: string[] };
    expect(body.accessToken).toBeTruthy();
    expect(body.backupCodes).toHaveLength(10);
  });

  it("dueño NO puede desactivar su 2FA si la política lo exige a su rol", async () => {
    // exigir a dueno también
    const token = await ownerToken();
    await app.inject({
      method: "PUT",
      url: "/t/seguridad/politica-2fa",
      headers: { authorization: `Bearer ${token}` },
      payload: { require2faTodos: false, require2faRoles: ["cajero", "dueno"] },
    });
    const token2 = await ownerToken();
    const res = await app.inject({
      method: "POST",
      url: "/auth/tenant/mfa/disable",
      headers: { authorization: `Bearer ${token2}` },
      payload: { password: OWNER.password },
    });
    expect(res.statusCode).toBe(409);
  });
});
