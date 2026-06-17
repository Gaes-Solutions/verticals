import { getTenantClient, masterPrisma } from "@gaespos/db";
import { hash as argon2Hash } from "@node-rs/argon2";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, cleanupTestTenants, createTestTenant } from "./helpers.js";

const SUPER = { email: "super-admin@test.local", password: "ChangeMe!Super1" };
const SUPPORT = { email: "support-admin@test.local", password: "ChangeMe!Supp1" };

let app: FastifyInstance;
let superToken: string;
let supportToken: string;
let createdAdminId: string;

/** Corre el flujo password → MFA setup → activate y devuelve el access token. */
async function enrollAndLogin(creds: { email: string; password: string }): Promise<string> {
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: creds,
  });
  expect(login.statusCode).toBe(200);
  const mfaToken = login.json().mfaToken as string;
  expect(login.json().mfaSetupRequired).toBe(true);

  const setup = await app.inject({
    method: "POST",
    url: "/auth/mfa/setup",
    headers: { authorization: `Bearer ${mfaToken}` },
  });
  expect(setup.statusCode).toBe(200);
  const secret = setup.json().secret as string;
  expect(setup.json().otpauthUrl).toContain("otpauth://");

  const code = authenticator.generate(secret);
  const activate = await app.inject({
    method: "POST",
    url: "/auth/mfa/activate",
    headers: { authorization: `Bearer ${mfaToken}` },
    payload: { code },
  });
  expect(activate.statusCode).toBe(200);
  return activate.json().accessToken as string;
}

beforeAll(async () => {
  app = await buildTestApp();
  // Limpia restos de corridas previas y crea dos admins (superadmin + support).
  await masterPrisma.adminUser.deleteMany({
    where: { email: { in: [SUPER.email, SUPPORT.email] } },
  });
  await masterPrisma.adminUser.create({
    data: {
      email: SUPER.email,
      passwordHash: await argon2Hash(SUPER.password),
      name: "Super Test",
      role: "superadmin",
    },
  });
  await masterPrisma.adminUser.create({
    data: {
      email: SUPPORT.email,
      passwordHash: await argon2Hash(SUPPORT.password),
      name: "Support Test",
      role: "support",
    },
  });

  superToken = await enrollAndLogin(SUPER);
  supportToken = await enrollAndLogin(SUPPORT);
});

afterAll(async () => {
  if (createdAdminId) {
    await masterPrisma.adminUser.delete({ where: { id: createdAdminId } }).catch(() => undefined);
  }
  await masterPrisma.adminUser.deleteMany({
    where: { email: { in: [SUPER.email, SUPPORT.email] } },
  });
  if (app) await app.close();
});

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

describe("auth admin + MFA TOTP", () => {
  it("login con password incorrecta → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: SUPER.email, password: "incorrecta" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("logins posteriores piden verify (ya enrolado) y aceptan TOTP", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: SUPER,
    });
    expect(login.json().mfaRequired).toBe(true);
    const mfaToken = login.json().mfaToken as string;

    const admin = await masterPrisma.adminUser.findUniqueOrThrow({
      where: { email: SUPER.email },
    });
    const code = authenticator.generate(admin.mfaSecret as string);
    const verify = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      headers: auth(mfaToken),
      payload: { code },
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json().accessToken).toBeTruthy();
  });

  it("código TOTP incorrecto → 401", async () => {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: SUPER });
    const verify = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      headers: auth(login.json().mfaToken),
      payload: { code: "000000" },
    });
    expect(verify.statusCode).toBe(401);
  });

  it("GET /auth/me devuelve el admin logueado", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me", headers: auth(superToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe(SUPER.email);
    expect(res.json().role).toBe("superadmin");
  });

  it("endpoint admin sin token → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/metrics/dashboard" });
    expect(res.statusCode).toBe(401);
  });
});

describe("métricas SaaS", () => {
  it("dashboard ejecutivo devuelve KPIs agregados", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/metrics/dashboard",
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json();
    expect(d.negocio).toBeDefined();
    expect(d.tenants).toBeDefined();
    expect(d.alertas).toBeDefined();
  });
});

describe("billing-ops", () => {
  it("overview de cobranza", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/billing-ops/overview",
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("ingresosHoy");
  });

  it("lista facturas paginada", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/billing-ops/invoices?pageSize=10",
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().items)).toBe(true);
  });

  it("lista suscripciones", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/billing-ops/subscriptions",
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});

describe("audit log", () => {
  it("registra el login admin y es consultable", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/audit?action=admin.login",
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(1);
    expect(res.json().items[0].action).toBe("admin.login");
  });
});

describe("equipo (solo superadmin)", () => {
  it("support NO puede listar el equipo → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/team",
      headers: auth(supportToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it("superadmin lista el equipo", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/team", headers: auth(superToken) });
    expect(res.statusCode).toBe(200);
    const emails = (res.json() as Array<{ email: string }>).map((a) => a.email);
    expect(emails).toContain(SUPER.email);
  });

  it("superadmin crea un admin nuevo (queda auditado)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/team",
      headers: auth(superToken),
      payload: {
        email: "nuevo-admin@test.local",
        name: "Nuevo Admin",
        password: "ChangeMe!Nuevo1",
        role: "billing",
      },
    });
    expect(res.statusCode).toBe(201);
    createdAdminId = res.json().id;
    expect(res.json().role).toBe("billing");

    const audit = await app.inject({
      method: "GET",
      url: "/admin/audit?action=team.admin_created",
      headers: auth(superToken),
    });
    expect(audit.json().items.length).toBeGreaterThanOrEqual(1);
  });

  it("editar rol/activo del admin creado", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/team/${createdAdminId}`,
      headers: auth(superToken),
      payload: { role: "support", active: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("support");
    expect(res.json().active).toBe(false);
  });

  it("reset de password y de MFA", async () => {
    const pwd = await app.inject({
      method: "POST",
      url: `/admin/team/${createdAdminId}/reset-password`,
      headers: auth(superToken),
      payload: { password: "OtraPass!2026x" },
    });
    expect(pwd.statusCode).toBe(200);
    expect(pwd.json().ok).toBe(true);

    const mfa = await app.inject({
      method: "POST",
      url: `/admin/team/${createdAdminId}/reset-mfa`,
      headers: auth(superToken),
    });
    expect(mfa.statusCode).toBe(200);
    expect(mfa.json().ok).toBe(true);
  });
});

describe("clientes / alta de tenants", () => {
  const DUP_SLUG = "dup-tenant-test";

  afterAll(async () => {
    await masterPrisma.tenant.deleteMany({ where: { slug: DUP_SLUG } });
  });

  it("support NO puede crear cliente → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(supportToken),
      payload: {
        slug: "soporte-no-crea",
        name: "Soporte No Crea",
        planCode: "free",
        ownerEmail: "x@test.local",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("superadmin lista clientes y planes", async () => {
    const tenants = await app.inject({
      method: "GET",
      url: "/admin/tenants",
      headers: auth(superToken),
    });
    expect(tenants.statusCode).toBe(200);
    expect(Array.isArray(tenants.json())).toBe(true);

    const planes = await app.inject({
      method: "GET",
      url: "/admin/tenants/planes",
      headers: auth(superToken),
    });
    expect(planes.statusCode).toBe(200);
    expect(Array.isArray(planes.json())).toBe(true);
  });

  it("plan inexistente → 400 (antes de tocar el onboarding)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        slug: "zzz-plan-fantasma",
        name: "Plan Fantasma",
        planCode: "plan-que-no-existe",
        ownerEmail: "x@test.local",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("slug duplicado → 409", async () => {
    const plan = await masterPrisma.plan.findFirst({ where: { active: true } });
    expect(plan).toBeTruthy();
    await masterPrisma.tenant.create({
      data: {
        slug: DUP_SLUG,
        name: "Dup Tenant",
        schemaName: `tenant_${DUP_SLUG.replace(/-/g, "_")}`,
        planId: (plan as { id: string }).id,
        status: "trial",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        slug: DUP_SLUG,
        name: "Dup Tenant 2",
        planCode: (plan as { code: string }).code,
        ownerEmail: "x@test.local",
      },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("superadmin — códigos de respaldo 2FA", () => {
  const BK = { email: "backup-admin@test.local", password: "ChangeMe!Backup1" };
  let bkId = "";
  let backupCodes: string[] = [];

  beforeAll(async () => {
    await masterPrisma.adminUser.deleteMany({ where: { email: BK.email } });
    const a = await masterPrisma.adminUser.create({
      data: {
        email: BK.email,
        passwordHash: await argon2Hash(BK.password),
        name: "Backup Admin",
        role: "superadmin",
      },
    });
    bkId = a.id;
  });

  afterAll(async () => {
    if (bkId) await masterPrisma.adminUser.delete({ where: { id: bkId } }).catch(() => undefined);
  });

  it("al activar el MFA se entregan 10 códigos de respaldo", async () => {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: BK });
    const mfaToken = login.json().mfaToken as string;
    const setup = await app.inject({
      method: "POST",
      url: "/auth/mfa/setup",
      headers: auth(mfaToken),
    });
    const secret = setup.json().secret as string;
    const activate = await app.inject({
      method: "POST",
      url: "/auth/mfa/activate",
      headers: auth(mfaToken),
      payload: { code: authenticator.generate(secret) },
    });
    expect(activate.statusCode).toBe(200);
    backupCodes = activate.json().backupCodes as string[];
    expect(backupCodes).toHaveLength(10);
  });

  it("login con un código de respaldo funciona y luego ese código ya no", async () => {
    const code = backupCodes[0] as string;
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: BK });
    const verify = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      headers: auth(login.json().mfaToken as string),
      payload: { code },
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json().accessToken).toBeTruthy();

    const login2 = await app.inject({ method: "POST", url: "/auth/login", payload: BK });
    const reuse = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      headers: auth(login2.json().mfaToken as string),
      payload: { code },
    });
    expect(reuse.statusCode).toBe(401);
  });
});

describe("roles predefinidos (superadmin, por vertical + vínculo vivo)", () => {
  const SLUG = "test-plantillas";
  const codigos: string[] = [];

  beforeAll(async () => {
    await cleanupTestTenants();
    await createTestTenant(SLUG);
    await masterPrisma.tenant.update({
      where: { slug: SLUG },
      data: { vertical: "retail_mayoreo" as never },
    });
  });

  afterAll(async () => {
    await masterPrisma.rolePlantilla.deleteMany({ where: { codigo: { in: codigos } } });
    await cleanupTestTenants();
  });

  it("lista verticales y catálogo completo (mezclable)", async () => {
    const v = await app.inject({
      method: "GET",
      url: "/admin/roles-plantilla/verticales",
      headers: auth(superToken),
    });
    expect(v.statusCode).toBe(200);
    expect((v.json() as Array<{ value: string }>).map((x) => x.value)).toContain("salud_vet");

    const cat = await app.inject({
      method: "GET",
      url: "/admin/roles-plantilla/catalogo-permisos",
      headers: auth(superToken),
    });
    expect(cat.statusCode).toBe(200);
    const areas = (cat.json() as Array<{ area: string }>).map((a) => a.area);
    expect(areas).toEqual(expect.arrayContaining(["general", "tienda", "salud"]));
  });

  it("support NO puede crear rol predefinido (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/roles-plantilla",
      headers: auth(supportToken),
      payload: { vertical: "retail_mayoreo", codigo: "x", nombre: "X", permisos: [] },
    });
    expect(res.statusCode).toBe(403);
  });

  it("superadmin crea un rol predefinido y se PROPAGA a tenants de esa vertical", async () => {
    const codigo = "promotor-test";
    codigos.push(codigo);
    const res = await app.inject({
      method: "POST",
      url: "/admin/roles-plantilla",
      headers: auth(superToken),
      payload: {
        vertical: "retail_mayoreo",
        codigo,
        nombre: "Promotor",
        permisos: ["pos.usar", "ventas.crear"],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().tenantsAfectados).toBeGreaterThanOrEqual(1);

    // vínculo vivo: el rol aparece como preset en el schema del tenant retail
    const rol = await getTenantClient(SLUG).rol.findUnique({ where: { codigo } });
    expect(rol?.isPreset).toBe(true);
    expect(rol?.permisos).toEqual(["pos.usar", "ventas.crear"]);
  });

  it("rechaza permiso desconocido (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/roles-plantilla",
      headers: auth(superToken),
      payload: {
        vertical: "retail_mayoreo",
        codigo: "malo-test",
        nombre: "Malo",
        permisos: ["permiso.que.no.existe"],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
