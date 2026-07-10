import {
  createTenant,
  disconnectAllTenantClients,
  getTenantClient,
  masterPrisma,
} from "@gaespos/db";
import { hash as argon2Hash } from "@node-rs/argon2";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { Client } from "pg";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";

export const TEST_ADMIN_EMAIL = "admin@gaessoft.local";
export const TEST_ADMIN_PASSWORD = "ChangeMe!2026";
// Secret TOTP fijo para tests: todos los archivos lo fijan idéntico sobre el
// admin sembrado, así el login MFA es determinístico aunque corran en paralelo.
export const TEST_ADMIN_MFA_SECRET = "JBSWY3DPEHPK3PXP";

export const TEST_TENANT_PREFIX = "test-";

export function makeTestConfig(overrides: Partial<Config> = {}): Config {
  const baseUrl = process.env.DATABASE_URL_MASTER;
  if (!baseUrl) {
    throw new Error("DATABASE_URL_MASTER must be set for tests");
  }
  return {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 0,
    LOG_LEVEL: "fatal",
    DATABASE_URL_MASTER: baseUrl,
    DATABASE_URL_TENANT: process.env.DATABASE_URL_TENANT ?? baseUrl,
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6380",
    JWT_SECRET: "test-jwt-secret-must-be-at-least-32-chars-long",
    JWT_REFRESH_SECRET: "test-refresh-secret-must-be-at-least-32-chars-long",
    COOKIE_SECRET: "test-cookie-secret-must-be-at-least-32-chars-long",
    ACCESS_TOKEN_TTL_MIN: 15,
    REFRESH_TOKEN_TTL_DAYS: 30,
    CORS_ORIGIN: "http://localhost:5173",
    RATE_LIMIT_MAX: 100000,
    RATE_LIMIT_WINDOW: "1 minute",
    FLOWS_SCHEDULER_ENABLED: false,
    FLOWS_RUN_INTERVAL_MIN: 360,
    RECORDATORIOS_SCHEDULER_ENABLED: false,
    RECORDATORIOS_RUN_INTERVAL_MIN: 60,
    PUBLIC_BASE_URL: "http://localhost:3000",
    ...overrides,
  };
}

export async function buildTestApp(
  overrides: Partial<Config> = {},
  opts: Parameters<typeof buildApp>[1] = {},
): Promise<FastifyInstance> {
  const config = makeTestConfig(overrides);
  const app = await buildApp(config, opts);
  await app.ready();
  return app;
}

export interface LoggedInAdmin {
  accessToken: string;
  refreshCookie: string;
  userId: string;
}

export async function loginAdmin(
  app: FastifyInstance,
  email: string = TEST_ADMIN_EMAIL,
  password: string = TEST_ADMIN_PASSWORD,
): Promise<LoggedInAdmin> {
  // El admin se autentica con password + TOTP. Fijamos un secret conocido y ya
  // verificado para que el login sea de un paso (password → verify) en tests.
  await masterPrisma.adminUser.update({
    where: { email },
    data: { mfaSecret: TEST_ADMIN_MFA_SECRET, mfaVerifiedAt: new Date() },
  });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const mfaToken = (login.json() as { mfaToken: string }).mfaToken;

  const res = await app.inject({
    method: "POST",
    url: "/auth/mfa/verify",
    headers: { authorization: `Bearer ${mfaToken}` },
    payload: { code: authenticator.generate(TEST_ADMIN_MFA_SECRET) },
  });
  if (res.statusCode !== 200) {
    throw new Error(`mfa verify failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as { accessToken: string; user: { id: string } };
  const setCookie = res.headers["set-cookie"];
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!cookieStr) throw new Error("login: missing set-cookie");
  const refreshCookie = cookieStr.split(";")[0];
  if (!refreshCookie) throw new Error("login: malformed cookie");
  return { accessToken: body.accessToken, refreshCookie, userId: body.user.id };
}

export async function cleanupTestTenants(): Promise<void> {
  const tenants = await masterPrisma.tenant.findMany({
    where: { slug: { startsWith: TEST_TENANT_PREFIX } },
  });
  if (tenants.length === 0) return;

  const baseUrl = process.env.DATABASE_URL_MASTER;
  if (!baseUrl) throw new Error("DATABASE_URL_MASTER not set");

  const pg = new Client({ connectionString: baseUrl });
  await pg.connect();
  try {
    for (const t of tenants) {
      await pg.query(`DROP SCHEMA IF EXISTS "${t.schemaName}" CASCADE`);
    }
  } finally {
    await pg.end();
  }

  await masterPrisma.tenant.deleteMany({
    where: { slug: { startsWith: TEST_TENANT_PREFIX } },
  });
}

export async function cleanupTestRefreshTokens(): Promise<void> {
  const admin = await masterPrisma.adminUser.findUnique({
    where: { email: TEST_ADMIN_EMAIL },
  });
  if (!admin) return;
  await masterPrisma.refreshToken.deleteMany({ where: { adminUserId: admin.id } });
}

export async function disconnectTenantPool(): Promise<void> {
  await disconnectAllTenantClients();
}

export interface CreatedTestTenant {
  slug: string;
  name: string;
}

export async function createTestTenant(
  slug: string,
  name = `Test ${slug}`,
  planCode = "free",
): Promise<CreatedTestTenant> {
  if (!slug.startsWith(TEST_TENANT_PREFIX)) {
    throw new Error(`Test tenant slug must start with "${TEST_TENANT_PREFIX}"`);
  }
  await createTenant({ slug, name, planCode });
  return { slug, name };
}

export interface CreatedTenantUser {
  id: string;
  email: string;
  password: string;
}

export async function createTenantUser(
  tenantSlug: string,
  opts: { email: string; password: string; rolCodigo: string; nombre?: string },
): Promise<CreatedTenantUser> {
  const client = getTenantClient(tenantSlug);
  const rol = await client.rol.findUnique({ where: { codigo: opts.rolCodigo } });
  if (!rol) {
    throw new Error(`Rol "${opts.rolCodigo}" no encontrado en tenant "${tenantSlug}"`);
  }
  const passwordHash = await argon2Hash(opts.password);
  const usuario = await client.usuario.create({
    data: {
      email: opts.email,
      passwordHash,
      nombre: opts.nombre ?? "Test",
      tipoUsuario: "empleado",
      roles: { create: [{ rolId: rol.id }] },
    },
  });
  return { id: usuario.id, email: opts.email, password: opts.password };
}

export interface LoggedInTenantUser {
  accessToken: string;
  userId: string;
  permissions: string[];
}

export async function loginTenantUser(
  app: FastifyInstance,
  tenantSlug: string,
  email: string,
  password: string,
): Promise<LoggedInTenantUser> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/tenant/login",
    payload: { tenantSlug, email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`tenant login failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as {
    accessToken: string;
    user: { id: string; permissions: string[] };
  };
  return {
    accessToken: body.accessToken,
    userId: body.user.id,
    permissions: body.user.permissions,
  };
}
