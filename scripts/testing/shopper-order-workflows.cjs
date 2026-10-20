/** Guest pickup checkout through real Next/BFF/API and disposable PostgreSQL only.
 * No route.fulfill, API mocks, online payments, or email/provider construction.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const base = process.env.SHOPPER_TEST_URL;
assert.equal(base, "http://127.0.0.1:3058");
assert.equal(process.env.API_URL, "http://127.0.0.1:3059");
assert.equal(process.env.SHOPPER_FLOW_TESTS, "true");
assert.equal(process.env.SHOPPER_ORDER_FLOW_TESTS, "true");
const database = new URL(process.env.DATABASE_URL_MASTER);
assert(["localhost", "127.0.0.1"].includes(database.hostname));
assert.match(database.pathname, /^\/qa_platform_\d+$/);
assert.equal(database.search, "");
const fixture = JSON.parse(fs.readFileSync(process.env.SHOPPER_FIXTURE_FILE, "utf8"));
assert.equal(fixture.baseline.ecommerceOrders, 0);
assert.equal(fixture.order.checkoutAttempts, 0);
let stage = "setup";
(async () => {
  const browser = await chromium.launch();
  let context;
  let page;
  let groups = 0;
  const pass = () => console.log(`PASS shopper order ${++groups}: ${stage}`);
  try {
    context = await browser.newContext({
      viewport: { width: 360, height: 1000 },
      locale: "es-MX",
      serviceWorkers: "block",
    });
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    const forbidden = [];
    const checkoutBodies = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const allowed =
        ["localhost", "127.0.0.1"].includes(url.hostname) &&
        (request.method() === "GET" ||
          (request.method() === "POST" &&
            ["/api/carrito/verificar", "/api/checkout"].includes(url.pathname)));
      if (!allowed) {
        forbidden.push(`${request.method()} ${url.hostname}${url.pathname}`);
        return route.abort();
      }
      if (request.method() === "POST" && url.pathname === "/api/checkout") {
        const body = request.postDataJSON();
        assert.equal(body.metodoPago, "cod");
        assert.equal(body.metodoEnvio, "click_collect");
        assert.equal(body.emailComprador, fixture.order.email);
        assert.equal(body.sucursalPickupId, fixture.order.sucursalId);
        checkoutBodies.push(body);
      }
      return route.continue();
    });
    const safe = async () => {
      assert.deepEqual(errors, []);
      assert.deepEqual(forbidden, []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    };
    const cart = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito") || "[]"));
    stage = "guest selects a real product and opens the real checkout";
    await page.goto(`${base}/producto/${fixture.slugSeo}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: fixture.titulo, level: 1, exact: true }),
    ).toBeVisible();
    if (fixture.imageExpected) {
      const byHost = await context.request.get(`${base}/producto/${fixture.slugSeo}`, {
        headers: { Host: "qa-new-owner.shops.example.test" },
      });
      assert.equal(byHost.status(), 200);
      assert((await byHost.text()).includes(fixture.titulo));
      const unknown = await context.request.get(`${base}/producto/${fixture.slugSeo}`, {
        headers: { Host: "unregistered-owner.shops.example.test", "x-tienda-slug": "qa-new-owner" },
      });
      assert.equal(unknown.status(), 503);
      assert(!(await unknown.text()).includes(fixture.titulo));
      const photo = page.getByRole("img", { name: fixture.titulo, exact: true }).first();
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
      await page
        .getByRole("button", { name: `Ampliar imagen de ${fixture.titulo}`, exact: true })
        .click();
      await page.getByRole("button", { name: "Acercar imagen", exact: true }).click();
      await page.getByRole("button", { name: "Girar imagen 90 grados", exact: true }).click();
      await page.getByRole("button", { name: "Cerrar imágenes", exact: true }).click();
    }
    await page.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Carrito, 1 productos", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ver mi compra", exact: true }).click();
    await page.waitForURL("**/carrito");
    await expect(page.getByText(/Precios consultados\./)).toBeVisible();
    await page
      .getByRole("button", { name: "Continuar compra →", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await page.waitForURL("**/checkout");
    await page.getByLabel("Email", { exact: true }).fill(fixture.order.email);
    await page.getByLabel("Nombre completo", { exact: true }).fill("QA Invitado");
    await page.getByRole("button", { name: "Recoger en tienda", exact: true }).click();
    const pickupPayment = page.getByRole("radio", { name: /Paga al recoger en la tienda/ });
    if (await pickupPayment.count()) await pickupPayment.click();
    await expect(
      page.getByText("Paga al recoger en la tienda", { exact: true }).first(),
    ).toBeVisible();
    await safe();
    pass();

    stage = "guest submits cash-at-pickup and reaches a persisted order confirmation";
    const checkout = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/checkout" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^Apartar pedido ·/ }).click();
    const response = await checkout;
    assert.equal(response.status(), 200);
    const receipt = await response.json();
    assert.equal(receipt.intentStatus, "pendiente");
    assert.equal(receipt.pagoAlRecoger, true);
    assert.equal(Number(receipt.total), Number(fixture.precio));
    assert.equal(typeof receipt.folioPublico, "string");
    assert(receipt.folioPublico.length > 0);
    await page.waitForURL(
      (url) =>
        url.pathname === "/gracias" && url.searchParams.get("folio") === receipt.folioPublico,
    );
    assert.equal(new URL(page.url()).searchParams.get("recogida"), "1");
    await expect(
      page.getByRole("heading", { name: "Tu pedido quedó registrado", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "No se realizó ningún cobro en línea. Paga tu pedido cuando lo recojas en la tienda.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText(receipt.folioPublico, { exact: true }).first()).toBeVisible();
    assert.deepEqual(await cart(), []);
    assert.equal(checkoutBodies.length, 1);
    await safe();
    pass();

    stage = "confirmation survives reload without recreating the order or guest cart";
    for (let reload = 0; reload < 2; reload++) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: "Tu pedido quedó registrado", exact: true }),
      ).toBeVisible();
      assert.equal(new URL(page.url()).searchParams.get("folio"), receipt.folioPublico);
      assert.deepEqual(await cart(), []);
      assert.equal(checkoutBodies.length, 1);
      await safe();
    }
    pass();

    stage =
      "two simultaneous replays of the original guest attempt return the same persisted order";
    const original = checkoutBodies[0];
    const replays = await page.evaluate(
      async (body) =>
        Promise.all(
          Array.from({ length: 2 }, async () => {
            const result = await fetch("/api/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            return { status: result.status, data: await result.json() };
          }),
        ),
      original,
    );
    for (const replay of replays) {
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.data, receipt);
    }
    assert.equal(checkoutBodies.length, 3);
    assert(checkoutBodies.every((body) => JSON.stringify(body) === JSON.stringify(original)));
    await safe();
    fs.writeFileSync(
      process.env.SHOPPER_ORDER_RESULT_FILE,
      JSON.stringify({
        email: fixture.order.email,
        folioPublico: receipt.folioPublico,
        total: fixture.precio,
        replayCount: replays.length,
      }),
      { mode: 0o600, flag: "wx" },
    );
    pass();
    console.log(
      `PASS ${groups} real guest pickup order groups; no payment/email providers; DB invariants follow`,
    );
  } catch (error) {
    if (page) {
      await page
        .screenshot({ path: "/tmp/gaes-shopper-order-failure.png", fullPage: true })
        .catch(() => {});
      fs.writeFileSync(
        "/tmp/gaes-shopper-order-failure.html",
        await page.content().catch(() => ""),
      );
    }
    throw Error(`${stage}: ${error.message}`);
  } finally {
    await context?.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
