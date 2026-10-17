/** Read-only staging check using an existing synthetic unpaid pickup order.
 * ORDER_STATUS_FIXTURE: private JSON exported by an authorized, guarded read.
 * No registration, checkout, order edits, chat messages or notification sends. */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium, request, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
let stage = "fixture validation";
(async () => {
  const fixture = JSON.parse(fs.readFileSync(process.env.ORDER_STATUS_FIXTURE, "utf8"));
  assert(/^checkout-qa-\d+@example\.invalid$/.test(fixture.emailComprador));
  assert.equal(fixture.statusPago, "pendiente");
  assert.equal(fixture.metodoEnvio, "click_collect");
  const query = new URLSearchParams({ folio: fixture.folioPublico, email: fixture.emailComprador });
  const api = await request.newContext({ baseURL: base });
  try {
    stage = "verified real API response";
    const response = await api.get(`/api/seguimiento?${query}`);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()["cache-control"], "private, no-store");
    const order = await response.json();
    assert.equal(order.folioPublico, fixture.folioPublico);
    assert.equal(Number(order.total), Number(fixture.total));
    assert.equal(order.metodoEnvio, "click_collect");
    assert(Array.isArray(order.eventos));
    console.log(
      "PASS real tracking API returns the known QA order and a private noncacheable response",
    );
    stage = "wrong purchase email";
    const wrong = new URLSearchParams({
      folio: fixture.folioPublico,
      email: "qa-wrong-order-status@example.invalid",
    });
    const denied = await api.get(`/api/seguimiento?${wrong}`);
    assert.equal(denied.status(), 404);
    assert(!Object.hasOwn(await denied.json(), "total"));
    console.log("PASS wrong purchase email returns 404 without exposing order totals");
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      await context.route("**/api/**", (r) =>
        r.request().method() === "GET" ? r.continue() : r.abort(),
      );
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      stage = "real receipt";
      await page.goto(`${base}/gracias?${query}`);
      await page
        .getByRole("heading", {
          name:
            order.statusPedido === "cancelado"
              ? "Tu pedido fue cancelado"
              : "Tu pedido quedó registrado",
          exact: true,
        })
        .waitFor();
      await page
        .getByText(`Total del pedido: $${Number(order.total).toFixed(2)}`, { exact: true })
        .waitFor();
      stage = "real tracking UI";
      await page.goto(`${base}/seguimiento?${query}`);
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await page.getByText(`Total: $${Number(order.total).toFixed(2)}`, { exact: true }).waitFor();
      console.log("PASS real receipt and tracking UI match the order returned by staging");
      stage = "receipt with incorrect email";
      await page.goto(`${base}/gracias?${wrong}&recogida=1`);
      await page.locator("main").getByRole("alert").waitFor();
      await expect(
        page.getByRole("heading", { name: "Tu pedido quedó registrado", exact: true }),
      ).toHaveCount(0);
      console.log(
        "PASS incorrect-email receipt never claims a registered purchase despite recogida=1",
      );
    } finally {
      await context.close();
      await browser.close();
    }
  } finally {
    await api.dispose();
  }
  console.log(
    "PASS read-only live order validation; existing QA order unchanged, no messages or purchases",
  );
})().catch(() => {
  console.error(`FAIL read-only order status at ${stage}; fixture identifiers withheld`);
  process.exitCode = 1;
});
