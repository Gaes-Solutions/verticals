import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAdmin } from "./helpers.js";

describe("tenants module", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildTestApp();
    const auth = await loginAdmin(app);
    token = auth.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /tenants", () => {
    it("rechaza sin auth (401)", async () => {
      const res = await app.inject({ method: "GET", url: "/tenants" });
      expect(res.statusCode).toBe(401);
    });

    it("lista tenants existentes", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/tenants",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });
  });

  describe("GET /tenants/:slug", () => {
    it("404 si slug no existe", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/tenants/noexiste-test-slug",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /tenants", () => {
    it("rechaza body inválido (400)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/tenants",
        headers: { authorization: `Bearer ${token}` },
        payload: { slug: "BadSlug!", name: "x", planCode: "free" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rechaza plan inexistente (500 con mensaje)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/tenants",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          slug: "test-no-plan",
          name: "Test no plan",
          planCode: "no-existe-este-plan",
        },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("crea tenant con slug nuevo (201) y schema postgres", async () => {
      const slug = `test-${Date.now().toString(36)}`;
      const res = await app.inject({
        method: "POST",
        url: "/tenants",
        headers: { authorization: `Bearer ${token}` },
        payload: { slug, name: "Test Tenant", planCode: "free" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { slug: string; schemaName: string; status: string };
      expect(body.slug).toBe(slug);
      expect(body.schemaName).toBe(`tenant_${slug.replace(/-/g, "_")}`);
      expect(body.status).toBe("trial");

      const detail = await app.inject({
        method: "GET",
        url: `/tenants/${slug}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(detail.statusCode).toBe(200);
    });

    it("rechaza slug duplicado (409 conflict)", async () => {
      const slug = `test-dup-${Date.now().toString(36)}`;
      const first = await app.inject({
        method: "POST",
        url: "/tenants",
        headers: { authorization: `Bearer ${token}` },
        payload: { slug, name: "First", planCode: "free" },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: "/tenants",
        headers: { authorization: `Bearer ${token}` },
        payload: { slug, name: "Second", planCode: "free" },
      });
      expect(second.statusCode).toBe(409);
    });
  });
});
