/** Browser audit: optional add gesture. No accounts, orders or charges. */
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const assert = require("node:assert/strict");
require("node:fs").mkdirSync("/tmp/gaes-design", { recursive: true });
(async () => {
  const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
  if (
    !["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(
      new URL(base).hostname,
    )
  )
    throw Error("Only staging or local URLs");
  const browser = await chromium.launch();
  try {
    for (const mobile of [true, false]) {
      const context = await browser.newContext({
        viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 1000 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      const page = await context.newPage();
      await page.goto(`${base}/?q=Lámpara`, { waitUntil: "networkidle" });
      const button = () => page.getByRole("button", { name: "Agregar", exact: true }).first();
      const units = () =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("gaespos_carrito") || "[]").reduce(
            (n, i) => n + i.cantidad,
            0,
          ),
        );
      const reset = async () => {
        await page.evaluate(() => {
          localStorage.removeItem("gaespos_carrito");
          window.dispatchEvent(new Event("carrito-actualizado"));
        });
        await button().waitFor();
      };
      const position = async () => {
        await button().scrollIntoViewIfNeeded();
        return button().boundingBox();
      };
      const cd = await context.newCDPSession(page);
      const touch = async (dx, dy = 0, cancel = false) => {
        const r = await position();
        const x = r.x + 18;
        const y = r.y + r.height / 2;
        await cd.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y, id: 1 }],
        });
        for (let i = 1; i <= 6; i++)
          await cd.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: x + (dx * i) / 6, y: y + (dy * i) / 6, id: 1 }],
          });
        await cd.send("Input.dispatchTouchEvent", {
          type: cancel ? "touchCancel" : "touchEnd",
          touchPoints: [],
        });
        await page.waitForTimeout(350);
      };
      if (mobile) {
        for (const [dx, dy, cancel] of [
          [-65, 0, false],
          [18, 0, false],
          [0, -90, false],
          [65, 100, false],
          [70, 0, true],
        ]) {
          await touch(dx, dy, cancel);
          assert.equal(await units(), 0);
        }
        console.log(
          "PASS móvil: izquierda, corto, vertical, diagonal y gesto cancelado no agregan",
        );
        const r = await position();
        const y = r.y + r.height / 2;
        await cd.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            { x: r.x + 18, y, id: 1 },
            { x: r.x + 45, y, id: 2 },
          ],
        });
        await cd.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: r.x + 88, y, id: 1 },
            { x: r.x + 110, y, id: 2 },
          ],
        });
        await cd.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(350);
        assert.equal(await units(), 0);
        await touch(75);
        await page.getByRole("button", { name: "Deshacer", exact: true }).waitFor();
        assert.equal(await units(), 1);
        await page.getByRole("button", { name: "Deshacer", exact: true }).click();
        assert.equal(await units(), 0);
        await button().tap();
        await page.getByRole("link", { name: "Ver mi compra", exact: true }).waitFor();
        await page.waitForTimeout(350);
        assert.equal(await units(), 1);
        console.log(
          "PASS móvil: dos dedos no agregan; deslizar agrega una sola unidad; Deshacer y tocar funcionan",
        );
      } else {
        const r = await position();
        const x = r.x + 15;
        const y = r.y + r.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down({ button: "right" });
        await page.mouse.move(x + 75, y, { steps: 6 });
        await page.mouse.up({ button: "right" });
        await page.keyboard.press("Escape");
        assert.equal(await units(), 0);
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 75, y, { steps: 6 });
        await page.mouse.up();
        assert.equal(await units(), 1);
        console.log(
          "PASS escritorio: arrastrar con botón secundario no agrega; arrastrar con botón principal agrega una unidad",
        );
      }
      await reset();
      await button().focus();
      await page.keyboard.press("Enter");
      assert.equal(await units(), 1);
      await reset();
      await button().focus();
      await page.keyboard.press("Space");
      assert.equal(await units(), 1);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      console.log(
        `PASS ${mobile ? "móvil" : "escritorio"}: Enter y Espacio, sin desbordamiento horizontal`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
