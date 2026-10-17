/** Actual root checkout, synthetic pending orders and HTTP fixtures only.
 * UI API requests intercepted; optional published check also reads the real guest BFF.
 * No order, payment, address or notification writes.
 * Without STOREFRONT_TEST_URL, bundles the real page into a local browser harness. */
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const owner = "qa-recovery-owner";
const key = "55555555-5555-4555-a555-555555555555";
const paymentKey = `gaespos_pago_pendiente_v2:${owner}`;
const attemptKey = "gaespos_checkout_attempt_v1";
const payment = {
  folioPublico: "QA-RECOVERY",
  total: "100.00",
  referenciaPago: "123456789012345678",
  metodo: "spei",
};
const pending = { ...payment, intentStatus: "pendiente" };
const item = { varianteId: "qa-local", titulo: "Producto QA", precio: "100.00", cantidad: 1 };
let stage = "setup";
(async () => {
  let server;
  let browser;
  let context;
  let groups = 0;
  try {
    let base = process.env.STOREFRONT_TEST_URL;
    const published = Boolean(base);
    if (base)
      assert(
        ["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(
          new URL(base).hostname,
        ),
      );
    else {
      const app = path.join(process.cwd(), "apps/web-tienda");
      const esbuild = require(
        require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
      );
      const bundle = await esbuild.build({
        absWorkingDir: app,
        stdin: {
          resolveDir: app,
          loader: "tsx",
          contents: `import {createRoot} from 'react-dom/client';import Checkout from './src/app/checkout/page';const root=createRoot(document.getElementById('root'));window.unmountCheckout=()=>root.unmount();root.render(<Checkout/>);`,
        },
        bundle: true,
        write: false,
        jsx: "automatic",
        define: { "process.env.NODE_ENV": '"production"' },
        plugins: [
          {
            name: "next-browser-fixtures",
            setup(build) {
              build.onResolve({ filter: /^next\/(link|navigation)$/ }, (args) => ({
                path: args.path,
                namespace: "fixture",
              }));
              build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
                loader: "tsx",
                resolveDir: app,
                contents:
                  args.path === "next/link"
                    ? "export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}"
                    : "export function useRouter(){return {push(url){window.qaNavigation=url}}}",
              }));
            },
          },
        ],
      });
      server = http.createServer((req, res) => {
        if (req.url === "/bundle.js") {
          res.setHeader("content-type", "application/javascript");
          return res.end(bundle.outputFiles[0].contents);
        }
        if (req.url === "/styles.css") {
          res.setHeader("content-type", "text/css");
          return res.end(
            process.env.RECOVERY_QA_CSS ? fs.readFileSync(process.env.RECOVERY_QA_CSS) : "",
          );
        }
        res.end(
          '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>',
        );
      });
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${server.address().port}`;
    }
    browser = await chromium.launch();
    const pass = () => {
      groups++;
      console.log(`PASS ${stage}`);
    };
    const setup = async (storedPayment = payment, submitted = true) => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        locale: "es-MX",
        serviceWorkers: "block",
      });
      await context.addInitScript(
        ({ owner, key, paymentKey, attemptKey, payment, item, submitted }) => {
          if (!localStorage.getItem("qa-recovery-seeded")) {
            localStorage.setItem("qa-recovery-seeded", "1");
            localStorage.setItem(paymentKey, JSON.stringify(payment));
            localStorage.setItem(attemptKey, JSON.stringify({ context: owner, key, submitted }));
            localStorage.setItem("gaespos_carrito", JSON.stringify([item]));
          }
          const timeout = AbortSignal.timeout.bind(AbortSignal);
          AbortSignal.timeout = (ms) => timeout(ms === 20000 && window.qaFastDeadline ? 500 : ms);
        },
        { owner, key, paymentKey, attemptKey, payment: storedPayment, item, submitted },
      );
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const fixture = { mode: "pending", reads: 0, writes: 0, release: null, errors: [] };
      page.on("pageerror", (e) => fixture.errors.push(e.message));
      await page.route("**/api/**", async (route) => {
        const req = route.request();
        const pathname = new URL(req.url()).pathname;
        if (req.method() !== "GET") {
          fixture.writes++;
          return route.abort();
        }
        if (pathname === "/api/checkout/session")
          return route.fulfill({ json: { context: owner, guestContext: owner } });
        if (pathname === "/api/checkout") {
          fixture.reads++;
          const url = new URL(req.url());
          assert.equal(url.searchParams.get("context"), owner);
          assert.equal(url.searchParams.get("idempotencyKey"), key);
          const mode = fixture.mode;
          const lateConfirmed = fixture.lateConfirmed;
          if (mode === "network") return route.abort();
          if (mode === "delayed")
            await new Promise((r) => {
              fixture.release = r;
            });
          if (mode === "timeout") await new Promise((r) => setTimeout(r, 1200));
          const options =
            mode === "session"
              ? { status: 401, contentType: "text/plain", body: "unauthorized" }
              : mode === "error"
                ? { status: 503, json: { message: "No pudimos consultar; conserva el intento." } }
                : mode === "malformed"
                  ? { contentType: "application/json", body: "broken" }
                  : mode === "failed-stripe"
                    ? {
                        json: {
                          ...pending,
                          intentStatus: "fallido",
                          paymentProvider: "stripe",
                          clientSecret: "qa_failed_secret",
                        },
                      }
                    : mode === "changed-reference"
                      ? { json: { ...pending, referenciaPago: "987654321098765432" } }
                      : mode === "invalid"
                        ? { json: { ...pending, total: "NaN" } }
                        : mode === "other-order"
                          ? {
                              json: {
                                ...pending,
                                folioPublico: "QA-OTHER-ORDER",
                                intentStatus: "confirmado",
                              },
                            }
                          : mode === "unsafe404"
                            ? { status: 404, json: { code: "ATTEMPT_NOT_FOUND" } }
                            : mode === "safe404"
                              ? {
                                  status: 404,
                                  json: { code: "ATTEMPT_NOT_FOUND", safeToRetry: true },
                                }
                              : mode === "confirmed" || lateConfirmed
                                ? {
                                    json: {
                                      folioPublico: payment.folioPublico,
                                      total: payment.total,
                                      intentStatus: "confirmado",
                                    },
                                  }
                                : { json: pending };
          return route.fulfill(options).catch(() => {});
        }
        if (pathname === "/api/tienda-config")
          return route.fulfill({
            json: {
              msiHabilitado: false,
              msiMeses: [],
              msiMontoMinimo: "0",
              cuponEnCheckout: false,
              envioGratisDesde: null,
              metodosPago: [],
              proveedorPago: null,
            },
          });
        if (pathname === "/api/envios")
          return route.fulfill({
            json: {
              pickup: [
                { sucursalId: "qa", nombre: "Sucursal QA", tiempoPreparacionPromedioMin: 30 },
              ],
              opcionesEnvio: [],
            },
          });
        return route.fulfill({ status: 401, json: {} });
      });
      await page.goto(`${base}/checkout`, { waitUntil: "domcontentloaded" });
      if (storedPayment && storedPayment.total !== "NaN")
        await expect(
          page.getByRole("button", { name: "Ya pagué · consultar estado" }),
        ).toBeEnabled();
      return { page, fixture };
    };
    const retained = async (page) => {
      const data = await page.evaluate(
        ({ paymentKey, attemptKey }) => ({
          payment: JSON.parse(localStorage.getItem(paymentKey)),
          attempt: JSON.parse(localStorage.getItem(attemptKey)),
          cart: JSON.parse(localStorage.getItem("gaespos_carrito")),
        }),
        { paymentKey, attemptKey },
      );
      assert.deepEqual(data.payment, payment);
      assert.deepEqual(data.attempt, { context: owner, key, submitted: true });
      assert.equal(data.cart.length, 1);
    };
    stage =
      "one status request for repeated clicks; pending result announced and restored after reload";
    let { page, fixture } = await setup();
    fixture.mode = "delayed";
    await page.getByRole("button", { name: "Ya pagué · consultar estado" }).evaluate((button) => {
      button.click();
      button.click();
    });
    await expect.poll(() => fixture.reads).toBe(1);
    await expect(page.getByRole("button", { name: "Consultando…" })).toBeDisabled();
    fixture.release();

    await expect(page.getByRole("status")).toContainText("El pago sigue pendiente");
    await retained(page);
    await page.reload();
    await expect(page.getByText(payment.referenciaPago, { exact: true })).toBeVisible();
    await retained(page);
    assert.equal(fixture.writes, 0);
    assert.deepEqual(fixture.errors, []);
    pass();
    for (const mode of [
      "error",
      "malformed",
      "invalid",
      "other-order",
      "unsafe404",
      "network",
      "timeout",
    ]) {
      stage = `${mode}: visible error, original attempt/reference/cart retained, no automatic resend`;
      ({ page, fixture } = await setup());
      fixture.mode = mode;
      if (mode === "timeout")
        await page.evaluate(() => {
          window.qaFastDeadline = true;
        });
      await page.getByRole("button", { name: "Ya pagué · consultar estado" }).click();
      await expect(page.locator("#checkout-error")).toBeVisible();
      await expect(page.getByRole("button", { name: "Ya pagué · consultar estado" })).toBeEnabled();
      await retained(page);
      assert.equal(fixture.reads, 1);
      assert.equal(fixture.writes, 0);
      assert.deepEqual(fixture.errors, []);
      fixture.mode = "pending";
      await page.evaluate(() => {
        window.qaFastDeadline = false;
      });
      await page.getByRole("button", { name: "Ya pagué · consultar estado" }).click();
      await expect(page.getByRole("status")).toContainText("El pago sigue pendiente");
      await expect(page.locator("#checkout-error")).toHaveCount(0);
      pass();
    }
    stage = "a failed Stripe intent shows the failure without attempting SDK confirmation";
    ({ page, fixture } = await setup(null));
    fixture.mode = "failed-stripe";
    await page.getByRole("button", { name: "Consultar estado del pago", exact: true }).click();
    await expect(page.locator("#checkout-error")).toContainText(
      "Contacta a la tienda antes de iniciar otro pago",
    );
    const failed = await page.evaluate(
      (attemptKey) => ({
        attempt: JSON.parse(localStorage.getItem(attemptKey)),
        cart: JSON.parse(localStorage.getItem("gaespos_carrito")),
      }),
      attemptKey,
    );
    assert.deepEqual(failed.attempt, { context: owner, key, submitted: true });
    assert.equal(failed.cart.length, 1);
    assert.equal(fixture.writes, 0);
    assert.deepEqual(fixture.errors, []);
    pass();
    stage = "a refreshed reference keeps the stored SPEI method for the same order";
    ({ page, fixture } = await setup());
    fixture.mode = "changed-reference";
    await page.getByRole("button", { name: "Ya pagué · consultar estado" }).click();
    await expect(page.getByText("987654321098765432", { exact: true })).toBeVisible();
    await expect(page.getByText("CLABE interbancaria (18 dígitos)", { exact: true })).toBeVisible();
    assert.equal(fixture.writes, 0);
    pass();
    stage = "a recovery without method metadata never invents OXXO payment instructions";
    ({ page, fixture } = await setup(null));
    await page.getByRole("button", { name: "Consultar estado del pago", exact: true }).click();
    await expect(page.locator("#checkout-error")).toContainText("no vuelvas a pagar");
    await expect(page.getByText("Referencia OXXO", { exact: true })).toHaveCount(0);
    assert.equal(fixture.reads, 1);
    assert.equal(fixture.writes, 0);
    pass();
    stage = "expired session with non-JSON body shows login action and preserves pending purchase";
    ({ page, fixture } = await setup());
    fixture.mode = "session";
    await page.getByRole("button", { name: "Ya pagué · consultar estado" }).click();
    await expect(page.locator("#checkout-session-notice")).toContainText("Inicia sesión");
    await expect(page.getByRole("link", { name: "Iniciar sesión para retomar" })).toHaveAttribute(
      "href",
      "/cuenta/login?next=%2Fcheckout",
    );
    await expect(page.getByRole("button", { name: "Ya pagué · consultar estado" })).toBeDisabled();
    await retained(page);
    assert.equal(fixture.writes, 0);
    pass();
    stage = "only explicit safe-not-found restores the same key without discarding the cart";
    ({ page, fixture } = await setup());
    fixture.mode = "safe404";
    await page.getByRole("button", { name: "Ya pagué · consultar estado" }).click();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    const recovered = await page.evaluate(
      ({ paymentKey, attemptKey }) => ({
        payment: localStorage.getItem(paymentKey),
        attempt: JSON.parse(localStorage.getItem(attemptKey)),
        cart: JSON.parse(localStorage.getItem("gaespos_carrito")),
      }),
      { paymentKey, attemptKey },
    );
    assert.equal(recovered.payment, null);
    assert.deepEqual(recovered.attempt, { context: owner, key, submitted: false });
    assert.equal(recovered.cart.length, 1);
    assert.equal(fixture.writes, 0);
    pass();
    stage = "corrupt persisted amount never produces payment instructions";
    ({ page, fixture } = await setup({ ...payment, total: "NaN" }));
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByText(payment.referenciaPago, { exact: true })).toHaveCount(0);
    assert.equal(fixture.writes, 0);
    pass();
    stage = "320px pending screen has no horizontal overflow and usable controls";
    ({ page, fixture } = await setup());
    await page.setViewportSize({ width: 320, height: 700 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const button of await page
      .getByRole("heading", { name: "Tu pedido quedó apartado", exact: true })
      .locator("..")
      .getByRole("button")
      .all()) {
      const box = await button.boundingBox();
      if (box) assert(box.height >= 44);
    }
    if (!published)
      await page.screenshot({ path: "/tmp/gaes-checkout-recovery.png", fullPage: true });
    pass();
    stage =
      "new checkout double click submits once and an unknown result keeps the same submitted attempt";
    ({ page, fixture } = await setup(null, false));
    await page.getByLabel("Email", { exact: true }).fill("recovery-qa@example.invalid");
    await page.getByLabel("Nombre completo", { exact: true }).fill("QA Recuperación");
    await page.getByRole("button", { name: "Recoger en tienda", exact: true }).click();
    const submit = page.getByRole("button", { name: "Apartar pedido · $100.00", exact: true });
    await expect(submit).toBeEnabled();
    await submit.evaluate((button) => {
      button.click();
      button.click();
    });
    await expect.poll(() => fixture.writes).toBe(1);
    await expect(page.locator("#checkout-error")).toBeVisible();
    const unknown = await page.evaluate(
      (attemptKey) => ({
        attempt: JSON.parse(localStorage.getItem(attemptKey)),
        cart: JSON.parse(localStorage.getItem("gaespos_carrito")),
      }),
      attemptKey,
    );
    assert.deepEqual(unknown.attempt, { context: owner, key, submitted: true });
    assert.equal(unknown.cart.length, 1);
    assert.equal(fixture.writes, 1);
    assert.deepEqual(fixture.errors, []);
    pass();
    if (!published) {
      stage = "unmount during status read ignores late confirmation and preserves recovery";
      ({ page, fixture } = await setup());
      fixture.mode = "delayed";
      fixture.lateConfirmed = true;
      await page.getByRole("button", { name: "Ya pagué · consultar estado" }).click();
      await expect.poll(() => fixture.reads).toBe(1);
      await page.evaluate(() => window.unmountCheckout());
      fixture.release();
      await page.waitForTimeout(200);
      await retained(page);
      assert.equal(await page.evaluate(() => window.qaNavigation), undefined);
      assert.deepEqual(fixture.errors, []);
      pass();
    }
    stage =
      "verified confirmation alone clears matching attempt/reference/cart and navigates to receipt";
    ({ page, fixture } = await setup());
    fixture.mode = "confirmed";
    await page.getByRole("button", { name: "Ya pagué · consultar estado" }).click();
    if (published) await expect(page).toHaveURL(/\/gracias\?folio=QA-RECOVERY/);
    else
      await expect
        .poll(() => page.evaluate(() => window.qaNavigation))
        .toContain("/gracias?folio=QA-RECOVERY");
    const finished = await page.evaluate(
      ({ paymentKey, attemptKey }) => ({
        payment: localStorage.getItem(paymentKey),
        attempt: localStorage.getItem(attemptKey),
        cart: JSON.parse(localStorage.getItem("gaespos_carrito")),
      }),
      { paymentKey, attemptKey },
    );
    assert.equal(finished.payment, null);
    assert.equal(finished.attempt, null);
    assert.deepEqual(finished.cart, []);
    assert.equal(fixture.writes, 0);
    assert.deepEqual(fixture.errors, []);
    pass();
    if (published) {
      stage = "real guest BFF read: private safe-not-found without creating an order";
      const sessionResponse = await context.request.get(`${base}/api/checkout/session`);
      assert.equal(sessionResponse.status(), 200);
      const session = await sessionResponse.json();
      assert.equal(typeof session.context, "string");
      const params = new URLSearchParams({
        context: session.context,
        idempotencyKey: require("node:crypto").randomUUID(),
      });
      const response = await context.request.get(`${base}/api/checkout?${params}`);
      assert.equal(response.status(), 404);
      assert.equal(response.headers()["cache-control"], "private, no-store");
      assert.deepEqual(Object.keys(await response.json()).sort(), [
        "code",
        "message",
        "safeToRetry",
      ]);
      pass();
    }
    console.log(
      `PASS ${groups} ${published ? "published" : "local"} recovery groups; synthetic results only, no business writes`,
    );
  } catch (e) {
    console.error(`FAIL ${stage}: ${e.message}`);
    process.exitCode = 1;
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    if (server) await new Promise((r) => server.close(r));
  }
})();
