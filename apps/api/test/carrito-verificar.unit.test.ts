import type { TenantPrismaClient } from "@gaespos/db";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/modules/tenant/carrito/service.js", async (original) => ({
  ...(await original<typeof import("../src/modules/tenant/carrito/service.js")>()),
  calcularCarrito: vi.fn(),
}));
import routes from "../src/modules/tenant/carrito/routes.js";
import { calcularCarrito } from "../src/modules/tenant/carrito/service.js";
import { verificarCarrito } from "../src/modules/tenant/carrito/verificar-service.js";
const input = [
  { varianteId: "qa1", cantidad: 2 },
  { varianteId: "qa-private", cantidad: 1 },
];
function fixture(show = true) {
  const db = {
    productoVariante: { findMany: vi.fn().mockResolvedValue([{ id: "qa1" }]) },
    productoPublicado: { count: vi.fn().mockResolvedValue(1) },
    configTiendaEcommerce: {
      findFirst: vi.fn().mockResolvedValue({
        activa: true,
        mostrarInventarioPublico: show,
        bufferInventarioPublico: 1,
      }),
    },
    inventarioSucursal: {
      groupBy: vi
        .fn()
        .mockResolvedValue([{ varianteId: "qa1", _sum: { stockActual: 5, stockReservado: 1 } }]),
    },
  };
  vi.mocked(calcularCarrito).mockResolvedValue({
    items: [
      {
        varianteId: "qa1",
        cantidad: "2",
        nombre: "PRIVATE",
        precioUnitario: "25.5",
        subtotal: "51",
      },
    ],
    subtotal: "51",
    total: "51",
  });
  return { db, client: db as unknown as TenantPrismaClient };
}
beforeEach(() => vi.resetAllMocks());
describe("read-only storefront cart check", () => {
  it("uses only public active variants and the existing live pricing engine", async () => {
    const f = fixture();
    const result = await verificarCarrito(f.client, "user-qa", input);
    expect(result).toEqual({
      items: [
        { ...input[0], estado: "publicado", precio: "25.5" },
        { ...input[1], estado: "no_publicado", precio: null },
      ],
    });
    expect(calcularCarrito).toHaveBeenCalledWith(f.client, "user-qa", [input[0]]);
    expect(f.db.productoVariante.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["qa1", "qa-private"] },
        isActive: true,
        archivedAt: null,
        producto: {
          isActive: true,
          isVisiblePublico: true,
          archivedAt: null,
          productoPublicado: { is: { isPublicado: true } },
        },
      },
      select: { id: true },
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("subtracts reserved stock and the configured public buffer without exposing quantities", async () => {
    const f = fixture();
    f.db.inventarioSucursal.groupBy.mockResolvedValue([
      { varianteId: "qa1", _sum: { stockActual: 3, stockReservado: 1 } },
    ]);
    expect((await verificarCarrito(f.client, "user-qa", input)).items[0]?.estado).toBe(
      "insuficiente",
    );
  });
  it("keeps exact fractional stock at the requested quantity", async () => {
    const f = fixture();
    f.db.configTiendaEcommerce.findFirst.mockResolvedValue({
      activa: true,
      mostrarInventarioPublico: true,
      bufferInventarioPublico: 0,
    });
    f.db.inventarioSucursal.groupBy.mockResolvedValue([
      { varianteId: "qa1", _sum: { stockActual: 1, stockReservado: 0.9 } },
    ]);
    expect(
      (await verificarCarrito(f.client, "user-qa", [{ varianteId: "qa1", cantidad: 0.1 }])).items[0]
        ?.estado,
    ).toBe("publicado");
  });
  it("treats missing public inventory as insufficient", async () => {
    const f = fixture();
    f.db.inventarioSucursal.groupBy.mockResolvedValue([]);
    expect((await verificarCarrito(f.client, "user-qa", input)).items[0]?.estado).toBe(
      "insuficiente",
    );
  });
  it("does not query or reveal inventory when the shop hides it", async () => {
    const f = fixture(false);
    expect((await verificarCarrito(f.client, "user-qa", input)).items[0]?.estado).toBe("publicado");
    expect(f.db.inventarioSucursal.groupBy).not.toHaveBeenCalled();
  });
  it("never calls the price engine for unpublished or nonexistent variants", async () => {
    const f = fixture();
    f.db.productoVariante.findMany.mockResolvedValue([]);
    expect(
      (await verificarCarrito(f.client, "user-qa", input)).items.every((i) => i.precio === null),
    ).toBe(true);
    expect(calcularCarrito).not.toHaveBeenCalled();
    expect(f.db.inventarioSucursal.groupBy).not.toHaveBeenCalled();
  });
  it.each(
    [
      [],
      [input[0], input[0]],
      [{ varianteId: "../private", cantidad: 1 }],
      [{ varianteId: "qa1", cantidad: 0.0001 }],
    ].map((items) => ({ items })),
  )("HTTP rejects invalid selection %# before data reads", async ({ items }) => {
    const f = fixture();
    const app = Fastify();
    app.addHook("onRequest", async (req) => {
      Object.assign(req, { tenantPrisma: f.client, principal: { userId: "user-qa" } });
    });
    await app.register(routes);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/carrito/verificar",
        payload: { items },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(f.db.productoVariante.findMany).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("HTTP rejects a closed shop without pricing or stock reads", async () => {
    const f = fixture();
    f.db.configTiendaEcommerce.findFirst.mockResolvedValue({
      activa: false,
      mostrarInventarioPublico: true,
      bufferInventarioPublico: 0,
    });
    const app = Fastify();
    app.addHook("onRequest", async (req) => {
      Object.assign(req, { tenantPrisma: f.client, principal: { userId: "user-qa" } });
    });
    await app.register(routes);
    try {
      expect(
        (await app.inject({ method: "POST", url: "/carrito/verificar", payload: { items: input } }))
          .statusCode,
      ).toBe(404);
      expect(calcularCarrito).not.toHaveBeenCalled();
      expect(f.db.productoVariante.findMany).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("HTTP valid check uses only reads, stripping extra price and account data", async () => {
    const f = fixture(false);
    const app = Fastify();
    app.addHook("onRequest", async (req) => {
      Object.assign(req, { tenantPrisma: f.client, principal: { userId: "user-qa" } });
    });
    await app.register(routes);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/carrito/verificar",
        payload: { items: input.map((i) => ({ ...i, precio: 0 })), clienteId: "OTHER" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(2);
      expect(calcularCarrito).toHaveBeenCalledWith(f.client, "user-qa", [input[0]]);
    } finally {
      await app.close();
    }
  });
});

describe("the read-only POST cannot exhaust a storefront checkout write budget", () => {
  it("shares the signed storefront read capacity while preserving write limits", async () => {
    const { default: jwt } = await import("@fastify/jwt");
    const { default: security } = await import("../src/plugins/security.js");
    const app = Fastify();
    await app.register(jwt, { secret: "qa-only-synthetic-signing-secret-123456789" });
    await app.register(security, {
      config: {
        NODE_ENV: "test",
        CORS_ORIGIN: "http://localhost",
        STOREFRONT_READ_RATE_LIMIT_MAX: 3,
        RATE_LIMIT_MAX: 1,
        RATE_LIMIT_WINDOW: "1 minute",
      } as import("../src/config.js").Config,
    });
    app.post("/t/tienda/carrito/verificar", async () => ({ ok: true }));
    app.get("/t/tienda/catalogo", async () => ({ ok: true }));
    app.post("/t/checkout", async () => ({ ok: true }));
    await app.ready();
    const token = app.jwt.sign({
      kind: "tienda_web",
      email: "qa-system@example.invalid",
      tenantSlug: "qa-tenant",
      sub: "qa-system",
    });
    const headers = { authorization: `Bearer ${token}` };
    try {
      for (let i = 0; i < 2; i++)
        expect(
          (await app.inject({ method: "POST", url: "/t/tienda/carrito/verificar", headers }))
            .statusCode,
        ).toBe(200);
      expect(
        (await app.inject({ method: "GET", url: "/t/tienda/catalogo", headers })).statusCode,
      ).toBe(200);
      expect(
        (await app.inject({ method: "POST", url: "/t/tienda/carrito/verificar", headers }))
          .statusCode,
      ).toBe(429);
      expect((await app.inject({ method: "POST", url: "/t/checkout", headers })).statusCode).toBe(
        200,
      );
      expect((await app.inject({ method: "POST", url: "/t/checkout", headers })).statusCode).toBe(
        429,
      );
      // Unsigned callers keep the existing IP limit, including this endpoint.
      expect(
        (await app.inject({ method: "POST", url: "/t/tienda/carrito/verificar" })).statusCode,
      ).toBe(200);
      expect(
        (await app.inject({ method: "POST", url: "/t/tienda/carrito/verificar" })).statusCode,
      ).toBe(429);
    } finally {
      await app.close();
    }
  });
});
