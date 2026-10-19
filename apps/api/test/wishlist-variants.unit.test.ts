import type { TenantPrismaClient } from "@gaespos/db";
import { describe, expect, it, vi } from "vitest";
// Reload the subject after the integration setup's buildApp imports, so the
// local database boundary remains mocked in both isolated and complete runs.
vi.hoisted(() => vi.resetModules());
vi.mock("@gaespos/db", () => ({ getTenantClient: vi.fn(), masterPrisma: {} }));
import { getMiWishlist } from "../src/modules/cliente-portal/service.js";
describe("wishlist option selection", () => {
  it.each([0, 1, 2])(
    "%i variants only permits direct add for an unambiguous variant",
    async (count) => {
      const findMany = vi.fn().mockResolvedValue([
        {
          id: "p1",
          tituloPublico: "Producto",
          slugSeo: "producto",
          precioPublicoOverride: null,
          fotosArray: [],
          producto: {
            variantes: Array.from({ length: count }, (_, i) => ({
              id: `v${i}`,
              precioBase: "10",
            })),
          },
        },
      ]);
      const client = {
        wishlist: { findFirst: vi.fn().mockResolvedValue({ id: "wish" }) },
        wishlistItem: {
          findMany: vi.fn().mockResolvedValue([{ id: "w1", productoPublicadoId: "p1" }]),
        },
        productoPublicado: { findMany },
      } as unknown as TenantPrismaClient;
      const [row] = await getMiWishlist(client, "buyer");
      expect(row?.varianteId).toBe(count === 1 ? "v0" : null);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            producto: {
              select: { variantes: { select: { id: true, precioBase: true }, take: 2 } },
            },
          }),
        }),
      );
    },
  );
});
