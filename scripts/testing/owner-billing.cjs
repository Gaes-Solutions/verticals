/** Real owner API/UI; bank interaction below is explicitly simulated, with no provider credentials. */
const assert = require("node:assert/strict");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const db = new URL(process.env.DATABASE_URL_MASTER);
assert(["127.0.0.1", "localhost"].includes(db.hostname) && /^\/qa_platform_\d+$/.test(db.pathname));
const base = "http://127.0.0.1:5180";
const money = (cents, currency) =>
  (cents / 100).toLocaleString("es-MX", { style: "currency", currency });
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const response = await context.request.post(`${base}/api/auth/tenant/login`, {
      data: { email: "qa-ui-owner@example.invalid", password: "QaOwnerTest!2026" },
    });
    assert.equal(response.status(), 200);
    const { accessToken } = await response.json();
    const headers = { Authorization: `Bearer ${accessToken}` };
    const billing = await (await context.request.get(`${base}/api/billing/me`, { headers })).json();
    const invoices = await (
      await context.request.get(`${base}/api/billing/invoices`, { headers })
    ).json();
    const p = await context.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript((token) => {
      localStorage.setItem("gaespos_admin_token", token);
      localStorage.setItem("gaespos_admin_permisos", JSON.stringify(["*"]));
    }, accessToken);
    await p.goto(base);
    await p.getByRole("button", { name: "Mi suscripción", exact: true }).first().click();
    await p.getByRole("heading", { name: "Mi suscripción", exact: true }).waitFor();
    await p
      .getByText("La captura de tarjeta en línea aún no está disponible.", { exact: true })
      .waitFor();
    const sub = billing.subscription;
    const price = sub.plan.prices.find(
      (price) => price.currency === sub.currency && price.interval === sub.interval,
    );
    assert(price);
    assert((await p.locator("main").innerText()).includes(money(price.unitAmount, sub.currency)));
    if (sub.status === "trialing") await p.getByText(/Prueba gratis hasta/).waitFor();
    const first = invoices[0];
    const row = p.locator("tr").filter({ hasText: first.invoiceNumber });
    assert.equal(await row.count(), 1);
    assert((await row.innerText()).includes(money(first.total, first.currency)));
    await p.setViewportSize({ width: 320, height: 740 });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    console.log(
      "PASS real owner billing at desktop/mobile: actual plan price, cents/currency, invoice folio, trial date, absent-provider explanation",
    );

    const target = invoices.find((i) => i.status === "open");
    assert(target);
    let bankAttempts = 0;
    let confirmed = false;
    await p.exposeFunction("qaConfirmBank", async (secret, data) => {
      assert.equal(secret, "pi_browser_secret_test");
      assert.equal(data.payment_method, "pm_browser");
      bankAttempts++;
      if (bankAttempts === 1)
        return { error: { message: "El banco canceló la autenticación de prueba" } };
      confirmed = true;
      return { paymentIntent: { status: "succeeded" } };
    });
    await p.addInitScript(() => {
      window.Stripe = () => ({
        confirmCardPayment: (secret, data) => window.qaConfirmBank(secret, data),
      });
    });
    await p.route("**/api/billing/stripe-config", (route) =>
      route.fulfill({ json: { publishableKey: "pk_test_browser_fake" } }),
    );
    await p.route(`**/api/billing/invoices/${target.id}/recover-payment`, (route) => {
      assert.equal(route.request().method(), "POST");
      return route.fulfill({
        json: confirmed
          ? { status: "succeeded" }
          : {
              status: "requires_action",
              clientSecret: "pi_browser_secret_test",
              paymentMethodId: "pm_browser",
            },
      });
    });
    await p.route("**/api/billing/invoices", (route) =>
      route.fulfill({
        json: invoices.map((i) => (i.id === target.id && confirmed ? { ...i, status: "paid" } : i)),
      }),
    );
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.reload();
    await p.getByRole("button", { name: "Mi suscripción", exact: true }).first().click();
    await p.setViewportSize({ width: 320, height: 740 });
    const button = p
      .locator("tr")
      .filter({ hasText: target.invoiceNumber })
      .getByRole("button", { name: "Completar pago", exact: true });
    await button.click();
    await p.getByRole("status").filter({ hasText: "El banco canceló" }).waitFor();
    await button.click();
    await p.getByRole("status").filter({ hasText: "Pago confirmado" }).waitFor();
    await p
      .locator("tr")
      .filter({ hasText: target.invoiceNumber })
      .getByText("Pagada", { exact: true })
      .waitFor();
    assert.equal(bankAttempts, 2);
    assert.deepEqual(errors, []);
    console.log(
      "PASS simulated bank authentication: cancellation, retry, server reconciliation, paid state; no real charge",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
