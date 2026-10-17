import type { TenantPrismaClient } from "@gaespos/db";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/modules/tenant/carrito/service.js", async (original) => ({
  ...(await original<typeof import("../src/modules/tenant/carrito/service.js")>()),
  calcularCarrito: vi.fn().mockResolvedValue({ items: [], subtotal: "100.00", total: "100.00" }),
}));
import carritoRoutes from "../src/modules/tenant/carrito/routes.js";
describe("guest cart coupon intent through actual HTTP route", () => {
  it.each([
    { input: undefined, expected: "OLD10" },
    { input: "", expected: null },
    { input: "NEW10", expected: "NEW10" },
  ])(
    "omitted preserves, explicit empty clears, and a code replaces",
    async ({ input, expected }) => {
      const app = Fastify();
      let row: Record<string, unknown> = { id: "qa-cart", cuponCodigo: "OLD10" };
      const db = {
        carritoEcommerce: {
          findFirst: async () => row,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            row = { ...row, ...data };
            return row;
          },
        },
      };
      app.addHook("onRequest", async (req) => {
        req.tenantPrisma = db as unknown as TenantPrismaClient;
        req.principal = { userId: "qa-customer" } as typeof req.principal;
      });
      await app.register(carritoRoutes, { prefix: "/cart" });
      try {
        const res = await app.inject({
          method: "POST",
          url: "/cart/",
          payload: {
            sessionIdAnonimo: "qa-session",
            canal: "web",
            items: [{ varianteId: "qa-variant", cantidad: 1 }],
            ...(input !== undefined ? { cuponCodigo: input } : {}),
          },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().cuponCodigo).toBe(expected);
        expect(row.cuponCodigo).toBe(expected);
      } finally {
        await app.close();
      }
    },
  );
});
