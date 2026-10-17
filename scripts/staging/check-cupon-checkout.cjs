/** Published checkout with browser-only carts/coupon/fulfillment fixtures.
 * Checkout POSTs are captured and answered locally: no orders, redemption or payments. */
const assert = require("node:assert/strict");
const { chromium, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
const item = {
  varianteId: "qa-cupon-local",
  titulo: "Producto sintético QA",
  precio: "100.00",
  cantidad: 1,
};
let stage = "setup";
(async () => {
  const browser = await chromium.launch();
  let context;
  try {
    const setup = async () => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        locale: "es-MX",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.name));
      const fixture = { mode: "discount", posts: [], reads: 0 };
      await page.route("https://js.stripe.com/**", (route) => route.abort());
      await page.route("https://cdn.conekta.io/**", (route) => route.abort());
      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() !== "GET") {
          if (url.pathname === "/api/checkout") {
            fixture.posts.push(route.request().postDataJSON());
            return route.fulfill({
              status: 503,
              json: { message: "Solicitud QA interceptada; no se creó pedido." },
            });
          }
          return route.abort();
        }
        if (url.pathname === "/api/tienda-config")
          return route.fulfill({
            json: {
              msiHabilitado: false,
              msiMeses: [],
              msiMontoMinimo: "0",
              cuponEnCheckout: true,
              envioGratisDesde: null,
              metodosPago: [],
              proveedorPago: null,
              pagoPublicKey: null,
            },
          });
        if (url.pathname === "/api/envios")
          return route.fulfill({
            json: {
              pickup: [
                { sucursalId: "qa-local", nombre: "Sucursal QA", tiempoPreparacionPromedioMin: 30 },
              ],
              opcionesEnvio: [
                {
                  tarifaId: "qa-local-rate",
                  nombrePublico: "Envío QA",
                  costo: "20.00",
                  gratis: false,
                  diasEntregaEstimados: 2,
                },
              ],
            },
          });
        if (url.pathname === "/api/cupon") {
          fixture.reads++;
          return route.fulfill({
            json: {
              valido: true,
              codigo: url.searchParams.get("codigo"),
              mensaje: fixture.mode === "shipping" ? "Envío gratis con tu cupón" : "Cupón aplicado",
              descuentoSubtotal: fixture.mode === "shipping" ? "0.00" : "10.00",
              envioGratis: fixture.mode === "shipping",
            },
          });
        }
        return route.continue();
      });
      await page.goto(`${base}/cuenta/login`, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        (item) => localStorage.setItem("gaespos_carrito", JSON.stringify([item])),
        item,
      );
      assert.equal(
        (await page.goto(`${base}/checkout`, { waitUntil: "domcontentloaded" })).status(),
        200,
      );
      await page.getByLabel("Email", { exact: true }).fill("cupon-qa@example.invalid");
      await page.getByLabel("Nombre completo", { exact: true }).fill("QA Cupón Local");
      await page.getByRole("button", { name: "Recoger en tienda", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Apartar pedido · $100.00", exact: true }),
      ).toBeEnabled();
      return { page, fixture, errors };
    };
    stage = "verified coupon payload";
    let { page, fixture, errors } = await setup();
    const code = () => page.getByLabel("¿Tienes un cupón?", { exact: true });
    const apply = () => page.getByRole("button", { name: "Aplicar", exact: true });
    await code().fill(" promo10 ");
    await expect(
      page.getByRole("button", { name: "Apartar pedido · $100.00", exact: true }),
    ).toBeDisabled();
    assert.equal(fixture.posts.length, 0);
    await code().press("Enter");
    await expect(
      page.getByRole("button", { name: "Apartar pedido · $90.00", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Apartar pedido · $90.00", exact: true }).click();
    await expect.poll(() => fixture.posts.length).toBe(1);
    assert.equal(fixture.posts[0].cuponCodigo, "PROMO10");
    assert.deepEqual(errors, []);
    console.log(
      "PASS published checkout blocks unapplied code, applies exact discount and captures only the verified normalized code; POST never forwarded",
    );
    stage = "removing discount";
    ({ page, fixture, errors } = await setup());
    await code().fill("PROMO10");
    await apply().click();
    await expect(
      page.getByRole("button", { name: "Apartar pedido · $90.00", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Quitar cupón", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Apartar pedido · $100.00", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Apartar pedido · $100.00", exact: true }).click();
    await expect.poll(() => fixture.posts.length).toBe(1);
    assert.equal(Object.hasOwn(fixture.posts[0], "cuponCodigo"), false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS removing a coupon restores total and omits the code in the captured checkout request; no real order",
    );
    stage = "same-value cart edit";
    ({ page, fixture, errors } = await setup());
    await code().fill("PROMO10");
    await apply().click();
    await expect(
      page.getByRole("button", { name: "Apartar pedido · $90.00", exact: true }),
    ).toBeEnabled();
    await page.evaluate((item) => {
      localStorage.setItem(
        "gaespos_carrito",
        JSON.stringify([{ ...item, varianteId: "qa-cupon-other-same-price" }]),
      );
      window.dispatchEvent(new Event("carrito-actualizado"));
    }, item);
    await expect(
      page.getByRole("button", { name: "Apartar pedido · $100.00", exact: true }),
    ).toBeDisabled();
    await expect(page.getByText("Descuento (PROMO10)", { exact: true })).toHaveCount(0);
    await apply().click();
    await expect(
      page.getByRole("button", { name: "Apartar pedido · $90.00", exact: true }),
    ).toBeEnabled();
    assert.equal(fixture.posts.length, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS replacing a product at the same subtotal invalidates the displayed coupon and requires revalidation",
    );
    stage = "shipping coupon and delivery change";
    ({ page, fixture, errors } = await setup());
    fixture.mode = "shipping";
    await page.getByRole("button", { name: "Envío a domicilio", exact: true }).click();
    await page.getByLabel("Calle", { exact: true }).fill("Calle QA");
    await page.getByLabel("Ciudad", { exact: true }).fill("Ciudad QA");
    await page.getByLabel("Estado", { exact: true }).fill("Ciudad de México");
    await page.getByLabel("Código postal", { exact: true }).fill("06060");
    const summary = page.locator("aside").filter({ hasText: "Tu pedido" });
    await expect(summary.getByText("Total con envío", { exact: true }).locator("..")).toContainText(
      "$120.00",
    );
    await code().fill("ENVIOQA");
    await apply().click();
    await expect(summary.getByText("Total con envío", { exact: true }).locator("..")).toContainText(
      "$100.00",
    );
    await expect(summary.getByText(/Descuento \(/)).toHaveCount(0);
    await page.getByRole("button", { name: "Recoger en tienda", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Apartar pedido · $100.00", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Quitar cupón", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Apartar pedido · $100.00", exact: true }),
    ).toBeEnabled();
    assert.equal(fixture.posts.length, 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS shipping-only discount changes shipping, resets on delivery changes and keeps mobile layout usable",
    );
    await context.close();
    context = null;
    stage = "actual read-only coupon boundary";
    context = await browser.newContext();
    const invalid = await context.request.get(`${base}/api/cupon?codigo=A%26B&subtotal=100.00`);
    assert.equal(invalid.status(), 400);
    assert.match(invalid.headers()["cache-control"], /private.*no-store/);
    const missing = `QA_NOSUCH_${Date.now().toString(36).toUpperCase()}`;
    const res = await context.request.get(`${base}/api/cupon?codigo=${missing}&subtotal=100.0000`, {
      timeout: 20000,
    });
    assert.equal(res.status(), 200);
    const data = await res.json();
    assert.equal(data.codigo, missing);
    assert.equal(data.valido, false);
    assert.equal(data.descuentoSubtotal, "0.00");
    assert.equal(data.envioGratis, false);
    assert.match(res.headers()["cache-control"], /private.*no-store/);
    console.log(
      "PASS actual BFF rejects bad input and returns a verified unavailable coupon from the backend; lookup only, no usage reserved",
    );
  } finally {
    await context?.close();
    await browser.close();
  }
})().catch(() => {
  console.error(`FAIL coupon checkout at ${stage}; no real orders or customer data used`);
  process.exitCode = 1;
});
