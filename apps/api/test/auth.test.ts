import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, buildTestApp, loginAdmin } from "./helpers.js";

describe("auth module", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /auth/login", () => {
    it("rechaza body inválido (400)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "not-email", password: "" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rechaza credenciales inválidas (401)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_ADMIN_EMAIL, password: "wrong" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({
        statusCode: 401,
        message: "Credenciales inválidas",
      });
    });

    it("rechaza email inexistente (401)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "noexiste@gaessoft.local", password: "x" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("login OK retorna access token + set-cookie HttpOnly Path=/auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { accessToken: string; user: { email: string } };
      expect(body.accessToken).toMatch(/^eyJ/);
      expect(body.user.email).toBe(TEST_ADMIN_EMAIL);

      const setCookie = res.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookieStr).toContain("gaespos_refresh=");
      expect(cookieStr).toContain("HttpOnly");
      expect(cookieStr).toContain("Path=/auth");
    });
  });

  describe("GET /auth/me", () => {
    it("rechaza sin token (401)", async () => {
      const res = await app.inject({ method: "GET", url: "/auth/me" });
      expect(res.statusCode).toBe(401);
    });

    it("rechaza con token inválido (401)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: "Bearer not.a.valid.token" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("retorna admin con token válido", async () => {
      const { accessToken } = await loginAdmin(app);
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        email: TEST_ADMIN_EMAIL,
        role: "superadmin",
      });
    });
  });

  describe("POST /auth/refresh", () => {
    it("rechaza sin cookie (401)", async () => {
      const res = await app.inject({ method: "POST", url: "/auth/refresh" });
      expect(res.statusCode).toBe(401);
    });

    it("retorna nuevo access token con refresh cookie válida", async () => {
      const { refreshCookie } = await loginAdmin(app);
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { cookie: refreshCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { accessToken: string };
      expect(body.accessToken).toMatch(/^eyJ/);
    });

    it("rota refresh: el viejo deja de servir tras usarlo", async () => {
      const { refreshCookie } = await loginAdmin(app);
      const first = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { cookie: refreshCookie },
      });
      expect(first.statusCode).toBe(200);

      const second = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { cookie: refreshCookie },
      });
      expect(second.statusCode).toBe(401);
    });
  });

  describe("POST /auth/logout", () => {
    it("revoca refresh y limpia cookie", async () => {
      const { refreshCookie } = await loginAdmin(app);
      const logout = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { cookie: refreshCookie },
      });
      expect(logout.statusCode).toBe(200);
      expect(logout.json()).toEqual({ ok: true });

      const refresh = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { cookie: refreshCookie },
      });
      expect(refresh.statusCode).toBe(401);
    });
  });
});
