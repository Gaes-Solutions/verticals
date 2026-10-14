import { beforeEach, expect, it } from "vitest";
import { cartCount, cartMessage } from "../src/lib/cart-feedback";
import { accountCartKey, useCart } from "../src/lib/cart-store";
const owner = accountCartKey("gaesland", "customer");
beforeEach(() => useCart.getState().clear());
it("announces the added product and quantity immediately, before autosave", () => {
  useCart.getState().add(owner, "v", 2, "Lámpara");
  const state = useCart.getState();
  expect(state.sync).toBe("dirty");
  expect(state.notice?.after).toBe(2);
  expect(cartMessage(state.notice!, state.names.v)).toBe("Agregaste 2 × Lámpara");
});
it("confirms undo, clears its action and preserves other articles", () => {
  useCart.getState().add(owner, "other", 1, "Otro");
  useCart.getState().add(owner, "v", 1, "Lámpara");
  expect(useCart.getState().undo(owner)).toBe(true);
  expect(useCart.getState().lastEdit).toBeNull();
  expect(useCart.getState().notice?.kind).toBe("undo");
  expect(cartMessage(useCart.getState().notice!, "Lámpara")).toBe("Deshiciste el cambio · Lámpara");
  expect(cartCount(useCart.getState().lines)).toBe(1);
});
it("does not advertise a server save on network failure or leak a notice to another account", () => {
  useCart.getState().add(owner, "v", 1, "Lámpara");
  useCart.getState().failed(owner, "Sin red");
  expect(useCart.getState().sync).toBe("error");
  expect(useCart.getState().quote).toBeNull();
  expect(useCart.getState().notice?.after).toBe(1);
  useCart.getState().begin(accountCartKey("gaesland", "other"));
  expect(useCart.getState().notice).toBeNull();
});
it("closing confirmation does not delete the cart", () => {
  useCart.getState().add(owner, "v", 1);
  useCart.getState().dismissNotice();
  expect(useCart.getState().notice).toBeNull();
  expect(cartCount(useCart.getState().lines)).toBe(1);
  expect(
    cartCount([
      { varianteId: "a", cantidad: 0.1 },
      { varianteId: "b", cantidad: 0.2 },
    ]),
  ).toBe(0.3);
});
