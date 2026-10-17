/** Published checkout integration with synthetic provider settings/SDK and browser-only cart.
 * Blocks all business writes and all payment-provider network calls. No orders or charges. */
const assert = require("node:assert/strict");
const { chromium, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
const sdk =
  "window.qaConfirmations=0;window.Stripe=()=>({elements(){return {create(){let ready;return {on(e,cb){if(e==='ready')ready=cb},mount(el){window.qaMounts=(window.qaMounts||0)+1;el.textContent='Campo seguro sintético QA';window.emitStripeReady=()=>ready?.()},unmount(){}}}}},confirmCardPayment(){window.qaConfirmations++;return Promise.resolve({paymentIntent:{status:'succeeded'}})}});";
let stage = "setup";
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "es-MX",
  });
  try {
    await context.addInitScript(() => {
      const later = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => later(fn, ms === 12000 ? 5000 : ms, ...args);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.name));
    let writes = 0;
    let scriptMode = "network";
    await page.route("https://js.stripe.com/**", (route) =>
      scriptMode === "network"
        ? route.abort()
        : route.fulfill({ contentType: "application/javascript", body: sdk }),
    );
    await page.route("https://api.stripe.com/**", (route) => route.abort());
    await page.route("https://*.conekta.io/**", (route) => route.abort());
    await page.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() !== "GET") {
        writes++;
        return route.abort();
      }
      if (url.pathname === "/api/tienda-config")
        return route.fulfill({
          json: {
            msiHabilitado: false,
            msiMeses: [],
            msiMontoMinimo: "0",
            cuponEnCheckout: false,
            envioGratisDesde: null,
            metodosPago: ["tarjeta"],
            proveedorPago: "stripe",
            pagoPublicKey: "pk_test_QA_fixture",
            stripeAccountId: "acct_QA_fixture",
          },
        });
      if (url.pathname === "/api/envios")
        return route.fulfill({
          json: {
            pickup: [
              {
                sucursalId: "qa-local",
                nombre: "Sucursal sintética QA",
                tiempoPreparacionPromedioMin: 30,
              },
            ],
            opcionesEnvio: [],
          },
        });
      return route.continue();
    });
    stage = "guest fixture cart";
    await page.goto(`${base}/cuenta/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() =>
      localStorage.setItem(
        "gaespos_carrito",
        JSON.stringify([
          {
            varianteId: "qa-payment-local",
            titulo: "Producto sintético QA",
            precio: "100.00",
            cantidad: 1,
          },
        ]),
      ),
    );
    assert.equal(
      (await page.goto(`${base}/checkout`, { waitUntil: "domcontentloaded" })).status(),
      200,
    );
    await page.getByLabel("Email", { exact: true }).fill("payment-qa@example.invalid");
    await page.getByLabel("Nombre completo", { exact: true }).fill("QA Pago Local");
    await page.getByRole("button", { name: "Recoger en tienda", exact: true }).click();
    const pay = () => page.getByRole("button", { name: "Pagar $100.00", exact: true });
    await expect(
      page.getByRole("alert").filter({ hasText: "No pudimos cargar el formulario seguro" }),
    ).toBeVisible();
    await expect(pay()).toBeDisabled();
    console.log(
      "PASS published checkout keeps new Stripe submission disabled after SDK load failure; synthetic cart/settings only",
    );
    stage = "pay on pickup remains independent";
    await page.getByRole("radio", { name: /Paga al recoger en la tienda/ }).click();
    await expect(
      page.getByRole("button", { name: "Apartar pedido · $100.00", exact: true }),
    ).toBeEnabled();
    assert.equal(writes, 0);
    console.log(
      "PASS pay-on-pickup stays available independently of Stripe readiness; no order submitted",
    );
    stage = "retry and actual ready event";
    await page.getByRole("radio", { name: /Tarjeta de crédito o débito/ }).click();
    await expect(
      page.getByRole("button", { name: "Reintentar formulario seguro", exact: true }),
    ).toBeVisible();
    scriptMode = "ok";
    await page.getByRole("button", { name: "Reintentar formulario seguro", exact: true }).click();
    await page.waitForFunction(() => typeof window.emitStripeReady === "function");
    await expect(pay()).toBeDisabled();
    await page.evaluate(() => window.emitStripeReady());
    await expect(pay()).toBeEnabled();
    assert.equal(writes, 0);
    assert.equal(await page.evaluate(() => window.qaConfirmations), 0);
    console.log(
      "PASS published parent enables payment only after the mounted SDK emits ready; retry sends no payment",
    );
    stage = "method remount resets readiness";
    const mountsBefore = await page.evaluate(() => window.qaMounts);
    await page.getByRole("radio", { name: /Paga al recoger en la tienda/ }).click();
    await page.getByRole("radio", { name: /Tarjeta de crédito o débito/ }).click();
    await expect(pay()).toBeDisabled();
    await page.waitForFunction((before) => window.qaMounts > before, mountsBefore);
    await page.evaluate(() => window.emitStripeReady());
    await expect(pay()).toBeEnabled();
    assert.equal(writes, 0);
    assert.equal(await page.evaluate(() => window.qaConfirmations), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS payment-method remount requires fresh readiness; no business writes, confirmations, horizontal overflow or JavaScript errors",
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(() => {
  console.error(`FAIL published payment integration at ${stage}; no private payment data used`);
  process.exitCode = 1;
});
