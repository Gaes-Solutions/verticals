import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  productoCreateSchema,
  productoUpdateSchema,
} from "../../api/src/modules/tenant/productos/schemas.js";
import {
  type ProductDetail,
  canManageProducts,
  createProductBody,
  editablePrice,
  getProduct,
  newProductDraft,
  productDraft,
  productDto,
  saveProduct,
  updateProductBody,
} from "../src/services/productos";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("../src/lib/api", () => ({ api: mocks }));
const current: ProductDetail = {
  id: "p1",
  skuPadre: "SKU1",
  nombre: "Producto",
  descripcionCorta: null,
  tipoVenta: "unidad",
  tieneVariantes: false,
  aplicaIva: true,
  tasaIva: "16",
  isActive: true,
  variantes: [{ id: "v1", precioBase: "100", isDefault: true }],
};
const draft = () => ({
  ...newProductDraft(),
  nombre: " Café ",
  skuPadre: " SKU2 ",
  precioBase: "150.25",
});
beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.patch.mockReset();
});
describe("business basic product contract", () => {
  it("builds explicit basic creation accepted by the real API schema", () => {
    const body = createProductBody(draft());
    expect(productoCreateSchema.parse(body)).toMatchObject({
      nombre: "Café",
      skuPadre: "SKU2",
      precioBase: "150.25",
      tipoVenta: "unidad",
      tasaIva: "16",
    });
    expect(body).not.toHaveProperty("tenantSlug");
    expect(body).not.toHaveProperty("stockInicial");
  });
  it("distinguishes IVA0 from no IVA and includes optional barcode", () => {
    expect(createProductBody({ ...draft(), tasaIva: "0" })).toMatchObject({
      aplicaIva: true,
      tasaIva: "0",
    });
    expect(
      createProductBody({ ...draft(), aplicaIva: false, codigoBarras: " 123 " }),
    ).toMatchObject({ aplicaIva: false, tasaIva: "0", codigoBarras: "123" });
  });
  it.each(["", "-1", "NaN", "Infinity", "100abc", "1e3", "1.12345"])(
    "rejects invalid price %s before API",
    async (value) => {
      await expect(saveProduct({ ...draft(), precioBase: value }, null)).rejects.toThrow("precio");
      expect(mocks.post).not.toHaveBeenCalled();
    },
  );
  it("rejects blank names and excessive SKU", () => {
    expect(() => createProductBody({ ...draft(), nombre: "  " })).toThrow("Nombre");
    expect(() => createProductBody({ ...draft(), skuPadre: "x".repeat(61) })).toThrow("SKU");
  });
  it("updates only supported fields and never changes taxes, SKU or stock implicitly", () => {
    const body = updateProductBody({ ...draft(), aplicaIva: false, descripcionCorta: "" }, current);
    expect(productoUpdateSchema.parse(body)).toEqual({
      nombre: "Café",
      descripcionCorta: null,
      precioBase: "150.25",
    });
    expect(Object.keys(body).sort()).toEqual(["descripcionCorta", "nombre", "precioBase"]);
  });
  it("does not change one arbitrary variant price on a complex product", () => {
    const complex = {
      ...current,
      tieneVariantes: true,
      variantes: [...current.variantes, { id: "v2", precioBase: "200", isDefault: false }],
    };
    expect(editablePrice(complex)).toBe(false);
    expect(updateProductBody(draft(), complex)).not.toHaveProperty("precioBase");
  });
  it("DTO strips costs and unrelated private fields", () => {
    const dto = productDto({
      ...current,
      costo: "SECRET",
      variantes: [
        {
          ...current.variantes[0],
          id: "v1",
          precioBase: "100",
          isDefault: true,
          costoPromedio: "SECRET",
        },
      ],
    } as unknown as ProductDetail);
    expect(JSON.stringify(dto)).not.toContain("SECRET");
    expect(productDraft(dto).precioBase).toBe("100");
  });
  it("calls existing endpoints and encodes IDs", async () => {
    mocks.post.mockResolvedValue(current);
    mocks.patch.mockResolvedValue(current);
    mocks.get.mockResolvedValue(current);
    await saveProduct(draft(), null);
    expect(mocks.post).toHaveBeenCalledWith("/t/productos", createProductBody(draft()));
    await saveProduct(draft(), current);
    expect(mocks.patch).toHaveBeenCalledWith(
      "/t/productos/p1",
      updateProductBody(draft(), current),
    );
    await getProduct("p/a");
    expect(mocks.get).toHaveBeenCalledWith("/t/productos/p%2Fa");
  });
  it("write errors do not retry automatically", async () => {
    mocks.patch.mockRejectedValue(new Error("timeout"));
    await expect(saveProduct(draft(), current)).rejects.toThrow("timeout");
    expect(mocks.patch).toHaveBeenCalledTimes(1);
  });
  it("enforces distinct read/create/update visibility", () => {
    expect(canManageProducts(["productos.leer"], false, "crear")).toBe(false);
    expect(canManageProducts(["productos.crear"], false, "actualizar")).toBe(false);
    expect(canManageProducts(["productos.actualizar"], false, "actualizar")).toBe(true);
    expect(canManageProducts(["*"], false, "crear")).toBe(true);
  });
});
