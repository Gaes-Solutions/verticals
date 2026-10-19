/** Public staging catalog/product reads and browser-only guest edits. No remote writes or checkout. */
const assert = require("node:assert/strict");
const { chromium, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
let stage = "setup";
(async () => {
  const browser = await chromium.launch();
  let context;
  let groups = 0;
  try {
    const setup = async (options = {}) => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 320, height: 844 },
        serviceWorkers: "block",
      });
      await context.addInitScript((options) => {
        if (options.items) localStorage.setItem("gaespos_carrito", JSON.stringify(options.items));
        window.failRead = !!options.failRead;
        window.failWrite = !!options.failWrite;
        const get = Storage.prototype.getItem;
        const set = Storage.prototype.setItem;
        Storage.prototype.getItem = function (k) {
          if (window.failRead) throw Error("PRIVATE_READ");
          return get.call(this, k);
        };
        Storage.prototype.setItem = function (k, v) {
          if (window.failWrite && k === "gaespos_carrito") throw Error("PRIVATE_WRITE");
          return set.call(this, k, v);
        };
      }, options);
      const p = await context.newPage();
      p.setDefaultTimeout(20000);
      const f = { errors: [], writes: [] };
      p.on("pageerror", (e) => f.errors.push(e.message));
      await p.route("**/api/**", (r) => {
        if (r.request().method() !== "GET") {
          f.writes.push(new URL(r.request().url()).pathname);
          return r.abort();
        }
        return r.continue();
      });
      await p.goto(`${base}/producto/demo-lampara`, { waitUntil: "domcontentloaded" });
      const add = p.getByRole("button", { name: "Agregar al carrito", exact: true });
      await expect(add).toBeVisible();
      return { p, f, add };
    };
    const pass = () => {
      console.log(`PASS ${stage}`);
      groups++;
    };
    const cart = (p) =>
      p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito") || "[]"));
    const safe = async (p, f) => {
      assert.deepEqual(f.errors, []);
      assert.deepEqual(f.writes, []);
      assert(
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        "page overflow",
      );
    };
    stage =
      "actual public product adds once on immediate repeated clicks and exposes complete touch controls";
    let { p, f, add } = await setup();
    await expect(add).toBeEnabled();
    await add.evaluate((e) => {
      e.click();
      e.click();
    });
    await expect(p.getByText("Agregado al carrito", { exact: true })).toBeVisible();
    const first = (await cart(p))[0];
    assert.equal(first.cantidad, 1);
    assert.equal(Number.isFinite(Number(first.precio)), true);
    const undo = p.getByRole("button", { name: "Deshacer", exact: true });
    await expect(undo).toBeVisible();
    for (const button of [
      add,
      undo,
      p.getByRole("button", { name: "Cerrar confirmación", exact: true }),
      p.getByRole("link", { name: "Ver mi compra", exact: true }),
    ])
      assert((await button.boundingBox()).height >= 44);
    await safe(p, f);
    await p.screenshot({ path: "/tmp/gaes-purchase-published-320.png", fullPage: true });
    pass();
    stage = "published undo can only restore the exact latest addition once";
    await undo.evaluate((e) => {
      e.click();
      e.click();
    });
    assert.deepEqual(await cart(p), []);
    await expect(p.getByRole("complementary", { name: "Tu compra", exact: true })).toHaveCount(0);
    await safe(p, f);
    pass();
    stage = "published storage changes invalidate undo without deleting the changed quantity";
    ({ p, f, add } = await setup());
    await add.click();
    await expect(p.getByRole("button", { name: "Deshacer", exact: true })).toBeVisible();
    const changed = [{ ...(await cart(p))[0], cantidad: 2 }];
    await p.evaluate((items) => {
      localStorage.setItem("gaespos_carrito", JSON.stringify(items));
      window.dispatchEvent(new Event("carrito-actualizado"));
    }, changed);
    await expect(p.getByRole("button", { name: "Deshacer", exact: true })).toHaveCount(0);
    assert.deepEqual(await cart(p), changed);
    await safe(p, f);
    pass();
    stage = "published silent external edits are checked again when undo is pressed";
    ({ p, f, add } = await setup());
    await add.click();
    await expect(p.getByRole("button", { name: "Deshacer", exact: true })).toBeVisible();
    const external = [{ ...(await cart(p))[0], cantidad: 2 }];
    await p.evaluate(
      (items) => localStorage.setItem("gaespos_carrito", JSON.stringify(items)),
      external,
    );
    await p.getByRole("button", { name: "Deshacer", exact: true }).click();
    await expect(p.getByRole("alert").filter({ hasText: "Tu carrito cambió" })).toBeVisible();
    assert.deepEqual(await cart(p), external);
    await safe(p, f);
    pass();
    stage =
      "published read denial is recoverable without an empty-cart claim or JavaScript failure";
    ({ p, f, add } = await setup({ failRead: true }));
    await expect(add).toBeDisabled();
    await expect(
      p.getByRole("link", { name: "Carrito, cantidad no disponible", exact: true }),
    ).toBeVisible();
    const idError = await p
      .getByRole("spinbutton", { name: "Cantidad", exact: true })
      .getAttribute("aria-describedby");
    assert(idError);
    await expect(p.locator(`[id="${idError}"]`)).toContainText("No pudimos leer tu carrito.");
    await p.evaluate(() => {
      window.failRead = false;
    });
    await p.getByRole("button", { name: "Volver a leer carrito", exact: true }).click();
    await expect(add).toBeEnabled();
    await expect(p.getByText("No pudimos leer tu carrito.", { exact: false })).toHaveCount(0);
    await safe(p, f);
    pass();
    stage = "published write denial never announces addition or opens checkout";
    ({ p, f, add } = await setup({ failWrite: true }));
    await expect(add).toBeEnabled();
    await add.click();
    await expect(
      p.getByRole("alert").filter({ hasText: "No pudimos confirmar el cambio" }),
    ).toBeVisible();
    await expect(p.getByText("Agregado al carrito", { exact: true })).toHaveCount(0);
    assert.deepEqual(await cart(p), []);
    await safe(p, f);
    pass();
    stage = "published detail updates the stored price and undo restores the earlier metadata";
    const previous = {
      ...first,
      titulo: "Selección anterior de prueba",
      precio: "1.00",
      cantidad: 1,
    };
    ({ p, f, add } = await setup({ items: [previous] }));
    await expect(p.getByRole("link", { name: "Carrito, 1 productos", exact: true })).toBeVisible();
    if (await add.isEnabled()) {
      await add.click();
      await expect(p.getByRole("button", { name: "Deshacer", exact: true })).toBeVisible();
      assert.equal((await cart(p))[0].cantidad, 2);
      assert.equal((await cart(p))[0].precio, first.precio);
      await p.getByRole("button", { name: "Deshacer", exact: true }).click();
      assert.deepEqual(await cart(p), [previous]);
      await safe(p, f);
      pass();
    } else
      console.log("SKIP additional-unit price check: public stock exhausted by the preloaded unit");
    console.log(
      JSON.stringify({
        groups,
        remoteWrites: 0,
        actual:
          "public product, price and availability; real components with browser-local guest carts; storage faults injected",
        orders: 0,
      }),
    );
  } finally {
    if (context) await context.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(stage, e);
  process.exitCode = 1;
});
