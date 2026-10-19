import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The integration setup imports buildApp before test-local mocks. Reload those
// services so mocked tenant/data boundaries also apply in the complete suite.
vi.hoisted(() => vi.resetModules());

const mocks = vi.hoisted(() => ({
  tenant: vi.fn(),
  getTenantClient: vi.fn(),
  estado: vi.fn(),
  config: vi.fn(),
  catalogo: vi.fn(),
  categorias: vi.fn(),
  producto: vi.fn(),
  findProduct: vi.fn(),
}));
// No real DB or payment/email provider can be reached from this suite.
vi.mock("@gaespos/db", () => ({
  getTenantClient: mocks.getTenantClient,
  masterPrisma: { tenant: { findUnique: mocks.tenant } },
}));
vi.mock("../src/modules/tenant/ecommerce-config/estado-tienda.js", () => ({
  estadoTienda: mocks.estado,
}));
vi.mock("../src/modules/cliente-portal/comercio-service.js", () => ({
  configComercio: mocks.config,
  catalogoComercio: mocks.catalogo,
  categoriasComercio: mocks.categorias,
  productoComercio: mocks.producto,
}));
vi.mock("../src/modules/tenant/carrito/catalogo-service.js", () => ({
  ventaConfig: vi.fn().mockResolvedValue({}),
  enriquecerDetalle: vi.fn().mockResolvedValue({ precioDesde: "120.00" }),
  productosRelacionados: vi.fn().mockResolvedValue([]),
  listarCatalogo: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("../src/modules/tenant/carrito/recovery-service.js", () => ({
  correrRecoveryCarritos: vi.fn(),
}));
vi.mock("../src/modules/tenant/stock-alerts/service.js", () => ({ crearAvisoStock: vi.fn() }));
vi.mock("../src/modules/tenant/carrito/service.js", () => ({
  CarritoError: class extends Error {},
  calcularCarrito: vi.fn(),
}));
vi.mock("../src/modules/tenant/carrito/verificar-service.js", () => ({
  verificarCarrito: vi.fn(),
}));

import { solicitarResetContrasena } from "../src/modules/cliente-portal/password-reset-service.js";
import {
  loginCliente,
  registrarCliente,
  tenantClienteDe,
} from "../src/modules/cliente-portal/service.js";
import publicRoutes from "../src/modules/storefront/catalogo-publico.js";
import carritoRoutes from "../src/modules/tenant/carrito/routes.js";

const apps: FastifyInstance[] = [];
const publicPaths = [
  "/public/tiendas/gaesland",
  "/public/tiendas/gaesland/catalogo",
  "/public/tiendas/gaesland/categorias",
  "/public/tiendas/gaesland/productos/lampara",
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenant.mockResolvedValue({ status: "active" });
  mocks.getTenantClient.mockReturnValue({});
  mocks.estado.mockResolvedValue({ abierta: true, motivo: null });
  mocks.config.mockResolvedValue({ nombre: "Gaesland" });
  mocks.catalogo.mockResolvedValue({ items: [] });
  mocks.categorias.mockResolvedValue([]);
  mocks.producto.mockResolvedValue({ id: "public-product" });
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function publicApp() {
  const app = Fastify();
  apps.push(app);
  app.decorate("masterPrisma", {
    tenant: { findUnique: mocks.tenant },
  } as unknown as FastifyInstance["masterPrisma"]);
  await app.register(publicRoutes);
  return app;
}

describe("public storefront tenant availability", () => {
  it.each(["suspended", "archived", "unpaid", "cancelled", "unknown"])(
    "closes every public route for %s before accessing tenant data",
    async (status) => {
      mocks.tenant.mockResolvedValue({ status });
      const app = await publicApp();
      for (const url of publicPaths) {
        const response = await app.inject({ url });
        expect(response.statusCode).toBe(404);
        expect(response.json().message).toBe("Tienda no disponible");
      }
      expect(mocks.getTenantClient).not.toHaveBeenCalled();
      expect(mocks.estado).not.toHaveBeenCalled();
      expect(mocks.producto).not.toHaveBeenCalled();
    },
  );
  it.each(["trial", "active", "past_due"])(
    "keeps published shopping available during %s",
    async (status) => {
      mocks.tenant.mockResolvedValue({ status });
      const app = await publicApp();
      for (const url of publicPaths) expect((await app.inject({ url })).statusCode).toBe(200);
      expect(mocks.getTenantClient).toHaveBeenCalledWith("gaesland");
    },
  );
  it("does not resolve an unknown tenant to a database", async () => {
    mocks.tenant.mockResolvedValue(null);
    const app = await publicApp();
    for (const url of publicPaths) expect((await app.inject({ url })).statusCode).toBe(404);
    expect(mocks.getTenantClient).not.toHaveBeenCalled();
  });
  it("does not expose a shop the owner has closed", async () => {
    mocks.estado.mockResolvedValue({ abierta: false, motivo: "apagada" });
    const app = await publicApp();
    for (const url of publicPaths) expect((await app.inject({ url })).statusCode).toBe(404);
    for (const read of [mocks.config, mocks.catalogo, mocks.categorias, mocks.producto])
      expect(read).not.toHaveBeenCalled();
  });
});

describe("customer identity operations respect tenant availability", () => {
  it.each(["suspended", "archived", "unpaid", "cancelled", "unknown"])(
    "rejects registration, login and recovery for %s before opening the tenant DB",
    async (status) => {
      mocks.tenant.mockResolvedValue({ status });
      const email = {
        codigo: "mock" as const,
        enviar: vi.fn(),
        enviarPlantilla: vi.fn(),
      };
      for (const operation of [
        () =>
          registrarCliente({
            tenantSlug: "gaesland",
            nombre: "QA",
            email: "qa@example.invalid",
            password: "NotUsed2026!",
          }),
        () =>
          loginCliente({
            tenantSlug: "gaesland",
            email: "qa@example.invalid",
            password: "NotUsed2026!",
          }),
        () =>
          solicitarResetContrasena({ tenantSlug: "gaesland", email: "qa@example.invalid" }, email),
      ])
        await expect(operation()).rejects.toMatchObject({
          statusCode: 401,
          message: "Tienda no disponible",
        });
      expect(mocks.getTenantClient).not.toHaveBeenCalled();
      expect(email.enviar).not.toHaveBeenCalled();
      expect(email.enviarPlantilla).not.toHaveBeenCalled();
    },
  );
  it.each(["trial", "active", "past_due"])(
    "resolves %s using the exact requested tenant",
    async (status) => {
      mocks.tenant.mockResolvedValue({ status });
      const db = { tenant: "gaesland" };
      mocks.getTenantClient.mockReturnValue(db);
      expect(await tenantClienteDe("gaesland")).toBe(db);
      expect(mocks.tenant).toHaveBeenCalledWith({ where: { slug: "gaesland" } });
      expect(mocks.getTenantClient).toHaveBeenCalledWith("gaesland");
    },
  );
  it("does not open a tenant DB when the business does not exist", async () => {
    mocks.tenant.mockResolvedValue(null);
    await expect(tenantClienteDe("missing")).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.getTenantClient).not.toHaveBeenCalled();
  });
});

// Apply Prisma-style nested selects to a fixture containing deliberately private
// fields. This lets the real HTTP handler prove its public boundary without DB IO.
function selected(value: unknown, selection: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => selected(item, selection));
  const row = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(selection).flatMap(([key, spec]) => {
      if (spec === true) return [[key, row[key]]];
      const nested = (spec as { select?: Record<string, unknown> }).select;
      return nested ? [[key, selected(row[key], nested)]] : [];
    }),
  );
}

describe("storefront product detail only selects public relations", () => {
  it("keeps purchase/review fields while withholding cost, customer/order IDs and moderation", async () => {
    const raw = {
      id: "public-product",
      isPublicado: true,
      tituloPublico: "Lámpara",
      categoriaPublica: { id: "cat", nombre: "Hogar", slugSeo: "hogar", metadata: "private" },
      producto: {
        id: "product",
        tipoVenta: "unidad",
        unidadMedida: "pza",
        isActive: true,
        isVisiblePublico: true,
        archivedAt: null,
        metadata: "internal margin policy",
        variantes: [
          {
            id: "variant",
            precioBase: "120",
            nombreVariante: "Azul",
            opciones: { color: "Azul" },
            costoPromedio: "10",
            costoUltimo: "8",
            sku: "private-sku",
          },
        ],
      },
      resenas: [
        {
          id: "review",
          rating: 5,
          titulo: "Bien",
          comentario: "Funciona",
          imagenesArray: [],
          videoUrl: null,
          verificadaPorCompra: true,
          respuestaTienda: "Gracias",
          createdAt: new Date(),
          clienteId: "private-customer",
          pedidoId: "private-order",
          respondidaPorId: "private-employee",
          moderacionIaNota: "internal note",
        },
      ],
      preguntas: [
        {
          id: "question",
          pregunta: "¿Color?",
          respuesta: "Azul",
          respondidaAt: null,
          clienteId: "private-customer",
        },
      ],
    };
    mocks.findProduct.mockImplementation(async ({ include }) => ({
      ...raw,
      ...Object.fromEntries(
        Object.entries(include).map(([key, spec]) => {
          const select = (spec as { select?: Record<string, unknown> }).select;
          return [
            key,
            select ? selected(raw[key as keyof typeof raw], select) : raw[key as keyof typeof raw],
          ];
        }),
      ),
    }));
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      Object.assign(req, {
        user: { kind: "tienda_web" },
        tenantPrisma: { productoPublicado: { findUnique: mocks.findProduct } },
      });
    });
    await app.register(carritoRoutes);
    const response = await app.inject({ url: "/catalogo/lampara" });
    expect(response.statusCode).toBe(200);
    const product = response.json();
    expect(product.producto.tipoVenta).toBe("unidad");
    expect(product.producto.variantes).toEqual([
      { id: "variant", precioBase: "120", nombreVariante: "Azul", opciones: { color: "Azul" } },
    ]);
    expect(product.resenas[0]).toMatchObject({
      id: "review",
      rating: 5,
      respuestaTienda: "Gracias",
    });
    for (const forbidden of [
      "costoPromedio",
      "costoUltimo",
      "private-customer",
      "private-order",
      "private-employee",
      "moderacionIaNota",
      "internal margin policy",
      "private-sku",
    ])
      expect(response.body).not.toContain(forbidden);
    expect(product.preguntas[0]).toEqual({
      id: "question",
      pregunta: "¿Color?",
      respuesta: "Azul",
      respondidaAt: null,
    });
  });
});
