import { ApiError, NetworkError } from "@gaespos/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const remote = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("../src/services/comercio", () => ({
  getActiveCart: remote.get,
  calculateCart: remote.save,
  abandonCart: remote.remove,
}));
import { accountCartKey, replaceQuantity, useCart, validQuantity } from "../src/lib/cart-store";
import { restoreRemoteCart, saveRemoteCart } from "../src/lib/cart-sync";
const owner = accountCartKey("shop-a", "customer-a");
const snapshot = {
  id: "cart-a",
  canal: "mobile" as const,
  moneda: "MXN",
  status: "activo",
  items: [
    {
      varianteId: "v-a",
      cantidad: "1",
      nombre: "Producto A",
      precioUnitario: "10",
      subtotal: "10",
    },
  ],
  total: "10",
  subtotal: "10",
  cuponCodigo: null,
};
beforeEach(() => {
  useCart.getState().clear();
  remote.get.mockReset();
  remote.save.mockReset();
  remote.remove.mockReset();
});
describe("cart ownership and quantities", () => {
  it.each(["", "-1", "0", "1.0001", "1e3", "NaN", "100001"])(
    "rejects invalid quantity %s",
    (value) => expect(validQuantity(value)).toBeNull(),
  );
  it("supports fractional quantities without floating point rejection", () => {
    expect(validQuantity("1,001")).toBe(1.001);
    expect(validQuantity(1.001)).toBe(1.001);
    expect(validQuantity("100000")).toBe(100000);
  });
  it("replaces and removes lines and enforces 100 variants", () => {
    expect(replaceQuantity([{ varianteId: "v", cantidad: 1 }], "v", 2)).toEqual([
      { varianteId: "v", cantidad: 2 },
    ]);
    expect(replaceQuantity([{ varianteId: "v", cantidad: 1 }], "v", 0)).toEqual([]);
    expect(() =>
      replaceQuantity(
        Array.from({ length: 100 }, (_, i) => ({ varianteId: String(i), cantidad: 1 })),
        "extra",
        1,
      ),
    ).toThrow();
  });
  it("isolates even colliding separator-like identifiers", () => {
    expect(accountCartKey("a:b", "c")).not.toBe(accountCartKey("a", "b:c"));
    useCart.getState().add(owner, "v-a", 1, "Private A");
    useCart.getState().add(accountCartKey("shop-a", "customer-b"), "v-b", 2, "B");
    expect(useCart.getState().lines).toEqual([{ varianteId: "v-b", cantidad: 2 }]);
    expect(useCart.getState().names["v-a"]).toBeUndefined();
  });
});
describe("server restore and autosave", () => {
  it("restores persisted cart and server amounts", async () => {
    remote.get.mockResolvedValue(snapshot);
    await restoreRemoteCart(owner);
    expect(useCart.getState()).toMatchObject({
      owner,
      ready: true,
      sync: "saved",
      cartId: "cart-a",
      quote: snapshot,
    });
  });
  it("treats missing cart as empty but does not erase unknown remote cart on network failure", async () => {
    remote.get.mockRejectedValue(new ApiError(404, "absent"));
    await restoreRemoteCart(owner);
    expect(useCart.getState()).toMatchObject({ ready: true, sync: "saved", lines: [] });
    useCart.getState().clear();
    remote.get.mockRejectedValue(new NetworkError());
    await restoreRemoteCart(owner);
    await saveRemoteCart(owner);
    expect(useCart.getState()).toMatchObject({ ready: false, sync: "error" });
    expect(remote.remove).not.toHaveBeenCalled();
  });
  it("does not overwrite local edits with a late restore", async () => {
    let resolve!: (value: typeof snapshot) => void;
    remote.get.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const restoring = restoreRemoteCart(owner);
    useCart.getState().add(owner, "new", 2);
    resolve(snapshot);
    await restoring;
    expect(useCart.getState().lines).toEqual([{ varianteId: "new", cantidad: 2 }]);
    expect(useCart.getState().sync).toBe("dirty");
  });
  it("ignores restore from a previous customer", async () => {
    let resolve!: (value: typeof snapshot) => void;
    remote.get.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const restoring = restoreRemoteCart(owner);
    useCart.getState().clear();
    useCart.getState().begin("other");
    resolve(snapshot);
    await restoring;
    expect(useCart.getState()).toMatchObject({ owner: "other", lines: [], quote: null });
  });
  it("serializes saves and never marks newer edits saved by an older response", async () => {
    remote.get.mockResolvedValue(snapshot);
    await restoreRemoteCart(owner);
    useCart.getState().change(owner, "v-a", 2);
    let resolve!: (value: typeof snapshot) => void;
    remote.save.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const saving = saveRemoteCart(owner);
    useCart.getState().change(owner, "v-a", 3);
    await saveRemoteCart(owner);
    expect(remote.save).toHaveBeenCalledOnce();
    resolve(snapshot);
    await saving;
    expect(useCart.getState()).toMatchObject({
      sync: "dirty",
      quote: null,
      lines: [{ varianteId: "v-a", cantidad: 3 }],
    });
  });
  it("ignores old save even after logout and login to the same account", async () => {
    remote.get.mockResolvedValue(snapshot);
    await restoreRemoteCart(owner);
    let resolve!: (value: typeof snapshot) => void;
    remote.save.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const saving = saveRemoteCart(owner);
    useCart.getState().clear();
    useCart.getState().begin(owner);
    resolve(snapshot);
    await saving;
    expect(useCart.getState()).toMatchObject({ sync: "loading", cartId: null, quote: null });
  });
  it("preserves coupon for autosave without claiming its discount was applied", async () => {
    remote.get.mockResolvedValue(snapshot);
    await restoreRemoteCart(owner);
    useCart.getState().setCoupon(" SAVE10 ");
    remote.save.mockResolvedValue({ ...snapshot, cuponCodigo: "SAVE10" });
    await saveRemoteCart(owner);
    expect(remote.save).toHaveBeenCalledWith([{ varianteId: "v-a", cantidad: 1 }], "SAVE10");
    expect(useCart.getState().quote?.total).toBe("10");
    useCart.getState().clear();
    expect(useCart.getState().coupon).toBe("");
  });
  it("failed save keeps pending selection and hides previously quoted totals", async () => {
    remote.get.mockResolvedValue(snapshot);
    await restoreRemoteCart(owner);
    useCart.getState().change(owner, "v-a", 2);
    remote.save.mockRejectedValue(new NetworkError());
    await saveRemoteCart(owner);
    expect(useCart.getState()).toMatchObject({
      sync: "error",
      quote: null,
      lines: [{ varianteId: "v-a", cantidad: 2 }],
    });
  });
  it("persists empty cart through deletion and exposes rejection", async () => {
    remote.get.mockResolvedValue(snapshot);
    await restoreRemoteCart(owner);
    useCart.getState().change(owner, "v-a", 0);
    remote.remove.mockRejectedValue(new ApiError(409, "payment pending"));
    await saveRemoteCart(owner);
    expect(useCart.getState().sync).toBe("error");
    remote.remove.mockResolvedValue(undefined);
    await saveRemoteCart(owner);
    expect(useCart.getState()).toMatchObject({
      sync: "saved",
      lines: [],
      quote: null,
      cartId: null,
    });
  });
});
