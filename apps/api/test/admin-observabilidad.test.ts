import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAdmin } from "./helpers.js";

let app: FastifyInstance;
let adminToken: string;

beforeAll(async () => {
  app = await buildTestApp();
  adminToken = (await loginAdmin(app)).accessToken;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("observabilidad · salud", () => {
  it("devuelve alertas, servicios y resumen", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/observabilidad/salud",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const s = res.json() as {
      servicios: { db: string };
      alertas: Record<string, number>;
      resumen: { tenantsActivos: number };
      generadoEn: string;
    };
    expect(s.servicios.db).toBe("ok");
    expect(typeof s.alertas.facturasVencidas).toBe("number");
    expect(typeof s.alertas.comisionesPendientes).toBe("number");
    expect(typeof s.resumen.tenantsActivos).toBe("number");
    expect(s.generadoEn).toBeTruthy();
  });

  it("rechaza sin token con 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/observabilidad/salud" });
    expect(res.statusCode).toBe(401);
  });
});
