/** Real Next + API + disposable DB buyer journey. No mocked components/responses or orders. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const base = process.env.SHOPPER_TEST_URL;
const api = process.env.API_URL;
assert.equal(base, "http://127.0.0.1:3058");
assert.equal(api, "http://127.0.0.1:3059");
assert.equal(process.env.SHOPPER_FLOW_TESTS, "true");
const fixture = JSON.parse(fs.readFileSync(process.env.SHOPPER_FIXTURE_FILE, "utf8"));
let stage = "setup";
(async () => {
  const browser = await chromium.launch();
  let context;
  let groups = 0;
  const pass = () => console.log(`PASS ${++groups}: ${stage}`);
  try {
    const baseline = fixture.baseline;
    assert.equal(baseline.orders, 0);
    assert.equal(baseline.sales, 0);
    assert.equal(baseline.inventory[0].stock, "10");
    for (const width of [360, 768, 1440]) {
      context = await browser.newContext({
        viewport: { width, height: 1000 },
        locale: "es-MX",
        serviceWorkers: "block",
      });
      const p = await context.newPage();
      p.setDefaultTimeout(20000);
      const errors = [];
      const unexpected = [];
      p.on("pageerror", (e) => {
        errors.push({ message: e.message, stack: e.stack, stage, url: p.url() });
        console.log("BROWSER_ERROR", JSON.stringify(errors.at(-1)));
      });
      p.on("response", async (r) => {
        if (r.request().resourceType() === "document") {
          fs.writeFileSync("/tmp/gaes-shopper-document-ssr.html", await r.text().catch(() => ""));
        }
      });
      await p.route("**/*", (route) => {
        const r = route.request();
        const url = new URL(r.url());
        if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
          unexpected.push(`external ${url.hostname}`);
          return route.abort();
        }
        // Verification is a read-only POST. Every business mutation is forbidden.
        if (
          r.method() !== "GET" &&
          !(r.method() === "POST" && url.pathname === "/api/carrito/verificar")
        ) {
          unexpected.push(`${r.method()} ${url.pathname}`);
          return route.abort();
        }
        return route.continue();
      });
      const safe = async () => {
        assert.deepEqual(errors, []);
        assert.deepEqual(unexpected, []);
        assert(
          await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${width}: horizontal overflow`,
        );
      };
      const localCart = () =>
        p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito") || "[]"));
      stage = `${width}: search the real published catalog and exclude unrelated product`;
      await p.goto(base, { waitUntil: "domcontentloaded" });
      await expect(
        p.getByRole("link", { name: "Carrito, 0 productos", exact: true }),
      ).toBeVisible();
      const search = p.getByRole("searchbox", { name: "Buscar en la tienda", exact: true });
      await search.fill(fixture.titulo);
      await p.getByRole("button", { name: "Buscar productos", exact: true }).click();
      await p.waitForURL((u) => u.searchParams.get("q") === fixture.titulo);
      const cards = p.locator("main article.store-product-card");
      await expect(cards).toHaveCount(1);
      await expect(cards.getByRole("heading", { name: fixture.titulo, exact: true })).toBeVisible();
      await expect(p.getByRole("heading", { name: "Artículo distinto", exact: true })).toHaveCount(
        0,
      );
      await expect(search).toHaveValue(fixture.titulo);
      await safe();
      pass();

      stage = `${width}: real detail link and add update the header and guest cart once`;
      const titleLink = cards
        .getByRole("link")
        .filter({ has: p.getByRole("heading", { name: fixture.titulo, exact: true }) });
      await expect(titleLink).toHaveAttribute("href", `/producto/${fixture.slugSeo}`);
      await titleLink.click();
      await p.waitForURL(`**/producto/${fixture.slugSeo}`);
      await expect(
        p.getByRole("heading", { name: fixture.titulo, exact: true, level: 1 }),
      ).toBeVisible();
      const add = p.getByRole("button", { name: "Agregar al carrito", exact: true });
      await expect(add).toBeEnabled();
      await add.click();
      await expect(p.getByText("Agregado al carrito", { exact: true })).toBeVisible();
      await expect(
        p.getByRole("link", { name: "Carrito, 1 productos", exact: true }),
      ).toBeVisible();
      await expect
        .poll(async () =>
          (await localCart()).map((line) => ({ ...line, precio: Number(line.precio) })),
        )
        .toEqual([
          expect.objectContaining({
            varianteId: fixture.varianteId,
            titulo: fixture.titulo,
            precio: Number(fixture.precio),
            cantidad: 1,
            slugSeo: fixture.slugSeo,
          }),
        ]);
      await safe();
      pass();

      stage = `${width}: real cart price/stock verification, quantity update and persisted reload`;
      await p.getByRole("link", { name: "Ver mi compra", exact: true }).click();
      await p.waitForURL("**/carrito");
      await expect(p.getByRole("heading", { name: "Tu carrito", exact: true })).toBeVisible();
      await expect(p.getByText(/Precios consultados\./)).toBeVisible();
      const increase = p.getByRole("button", {
        name: `Aumentar cantidad de ${fixture.titulo}`,
        exact: true,
      });
      await increase.click();
      await expect.poll(async () => (await localCart())[0]?.cantidad).toBe(2);
      await expect(
        p.getByRole("link", { name: "Carrito, 2 productos", exact: true }),
      ).toBeVisible();
      await expect(p.getByText(/Precios consultados\./)).toBeVisible();
      await expect(
        p
          .getByRole("button", { name: "Continuar compra →", exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeEnabled();
      await expect(p.getByText("$24.00", { exact: true }).first()).toBeVisible();
      await safe();
      for (let reload = 0; reload < 3; reload++) {
        await p.reload({ waitUntil: "domcontentloaded" });
        await expect(p.getByText(/Precios consultados\./)).toBeVisible();
        await expect(
          p.getByRole("link", { name: "Carrito, 2 productos", exact: true }),
        ).toBeVisible();
        assert.equal((await localCart())[0].cantidad, 2);
        await expect(p.getByText("$24.00", { exact: true }).first()).toBeVisible();
        await safe();
      }
      pass();

      stage = `${width}: remove preserves a usable empty cart and header, without creating orders`;
      await p.getByRole("button", { name: `Quitar ${fixture.titulo}`, exact: true }).click();
      await expect(
        p.getByRole("heading", { name: "Tu carrito está vacío", exact: true }),
      ).toBeVisible();
      await expect(p.getByRole("link", { name: "Ver catálogo", exact: true })).toBeVisible();
      await expect(
        p.getByRole("link", { name: "Carrito, 0 productos", exact: true }),
      ).toBeVisible();
      assert.deepEqual(await localCart(), []);
      await safe();
      pass();
      await context.close();
      context = null;
    }
    console.log(`PASS ${groups} real shopper groups on 360/768/1440; orders/sales/stock unchanged`);
  } catch (e) {
    if (context) {
      const p = context.pages()[0];
      if (p) {
        await p
          .screenshot({ path: "/tmp/gaes-shopper-e2e-failure.png", fullPage: true })
          .catch(() => {});
        fs.writeFileSync("/tmp/gaes-shopper-e2e-failure.html", await p.content().catch(() => ""));
      }
    }
    throw Error(`${stage}: ${e.message}`);
  } finally {
    await context?.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
