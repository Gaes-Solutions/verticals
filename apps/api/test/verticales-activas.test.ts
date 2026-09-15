import { masterPrisma } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VERTICALES } from "../src/lib/verticales.js";
import { buildTestApp } from "./helpers.js";

/**
 * Para el piloto, la instalación atiende solo Retail: lo de salud, abarrotes y
 * partners no debe ni cargarse. Sin configurar, todo sigue como siempre.
 */
const DE_OTROS_GIROS = [
  "/t/pacientes",
  "/t/mascotas",
  "/t/vacunaciones/catalogo",
  "/t/recargas/catalogo",
  "/partners",
];
const DE_RETAIL = ["/t/productos", "/t/ventas", "/t/ecommerce/config", "/t/clientes-b2b"];

let soloRetail: FastifyInstance;
let completa: FastifyInstance;

beforeAll(async () => {
  soloRetail = await buildTestApp({ VERTICALES_ACTIVAS: ["retail_mayoreo"] });
  completa = await buildTestApp();
});

afterAll(async () => {
  await soloRetail.close();
  await completa.close();
  await masterPrisma.tenant.deleteMany({ where: { slug: "test-giro-apagado" } });
});

const estado = async (app: FastifyInstance, url: string) =>
  (await app.inject({ method: "GET", url })).statusCode;

describe("instalación solo Retail", () => {
  it("ofrece solo el giro activo", async () => {
    const res = await soloRetail.inject({ method: "GET", url: "/public/verticales" });
    expect(res.json()).toEqual({ verticales: ["retail_mayoreo"] });
  });

  it("no carga módulos de salud, abarrotes ni partners", async () => {
    for (const url of DE_OTROS_GIROS) {
      expect(await estado(completa, url), `${url} existe en la instalación completa`).not.toBe(404);
      expect(await estado(soloRetail, url), url).toBe(404);
    }
  });

  it("Retail y mayoreo siguen completos", async () => {
    for (const url of DE_RETAIL) {
      expect(await estado(soloRetail, url), url).toBe(401);
    }
  });

  it("el registro rechaza un giro apagado sin crear el negocio", async () => {
    const res = await soloRetail.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        slug: "test-giro-apagado",
        name: "Clínica de prueba",
        vertical: "salud_vet",
        planCode: "free",
        billingEmail: "clinica-apagada@test.local",
        adminEmail: "clinica-apagada@test.local",
        adminPassword: "Prueba!2026",
        adminName: "Dra. Prueba",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(
      await masterPrisma.tenant.findUnique({ where: { slug: "test-giro-apagado" } }),
    ).toBeNull();
  });
});

describe("instalación sin configurar", () => {
  it("atiende todos los giros, como hasta ahora", async () => {
    const res = await completa.inject({ method: "GET", url: "/public/verticales" });
    expect(res.json()).toEqual({ verticales: [...VERTICALES] });
  });
});
