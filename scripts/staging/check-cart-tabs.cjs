/** Published/local storefront guest cart across real tabs. Blocks browser writes.
 * Optional STOREFRONT_CART_ACCOUNT private JSON {email,password}: read-only account cart smoke. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect, request } = require("@playwright/test");
const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
assert(
  ["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(new URL(base).hostname),
);
let stage = "setup";
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await context.route("**/api/**", (r) =>
      r.request().method() === "GET" ? r.continue() : r.abort(),
    );
    const product = await context.newPage();
    const cart = await context.newPage();
    context.setDefaultTimeout(30000);
    await product.goto(`${base}/producto/demo-lampara`);
    await cart.goto(`${base}/carrito`);
    await cart.getByRole("heading", { name: "Tu carrito está vacío", exact: true }).waitFor();
    stage = "add from another tab";
    await product.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
    await expect(
      cart.getByRole("link", { name: "Carrito, 1 productos", exact: true }),
    ).toBeVisible();
    await expect(cart.getByRole("heading", { name: "Tu carrito", exact: true })).toBeVisible();
    console.log("PASS add in product tab updates the other tab header and cart without reload");
    stage = "change from cart tab";
    await cart.getByRole("button", { name: "Aumentar", exact: true }).click();
    await expect(
      product.getByRole("link", { name: "Carrito, 2 productos", exact: true }),
    ).toBeVisible();
    await expect(product.getByRole("button", { name: "Deshacer", exact: true })).toHaveCount(0);
    console.log("PASS quantity change updates the product tab and invalidates its old undo");
    stage = "remove from cart tab";
    await cart.getByRole("button", { name: "Quitar", exact: true }).click();
    await expect(
      product.getByRole("link", { name: "Carrito, 0 productos", exact: true }),
    ).toBeVisible();
    await expect(
      cart.getByRole("heading", { name: "Tu carrito está vacío", exact: true }),
    ).toBeVisible();
    console.log("PASS removal updates both tabs without reload");
  } finally {
    await context.close();
    await browser.close();
  }
  if (process.env.STOREFRONT_CART_ACCOUNT) {
    stage = "authenticated read-only cart";
    const account = JSON.parse(fs.readFileSync(process.env.STOREFRONT_CART_ACCOUNT, "utf8"));
    const api = await request.newContext({ baseURL: base });
    try {
      assert.equal((await api.post("/api/cuenta/login", { data: account })).status(), 200);
      const me = await api.get("/api/cuenta/me");
      assert.equal(me.status(), 200);
      const profile = await me.json();
      assert.equal(profile.email, account.email);
      const response = await api.get("/api/cuenta/carrito");
      assert.equal(response.status(), 200);
      const data = await response.json();
      assert.equal(data.owner, JSON.stringify(["gaesland", profile.id]));
      assert.equal(response.headers()["cache-control"], "no-store");
      if (data.cart !== null) {
        assert.equal(typeof data.cart.version, "string");
        assert(Array.isArray(data.cart.items));
      }
      console.log(
        "PASS real buyer account cart read accepts the current API contract without altering its contents",
      );
    } finally {
      await api.dispose();
    }
  }
  console.log(
    "PASS cart tabs; guest data local only, no account cart writes/orders/payments/emails",
  );
})().catch(() => {
  console.error(`FAIL cart tabs at ${stage}; credentials withheld`);
  process.exitCode = 1;
});
