import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";
const slug = "test-retail-role-matrix";
const roles = ["dueno", "gerente", "cajero", "vendedor", "almacen", "contador_interno"] as const;
type Role = (typeof roles)[number];
let app: FastifyInstance;
const users = {} as Record<Role, { id: string; token: string }>;
const auth = (role: Role) => ({ authorization: `Bearer ${users[role].token}` });
beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(slug);
  for (const role of roles) {
    const email = `${role}-matrix@example.invalid`;
    const user = await createTenantUser(slug, {
      email,
      password: "RoleMatrixQA!2026",
      rolCodigo: role,
    });
    const session = await loginTenantUser(app, slug, email, "RoleMatrixQA!2026");
    users[role] = { id: user.id, token: session.accessToken };
  }
});
afterAll(async () => {
  await app?.close();
});
describe("retail users: least privilege and immediate revocation", () => {
  it.each(roles)("%s can read only its functional areas", async (role) => {
    const manager = role === "dueno" || role === "gerente";
    const cases: [string, boolean][] = [
      ["/t/productos", true],
      ["/t/usuarios", manager],
      ["/t/roles", manager],
      ["/t/ecommerce/config", manager],
      ["/t/reportes/resumen", manager || role === "contador_interno"],
      ["/billing/me", role === "dueno"],
    ];
    for (const [url, allowed] of cases) {
      const res = await app.inject({ method: "GET", url, headers: auth(role) });
      expect(res.statusCode, `${role} ${url}: ${res.body}`).toBe(
        allowed ? 200 : url.startsWith("/billing/") ? 401 : 403,
      );
    }
    expect(
      (await app.inject({ method: "GET", url: "/admin/tenants", headers: auth(role) })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/cliente-portal/me", headers: auth(role) }))
        .statusCode,
    ).toBe(401);
  });
  it.each(roles)("%s can create products only when its job requires it", async (role) => {
    const res = await app.inject({
      method: "POST",
      url: "/t/productos",
      headers: auth(role),
      payload: {
        nombre: `QA ${role}`,
        skuPadre: `MATRIX-${role}`,
        precioBase: "10",
        aplicaIva: false,
      },
    });
    expect(res.statusCode, res.body).toBe(
      ["dueno", "gerente", "almacen"].includes(role) ? 201 : 403,
    );
  });
  it("manager cannot grant itself owner or reset the owner's password", async () => {
    const client = getTenantClient(slug);
    const ownerRole = await client.rol.findUniqueOrThrow({ where: { codigo: "dueno" } });
    const grant = await app.inject({
      method: "POST",
      url: `/t/usuarios/${users.gerente.id}/roles`,
      headers: auth("gerente"),
      payload: { rolId: ownerRole.id },
    });
    expect(grant.statusCode).toBe(403);
    const reset = await app.inject({
      method: "POST",
      url: `/t/usuarios/${users.dueno.id}/reset-password`,
      headers: auth("gerente"),
      payload: { newPassword: "CannotResetOwner!2026" },
    });
    expect(reset.statusCode, reset.body).toBe(403);
  });
  it("an owner grant and its revocation apply to the cashier's existing session", async () => {
    const role = await app.inject({
      method: "POST",
      url: "/t/roles",
      headers: auth("dueno"),
      payload: {
        codigo: "qa-report-grant",
        nombre: "QA permiso adicional",
        permisos: ["reportes.ventas"],
      },
    });
    expect(role.statusCode, role.body).toBe(201);
    const roleId = role.json().id;
    const grant = await app.inject({
      method: "POST",
      url: `/t/usuarios/${users.cajero.id}/roles`,
      headers: auth("dueno"),
      payload: { rolId: roleId },
    });
    expect(grant.statusCode, grant.body).toBe(204);
    expect(
      (await app.inject({ method: "GET", url: "/t/reportes/resumen", headers: auth("cajero") }))
        .statusCode,
    ).toBe(200);
    const revoke = await app.inject({
      method: "DELETE",
      url: `/t/usuarios/${users.cajero.id}/roles/${roleId}`,
      headers: auth("dueno"),
    });
    expect(revoke.statusCode).toBe(204);
    expect(
      (await app.inject({ method: "GET", url: "/t/reportes/resumen", headers: auth("cajero") }))
        .statusCode,
    ).toBe(403);
  });
  it("deactivating an employee invalidates its already-issued access token", async () => {
    const client = getTenantClient(slug);
    await client.usuario.update({ where: { id: users.vendedor.id }, data: { isActive: false } });
    try {
      expect(
        (await app.inject({ method: "GET", url: "/t/productos", headers: auth("vendedor") }))
          .statusCode,
      ).toBe(401);
    } finally {
      await client.usuario.update({ where: { id: users.vendedor.id }, data: { isActive: true } });
    }
  });
});
