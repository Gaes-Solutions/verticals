import { masterPrisma } from "@gaespos/db";
import { hash } from "@node-rs/argon2";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, expect, it } from "vitest";
import { requiredPlatformPermission } from "../src/lib/platform-access.js";
import { buildTestApp } from "./helpers.js";

let app: FastifyInstance;
const accounts: Record<string, { id: string; token: string }> = {};
const emails = ["superadmin", "support", "billing"].map(
  (role) => `permission-test-${role}@example.invalid`,
);
const headers = (role: string) => ({ authorization: `Bearer ${accounts[role]?.token}` });
beforeAll(async () => {
  app = await buildTestApp();
  await masterPrisma.adminUser.deleteMany({ where: { email: { in: emails } } });
  for (const [index, role] of (["superadmin", "support", "billing"] as const).entries()) {
    const admin = await masterPrisma.adminUser.create({
      data: {
        email: emails[index]!,
        name: "Permissions QA",
        role,
        passwordHash: await hash("PermissionsQa2026!"),
      },
    });
    // Policy tests supply a signed full-session token; MFA ceremony has its own integration suite.
    accounts[role] = {
      id: admin.id,
      token: app.jwt.sign({ sub: admin.id, email: admin.email, kind: "admin", role }),
    };
  }
});
afterAll(async () => {
  await masterPrisma.adminUser.deleteMany({ where: { email: { in: emails } } });
  if (app) await app.close();
});
it.each([
  ["/admin/tenants", 200, 200],
  ["/admin/tenants/planes", 200, 200],
  ["/admin/billing-ops/overview", 403, 200],
  ["/admin/billing-ops/invoices", 403, 200],
  ["/admin/billing-ops/subscriptions", 403, 200],
  ["/admin/tenants/permission-test-missing/detalle", 403, 404],
  ["/admin/tickets", 200, 403],
  ["/admin/tickets/agentes", 200, 403],
  ["/admin/metrics/dashboard", 403, 403],
  ["/admin/metrics/uso-hoy", 403, 403],
  ["/admin/catalogo/planes", 403, 403],
  ["/admin/roles-plantilla", 403, 403],
  ["/admin/observabilidad/salud", 403, 403],
  ["/admin/audit", 403, 403],
  ["/admin/incidents", 403, 403],
  ["/admin/team", 403, 403],
  ["/admin/team/permissions", 403, 403],
  ["/tenants", 403, 403],
] as const)("minimum defaults protect GET %s", async (url, support, billing) => {
  expect((await app.inject({ method: "GET", url, headers: headers("support") })).statusCode).toBe(
    support,
  );
  expect((await app.inject({ method: "GET", url, headers: headers("billing") })).statusCode).toBe(
    billing,
  );
});
it("rejects billing jobs and cross-role writes before processing their body", async () => {
  for (const role of ["support", "billing"]) {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/admin/billing/run-dunning",
          headers: headers(role),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/admin/tenants",
          headers: headers(role),
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  }
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/admin/billing-ops/invoices/missing/reintentar",
        headers: headers("support"),
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/admin/tickets",
        headers: headers("billing"),
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
});
it("a superadmin grants and revokes extra access immediately for an existing JWT", async () => {
  const id = accounts.support!.id;
  let res = await app.inject({
    method: "PATCH",
    url: `/admin/team/${id}`,
    headers: headers("superadmin"),
    payload: { extraPermissions: ["billing.read"] },
  });
  expect(res.statusCode).toBe(200);
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/admin/billing-ops/invoices",
        headers: headers("support"),
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/admin/billing-ops/invoices/missing/reintentar",
        headers: headers("support"),
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
  res = await app.inject({ method: "GET", url: "/auth/me", headers: headers("support") });
  expect(res.json().permissions).toContain("billing.read");
  expect(res.json().permissions).not.toContain("billing.manage");
  res = await app.inject({
    method: "PATCH",
    url: `/admin/team/${id}`,
    headers: headers("superadmin"),
    payload: { extraPermissions: [] },
  });
  expect(res.statusCode).toBe(200);
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/admin/billing-ops/invoices",
        headers: headers("support"),
      })
    ).statusCode,
  ).toBe(403);
});
it("cannot self-grant, inject unknown permissions or smuggle permissions in a JWT", async () => {
  const id = accounts.support!.id;
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/admin/team/${id}`,
        headers: headers("support"),
        payload: { role: "superadmin", extraPermissions: ["billing.manage"] },
      })
    ).statusCode,
  ).toBe(403);
  for (const extraPermissions of [
    ["*"],
    ["team.manage"],
    ["not-a-permission"],
    ["billing.read", "billing.read"],
  ]) {
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/admin/team/${id}`,
          headers: headers("superadmin"),
          payload: { extraPermissions },
        })
      ).statusCode,
    ).toBe(400);
  }
  const forged = app.jwt.sign({
    sub: id,
    email: emails[1]!,
    kind: "admin",
    role: "superadmin",
    permissions: ["billing.manage", "*"],
  });
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/admin/team",
        headers: { authorization: `Bearer ${forged}` },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/admin/billing-ops/invoices",
        headers: { authorization: `Bearer ${forged}` },
      })
    ).statusCode,
  ).toBe(403);
});
it("management grants include reading, work through existing guards, and do not delegate team administration", async () => {
  const id = accounts.support!.id;
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/admin/team/${id}`,
        headers: headers("superadmin"),
        payload: { extraPermissions: ["catalog.manage"] },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/admin/catalogo/planes",
        headers: headers("support"),
      })
    ).statusCode,
  ).toBe(200);
  // Reaching validation (400) proves the former hard-role guard permits an explicit grant; no plan is created.
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/admin/catalogo/planes",
        headers: headers("support"),
        payload: {},
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await app.inject({ method: "GET", url: "/admin/team", headers: headers("support") }))
      .statusCode,
  ).toBe(403);
});
it("changing role clears previous grants; deactivation also invalidates a live access JWT", async () => {
  const id = accounts.support!.id;
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/admin/team/${id}`,
        headers: headers("superadmin"),
        payload: { role: "billing" },
      })
    ).statusCode,
  ).toBe(200);
  const me = await app.inject({ method: "GET", url: "/auth/me", headers: headers("support") });
  expect(me.json().role).toBe("billing");
  expect(me.json().permissions).not.toContain("catalog.manage");
  expect(
    (await app.inject({ method: "GET", url: "/admin/tickets", headers: headers("support") }))
      .statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/admin/team/${id}`,
        headers: headers("superadmin"),
        payload: { active: false },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await app.inject({ method: "GET", url: "/auth/me", headers: headers("support") })).statusCode,
  ).toBe(401);
  const events = await masterPrisma.auditLog.findMany({
    where: { resourceId: id, action: "team.admin_updated" },
  });
  expect(events.some((e) => JSON.stringify(e.metadata).includes("billing.read"))).toBe(true);
});
it("unknown routes and reserved control-plane operations have no delegable permission", () => {
  for (const route of [
    "/admin/future",
    "/admin/tenants/internal",
    "/admin/tenants-other",
    "/admin/tenants-other",
    "/admin/team",
    "/admin/audit",
    "/admin/incidents",
    "/admin/billing/run-dunning",
    "/tenants",
  ])
    expect(requiredPlatformPermission("GET", route)).toBeNull();
});

it("does not let a superadmin accidentally remove their own access", async () => {
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/admin/team/${accounts.superadmin!.id}`,
        headers: headers("superadmin"),
        payload: { role: "support" },
      })
    ).statusCode,
  ).toBe(409);
});

it("read-only endpoints cannot authorize a new write method by inheriting a module prefix", () => {
  expect(requiredPlatformPermission("POST", "/admin/observabilidad/salud")).toBeNull();
  expect(requiredPlatformPermission("POST", "/admin/metrics/dashboard")).toBeNull();
});
