import type { TenantPrismaClient } from "@gaespos/db";
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
// The integration setup imports buildApp and caches these services before this
// file's mocks are installed. Reload the graph so the unit doubles also apply
// when this file runs as part of the complete API suite.
vi.hoisted(() => vi.resetModules());
vi.mock("../src/modules/tenant/notificaciones/service.js", () => ({
  notificarCliente: vi.fn(),
  notificarUsuariosConPermiso: vi.fn(),
}));
vi.mock("../src/modules/tenant/push/service.js", () => ({ enviarPushCliente: vi.fn() }));
import carritoRoutes from "../src/modules/tenant/carrito/routes.js";
import { notificarUsuariosConPermiso } from "../src/modules/tenant/notificaciones/service.js";
import { crearPregunta } from "../src/modules/tenant/preguntas/service.js";
import { crearAvisoStock } from "../src/modules/tenant/stock-alerts/service.js";
const uuid = "55555555-5555-4555-a555-555555555555";
beforeEach(() => vi.resetAllMocks());
describe("question retries use the question primary key, no migration", () => {
  function fixture() {
    const rows = new Map<string, Record<string, unknown>>();
    const db = {
      productoPublicado: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "qa-product", isPublicado: true, tituloPublico: "QA" }),
      },
      preguntaProducto: {
        findUnique: vi.fn(
          async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const id = String(data.id ?? "legacy-id");
          if (rows.has(id)) throw { code: "P2002" };
          const row = { ...data, id };
          rows.set(id, row);
          return row;
        }),
      },
    };
    return { db: db as unknown as TenantPrismaClient, mock: db, rows };
  }
  it("replays a registered question without creating or notifying twice", async () => {
    const f = fixture();
    expect(
      await crearPregunta(
        f.db,
        "qa-product",
        "qa-customer",
        "QA",
        "  ¿De qué material es?  ",
        uuid,
      ),
    ).toEqual({ id: uuid });
    expect(
      await crearPregunta(f.db, "qa-product", "qa-customer", "QA", "¿De qué material es?", uuid),
    ).toEqual({ id: uuid });
    expect(f.rows.size).toBe(1);
    expect(f.mock.preguntaProducto.create).toHaveBeenCalledTimes(1);
    expect(notificarUsuariosConPermiso).toHaveBeenCalledTimes(1);
  });
  it("concurrent same-key requests recover the unique-key race", async () => {
    const f = fixture();
    const results = await Promise.all([
      crearPregunta(f.db, "qa-product", "qa-customer", "QA", "¿De qué material es?", uuid),
      crearPregunta(f.db, "qa-product", "qa-customer", "QA", "¿De qué material es?", uuid),
    ]);
    expect(results).toEqual([{ id: uuid }, { id: uuid }]);
    expect(f.rows.size).toBe(1);
    expect(notificarUsuariosConPermiso).toHaveBeenCalledTimes(1);
  });
  it.each([
    { clienteId: "other" },
    { productoPublicadoId: "other" },
    { pregunta: "otra pregunta" },
  ])("does not disclose or reuse another payload/owner %#", async (patch) => {
    const f = fixture();
    f.rows.set(uuid, {
      id: uuid,
      productoPublicadoId: "qa-product",
      clienteId: "qa-customer",
      pregunta: "¿De qué material es?",
      ...patch,
    });
    await expect(
      crearPregunta(f.db, "qa-product", "qa-customer", "QA", "¿De qué material es?", uuid),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(f.mock.preguntaProducto.create).not.toHaveBeenCalled();
    expect(notificarUsuariosConPermiso).not.toHaveBeenCalled();
  });
  it("recovery after notification failure acknowledges the persisted row without re-notifying", async () => {
    const f = fixture();
    vi.mocked(notificarUsuariosConPermiso).mockRejectedValueOnce(new Error("notification failure"));
    await expect(
      crearPregunta(f.db, "qa-product", "qa-customer", "QA", "¿De qué material es?", uuid),
    ).rejects.toThrow();
    expect(
      await crearPregunta(f.db, "qa-product", "qa-customer", "QA", "¿De qué material es?", uuid),
    ).toEqual({ id: uuid });
    expect(f.rows.size).toBe(1);
    expect(notificarUsuariosConPermiso).toHaveBeenCalledTimes(1);
  });
  it("retains legacy callers without a supplied id and rejects unpublished products", async () => {
    const f = fixture();
    expect(
      await crearPregunta(f.db, "qa-product", "qa-customer", "QA", "¿De qué material es?"),
    ).toEqual({ id: "legacy-id" });
    f.mock.productoPublicado.findUnique.mockResolvedValueOnce({
      id: "qa-product",
      isPublicado: false,
      tituloPublico: "QA",
    });
    await expect(
      crearPregunta(f.db, "qa-product", "qa-customer", "QA", "¿De qué material es?", uuid),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
describe("pending stock subscription locking", () => {
  it("locks before reading and creating, with literal email matching and ReadCommitted", async () => {
    const events: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async () => {
        events.push("lock");
      }),
      stockAlert: {
        findFirst: vi.fn(async () => {
          events.push("read");
          return null;
        }),
        create: vi.fn(async () => {
          events.push("create");
        }),
      },
    };
    const transaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx));
    await crearAvisoStock({ $transaction: transaction } as unknown as TenantPrismaClient, {
      productoPublicadoId: "qa-product",
      email: " Qa@Example.invalid ",
    });
    expect(events).toEqual(["lock", "read", "create"]);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted",
    });
    expect(tx.stockAlert.findFirst).toHaveBeenCalledWith({
      where: {
        productoPublicadoId: "qa-product",
        email: "Qa@Example.invalid",
        notificado: false,
      },
    });
    expect(tx.stockAlert.create).toHaveBeenCalledWith({
      data: { productoPublicadoId: "qa-product", email: "Qa@Example.invalid" },
    });
  });
  it("keeps underscores and recipient case literal rather than passing an ILIKE pattern", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const tx = { $executeRaw: vi.fn(), stockAlert: { findFirst, create: vi.fn() } };
    await crearAvisoStock(
      {
        $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(tx),
      } as unknown as TenantPrismaClient,
      { productoPublicadoId: "qa-product", email: "Qa_Recipient@example.invalid" },
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        productoPublicadoId: "qa-product",
        email: "Qa_Recipient@example.invalid",
        notificado: false,
      },
    });
  });
  it("existing pending alerts do not create another row", async () => {
    const tx = {
      $executeRaw: vi.fn(),
      stockAlert: { findFirst: vi.fn().mockResolvedValue({ id: "qa-existing" }), create: vi.fn() },
    };
    await crearAvisoStock(
      {
        $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(tx),
      } as unknown as TenantPrismaClient,
      { productoPublicadoId: "qa-product", email: "qa@example.invalid" },
    );
    expect(tx.stockAlert.create).not.toHaveBeenCalled();
  });
  it.each(["/avisos-stock", "/avisos-stock/registrar"])(
    "HTTP route %s rejects unpublished products before registering",
    async (path) => {
      const app = Fastify();
      const transaction = vi.fn();
      app.addHook("onRequest", async (req) => {
        req.tenantPrisma = {
          productoPublicado: { findUnique: async () => ({ id: "qa-product", isPublicado: false }) },
          $transaction: transaction,
        } as unknown as TenantPrismaClient;
      });
      await app.register(carritoRoutes, { prefix: "/store" });
      try {
        const res = await app.inject({
          method: "POST",
          url: `/store${path}`,
          payload: { productoPublicadoId: "qa-product", email: "qa@example.invalid" },
        });
        expect(res.statusCode).toBe(404);
        expect(transaction).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );
  it.each(["/avisos-stock", "/avisos-stock/registrar"])(
    "HTTP route %s confirms a published product with only the requested email",
    async (path) => {
      const app = Fastify();
      const create = vi.fn();
      const tx = { $executeRaw: vi.fn(), stockAlert: { findFirst: async () => null, create } };
      app.addHook("onRequest", async (req) => {
        req.tenantPrisma = {
          productoPublicado: { findUnique: async () => ({ id: "qa-product", isPublicado: true }) },
          $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(tx),
        } as unknown as TenantPrismaClient;
      });
      await app.register(carritoRoutes, { prefix: "/store" });
      try {
        const res = await app.inject({
          method: "POST",
          url: `/store${path}`,
          payload: {
            productoPublicadoId: "qa-product",
            email: " Qa@Example.invalid ",
            clienteId: "forged",
          },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json()).toEqual({ ok: true });
        expect(create).toHaveBeenCalledWith({
          data: { productoPublicadoId: "qa-product", email: "Qa@Example.invalid" },
        });
      } finally {
        await app.close();
      }
    },
  );
});
