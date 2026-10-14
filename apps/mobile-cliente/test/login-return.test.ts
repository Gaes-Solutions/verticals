import { expect, it } from "vitest";
import { loginDestination } from "../src/lib/login-return";
it("returns the shopper to their product after entering or registering", () => {
  expect(loginDestination("/(app)/producto", "demo-lampara")).toEqual({
    pathname: "/(app)/producto",
    params: { slug: "demo-lampara" },
  });
  expect(loginDestination("/(app)/checkout")).toBe("/(app)/checkout");
  expect(loginDestination("/(app)/carrito")).toBe("/(app)/carrito");
});
it.each([undefined, "https://evil.invalid", "//evil.invalid", "/login", "/admin"])(
  "ignores unsafe or unknown return %s",
  (next) => {
    expect(loginDestination(next)).toBe("/(app)/tienda");
  },
);
it("does not open a product without a valid slug", () => {
  expect(loginDestination("/(app)/producto")).toBe("/(app)/tienda");
  expect(loginDestination("/(app)/producto", "../login")).toBe("/(app)/tienda");
});
