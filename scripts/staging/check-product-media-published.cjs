/** Public staging product and browser-local synthetic history. No API writes, orders or emails. */
const assert = require("node:assert/strict");
const { chromium, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
let stage = "setup";
(async () => {
  const browser = await chromium.launch();
  let context;
  let groups = 0;
  try {
    const setup = async ({
      raw = "[]",
      failRead = false,
      failWrite = false,
      viewport = { width: 320, height: 844 },
    } = {}) => {
      if (context) await context.close();
      context = await browser.newContext({ viewport, serviceWorkers: "block" });
      await context.addInitScript(
        ({ raw, failRead, failWrite }) => {
          localStorage.setItem("gaespos_vistos", raw);
          const get = Storage.prototype.getItem;
          const set = Storage.prototype.setItem;
          Storage.prototype.getItem = function (key) {
            if (key === "gaespos_vistos" && failRead) throw Error("PRIVATE_HISTORY_READ");
            return get.call(this, key);
          };
          Storage.prototype.setItem = function (key, value) {
            if (key === "gaespos_vistos" && failWrite) throw Error("PRIVATE_HISTORY_WRITE");
            return set.call(this, key, value);
          };
        },
        { raw, failRead, failWrite },
      );
      const p = await context.newPage();
      p.setDefaultTimeout(15000);
      p.setDefaultNavigationTimeout(15000);
      const faults = { errors: [], writes: [] };
      p.on("pageerror", (error) => faults.errors.push(error.message));
      await p.route("**/api/**", (route) => {
        if (route.request().method() !== "GET") {
          faults.writes.push(new URL(route.request().url()).pathname);
          return route.abort();
        }
        return route.continue();
      });
      await p.goto(`${base}/producto/demo-lampara`, { waitUntil: "domcontentloaded" });
      await expect(p.getByRole("heading", { level: 1 })).toHaveText("Lámpara de mesa");
      await expect(
        p.getByRole("button", { name: "Agregar al carrito", exact: true }),
      ).toBeEnabled();
      return { p, faults };
    };
    const safe = async (p, faults) => {
      assert.deepEqual(faults.errors, []);
      assert.deepEqual(faults.writes, []);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await expect(
        p.getByRole("button", { name: "Agregar al carrito", exact: true }),
      ).toBeVisible();
    };
    const pass = () => {
      groups++;
      console.log(`PASS ${stage}`);
    };
    stage = "corrupt history cannot replace the published product with an error screen";
    for (const raw of ["{}", "null", '[null,7,{"slugSeo":"bad"}]']) {
      const { p, faults } = await setup({ raw });
      await safe(p, faults);
    }
    pass();
    stage = "denied history reads or writes leave the real product interactive";
    for (const option of [{ failRead: true }, { failWrite: true }]) {
      const { p, faults } = await setup(option);
      await p.getByRole("button", { name: /Ampliar imagen/ }).click();
      await expect(p.getByRole("dialog")).toBeVisible();
      await p.keyboard.press("Escape");
      await safe(p, faults);
    }
    pass();
    stage = "history describes its historical price and a failed thumbnail has a readable fallback";
    let { p, faults } = await setup({
      raw: JSON.stringify([
        {
          slugSeo: "qa-history",
          titulo: "Producto de historial QA",
          precio: "25.50",
          imagen: "/missing-qa-history.png",
        },
      ]),
    });
    const history = p.getByRole("region", { name: "Vistos recientemente", exact: true });
    await expect(history).toContainText("Último precio visto");
    await expect(
      history.getByRole("img", {
        name: "Imagen no disponible: Producto de historial QA",
        exact: true,
      }),
    ).toBeVisible();
    await safe(p, faults);
    pass();
    stage = "published gallery zoom, rotate, reset and Escape preserve usable 44px controls";
    await p.getByRole("button", { name: /Ampliar imagen/ }).click();
    const dialog = p.getByRole("dialog");
    await p.getByRole("button", { name: "Acercar imagen", exact: true }).click();
    await expect(p.getByLabel("Nivel de zoom")).toHaveText("150%");
    await p.getByRole("button", { name: "Girar imagen 90 grados", exact: true }).click();
    assert(
      await dialog
        .locator("img")
        .evaluate((e) => e.parentElement.style.transform.includes("rotate(90deg)")),
    );
    await p.getByRole("button", { name: "Restablecer imagen", exact: true }).click();
    await expect(p.getByLabel("Nivel de zoom")).toHaveText("100%");
    for (const button of await dialog.getByRole("button").all()) {
      const box = await button.boundingBox();
      assert(box.width >= 44 && box.height >= 44);
    }
    await p.screenshot({ path: "/tmp/gaes-media-published-320.png" });
    await p.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(p.getByRole("button", { name: /Ampliar imagen/ })).toBeFocused();
    assert.equal(await p.evaluate(() => document.body.style.overflow), "");
    await safe(p, faults);
    pass();
    stage = "gallery controls fit inside the published short landscape viewport";
    ({ p, faults } = await setup({ viewport: { width: 640, height: 360 } }));
    await p.getByRole("button", { name: /Ampliar imagen/ }).click();
    for (const button of await p.getByRole("dialog").getByRole("button").all()) {
      const box = await button.boundingBox();
      assert(box.y >= 0 && box.y + box.height <= 360);
    }
    await p.screenshot({ path: "/tmp/gaes-media-published-landscape.png" });
    await p.keyboard.press("Escape");
    await safe(p, faults);
    pass();
    console.log(
      JSON.stringify({
        groups,
        remoteWrites: 0,
        orders: 0,
        actual:
          "public product and components; synthetic browser history and scoped storage faults",
      }),
    );
  } catch (error) {
    console.error(`FAIL ${stage}`, error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
