import type { TenantPrismaClient } from "@gaespos/db";
import { describe, expect, it } from "vitest";
import { calcularPreview } from "../src/modules/tenant/listas-precios/preview-service.js";
import { previewSchema } from "../src/modules/tenant/listas-precios/schemas.js";
import { cantidadVentaSchema } from "../src/modules/tenant/ventas/quantity.js";
import { ventaPagoInputSchema, ventaPreviewSchema } from "../src/modules/tenant/ventas/schemas.js";
import { prepararVenta, previewVenta } from "../src/modules/tenant/ventas/service.js";
describe("sale quantities fit persisted Decimal(18,3)", () => {
  it.each(["0.001", "1.2300", "999999999999999.999", 1.125])(
    "accepts exactly representable %s",
    (value) => expect(cantidadVentaSchema.safeParse(value).success).toBe(true),
  );
  it.each(["0.0001", "1.0001", "1000000000000000", 0, -1, "NaN", "Infinity", 0.0001])(
    "rejects lossy or invalid %s",
    (value) => expect(cantidadVentaSchema.safeParse(value).success).toBe(false),
  );
  it("does not impose quantity precision on payment amounts", () =>
    expect(ventaPagoInputSchema.parse({ metodo: "efectivo", monto: "1.0001" }).monto).toBe(
      "1.0001",
    ));
  it("both public previews reject submill quantities", () => {
    const input = { sucursalId: "s", lineas: [{ varianteId: "v", cantidad: "0.0001" }] };
    expect(ventaPreviewSchema.safeParse(input).success).toBe(false);
    expect(previewSchema.safeParse(input).success).toBe(false);
  });
  it("all internal pricing entry points reject before any database access", async () => {
    const client = new Proxy(
      {},
      {
        get() {
          throw new Error("Unexpected database access");
        },
      },
    ) as TenantPrismaClient;
    const input = {
      sucursalId: "s",
      canal: "pos" as const,
      lineas: [{ varianteId: "v", cantidad: "0.0001" }],
      pagos: [{ metodo: "efectivo" as const, monto: "10" }],
    };
    await expect(prepararVenta(client, "u", input)).rejects.toMatchObject({ statusCode: 400 });
    await expect(previewVenta(client, "u", input)).rejects.toMatchObject({ statusCode: 400 });
    await expect(calcularPreview(client, "u", input)).rejects.toMatchObject({ statusCode: 400 });
  });
});
