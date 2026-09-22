import { InMemoryStorage } from "@gaespos/sync-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = { valor: null as null | { storage: InMemoryStorage; grant: { catalogId: string } } };

vi.mock("../src/lib/local-catalog.js", () => ({
  desktopScope: () => ({
    apiOrigin: "http://local",
    tenantSlug: "t",
    userId: "u",
    sucursalId: "s",
    cajaId: "c",
  }),
  readCatalogAccess: async () => access.valor,
}));

const { calcularSinRed, cobrarSinRed, ventasPorConfirmar } = await import(
  "../src/lib/venta-sin-red.js"
);

const session = {
  identity: { id: "u", tenantSlug: "t", nombre: "Caja 1", permissions: ["ventas.crear"] },
  cajeroNombre: "Caja 1",
  sucursal: { id: "suc-1", codigo: "SUC", nombre: "Principal", isActive: true },
  caja: null,
} as never;

const filas: Record<string, Record<string, unknown>[]> = {
  producto: [
    {
      id: "prod-1",
      skuPadre: "GLOBO",
      nombre: "Globo metálico",
      categoriaId: null,
      aplicaIva: true,
      tasaIva: "16",
      aplicaIeps: false,
      tasaIeps: null,
      permiteDescuento: true,
    },
  ],
  variante: [
    {
      id: "var-1",
      productoId: "prod-1",
      sku: "GLOBO",
      nombreVariante: null,
      precioBase: "125.50",
    },
  ],
  lista_precio: [],
  lista_precio_item: [],
  precio_escalonado: [],
  regla_precio: [],
  promocion: [],
};

function storageConCatalogo() {
  const storage = new InMemoryStorage();
  storage.getCatalogRows = (async (entityType: string) =>
    filas[entityType] ?? []) as typeof storage.getCatalogRows;
  return storage;
}

const cobro = {
  lineas: [{ varianteId: "var-1", cantidad: "2" }],
  efectivo: "300.00",
  cajaId: "caja-1",
  aperturaId: "apertura-1",
};

beforeEach(() => {
  access.valor = null;
});

describe("cobro sin red en la caja", () => {
  it("no cobra si el equipo no tiene catálogo autorizado", async () => {
    await expect(cobrarSinRed(session, cobro)).rejects.toThrow("catálogo autorizado");
    expect(await ventasPorConfirmar(session)).toBe(0);
  });

  it("muestra el total calculado con el catálogo guardado antes de cobrar", async () => {
    access.valor = { storage: storageConCatalogo(), grant: { catalogId: "cat-1" } };
    const calculo = await calcularSinRed(session, { lineas: cobro.lineas });

    expect(calculo.total).toBe("251");
    expect(calculo.lineas).toHaveLength(1);
    expect(calculo.lineas[0]?.precioUnitario).toBe("125.5");
  });

  it("deja la venta en la cola con su turno y su desglose", async () => {
    const storage = storageConCatalogo();
    access.valor = { storage, grant: { catalogId: "cat-1" } };

    const venta = await cobrarSinRed(session, cobro);
    expect(venta.total).toBe("251");
    expect(venta.pendientes).toBe(1);

    const [pendiente] = await storage.getPending(5);
    expect(pendiente?.operation.payload).toMatchObject({
      cajaId: "caja-1",
      expectedAperturaId: "apertura-1",
      expectedTotal: "251",
      pagos: [{ metodo: "efectivo", monto: "300.00" }],
    });
    expect(await ventasPorConfirmar(session)).toBe(1);
  });

  it("no cobra un artículo que no está en el catálogo guardado", async () => {
    access.valor = { storage: storageConCatalogo(), grant: { catalogId: "cat-1" } };
    await expect(
      cobrarSinRed(session, { ...cobro, lineas: [{ varianteId: "otra", cantidad: "1" }] }),
    ).rejects.toThrow("no está en el catálogo");
  });

  it("no cobra si el efectivo no cubre el total", async () => {
    access.valor = { storage: storageConCatalogo(), grant: { catalogId: "cat-1" } };
    await expect(cobrarSinRed(session, { ...cobro, efectivo: "100.00" })).rejects.toThrow(
      "no cubre el total",
    );
  });
});
