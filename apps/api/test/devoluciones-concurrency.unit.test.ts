import type { TenantPrismaClient } from "@gaespos/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/modules/tenant/notificaciones/service.js", () => ({
  notificarCliente: vi.fn(),
  notificarUsuariosConPermiso: vi.fn(),
}));
vi.mock("../src/modules/tenant/devoluciones/service.js", () => ({
  DevolucionError: class extends Error {},
  procesarDevolucion: vi.fn(),
}));
import { solicitarDevolucion } from "../src/modules/tenant/devoluciones-online/service.js";
import { notificarUsuariosConPermiso } from "../src/modules/tenant/notificaciones/service.js";
const input = {
  motivo: "defectuoso" as const,
  items: [{ varianteId: "v1", nombre: "Producto QA", cantidad: 1 }],
};
function fixture() {
  const rows: Array<{ id: string; folio: string; estado: string; pedidoEcommerceId: string }> = [];
  let tail = Promise.resolve();
  let locked = false;
  const tx = {
    $executeRaw: vi.fn(async (query: TemplateStringsArray) => {
      expect(query.join("")).toContain("pg_advisory_xact_lock");
      expect(query.join("")).toContain("current_schema()");
      locked = true;
    }),
    solicitudDevolucion: {
      findFirst: vi.fn(async (args: { where: { pedidoEcommerceId: string } }) => {
        expect(locked).toBe(true);
        return rows.find((r) => r.pedidoEcommerceId === args.where.pedidoEcommerceId) || null;
      }),
      count: vi.fn(async () => {
        expect(locked).toBe(true);
        return rows.length;
      }),
      create: vi.fn(async ({ data }: { data: { pedidoEcommerceId: string; folio: string } }) => {
        expect(locked).toBe(true);
        const row = { ...data, id: `s${rows.length + 1}`, estado: "solicitada" };
        rows.push(row);
        return row;
      }),
    },
  };
  const client = {
    pedidoEcommerce: {
      findUnique: vi.fn(async ({ where }: { where: { folioPublico: string } }) => ({
        id: where.folioPublico,
        clienteId: "buyer",
        statusPedido: "entregado",
        ventaIdGenerada: "sale",
        items: [],
      })),
    },
    ventaLinea: { findMany: vi.fn(async () => [{ varianteId: "v1", cantidad: 1 }]) },
    $transaction: vi.fn(async (action: (value: typeof tx) => Promise<unknown>) => {
      // Model the serialization provided by PostgreSQL's transaction lock.
      const previous = tail;
      let release = () => {};
      tail = new Promise<void>((r) => {
        release = r;
      });
      await previous;
      try {
        return await action(tx);
      } finally {
        locked = false;
        release();
      }
    }),
  };
  return { client: client as unknown as TenantPrismaClient, tx, rows };
}
describe("return-request transaction serialization", () => {
  beforeEach(() => vi.clearAllMocks());
  it("two concurrent submissions for one order create one request and notify once", async () => {
    const f = fixture();
    const results = await Promise.allSettled([
      solicitarDevolucion(f.client, "buyer", "QA-1", input),
      solicitarDevolucion(f.client, "buyer", "QA-1", input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { statusCode: 409 },
    });
    expect(f.rows).toHaveLength(1);
    expect(f.client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted",
    });
    expect(f.tx.solicitudDevolucion.create).toHaveBeenCalledTimes(1);
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(notificarUsuariosConPermiso).toHaveBeenCalledTimes(1);
  });
  it("different orders allocate distinct numeric folios inside the same tenant lock", async () => {
    const f = fixture();
    const rows = await Promise.all([
      solicitarDevolucion(f.client, "buyer", "QA-1", input),
      solicitarDevolucion(f.client, "buyer", "QA-2", input),
    ]);
    expect(rows.map((r) => r.folio)).toEqual(["SD-00001", "SD-00002"]);
  });
  it("failure to acquire the database lock cannot create or notify", async () => {
    const f = fixture();
    f.tx.$executeRaw.mockRejectedValueOnce(new Error("lock unavailable"));
    await expect(solicitarDevolucion(f.client, "buyer", "QA-1", input)).rejects.toThrow(
      "lock unavailable",
    );
    expect(f.tx.solicitudDevolucion.findFirst).not.toHaveBeenCalled();
    expect(f.tx.solicitudDevolucion.create).not.toHaveBeenCalled();
    expect(notificarUsuariosConPermiso).not.toHaveBeenCalled();
  });
  it("a foreign buyer cannot start a creation transaction", async () => {
    const f = fixture();
    await expect(solicitarDevolucion(f.client, "foreign", "QA-1", input)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(f.client.$transaction).not.toHaveBeenCalled();
  });
});
