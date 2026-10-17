/** Public storefront status/receipt UI regression, with controlled order responses.
 * Blocks browser mutations. Does not submit checkout or send messages. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
assert(
  ["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(new URL(base).hostname),
);
const fixture = {
  folioPublico: "QA-1",
  statusPedido: "recibido",
  statusLabel: "Recibido en tienda",
  metodoEnvio: "click_collect",
  total: "10.00",
  guiaTracking: null,
  eventos: [],
};
(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  async function test(name, run) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      await context.addInitScript(() => {
        const timeout = AbortSignal.timeout.bind(AbortSignal);
        AbortSignal.timeout = (ms) => timeout(Math.min(ms, 1000));
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const mode = { kind: "valid", data: fixture, calls: 0, pending: [] };
      await page.route("**/api/**", async (r) => {
        if (r.request().method() !== "GET") return r.abort();
        if (new URL(r.request().url()).pathname !== "/api/seguimiento") return r.continue();
        mode.calls++;
        if (mode.kind === "network") return r.abort();
        if (mode.kind === "notfound")
          return r.fulfill({ status: 404, json: { message: "Pedido no encontrado" } });
        if (mode.kind === "unavailable")
          return r.fulfill({
            status: 503,
            json: { message: "Servicio temporalmente no disponible" },
          });
        if (mode.kind === "invalid") return r.fulfill({ json: {} });
        if (mode.kind === "timeout") {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return r.fulfill({ json: mode.data }).catch(() => {});
        }
        if (mode.kind === "delayed")
          return new Promise((resolve) =>
            mode.pending.push(async () => {
              await r.fulfill({ json: mode.data }).catch(() => {});
              resolve();
            }),
          );
        return r.fulfill({ json: mode.data });
      });
      await run({ page, mode });
      assert.deepEqual(errors, []);
      console.log(`PASS ${name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${name}: ${e.stack}`);
    } finally {
      await context.close();
    }
  }
  const tracking = async (page) => {
    await page.goto(`${base}/seguimiento?folio=QA-1&email=qa%40example.invalid`);
  };
  try {
    await test("tracking never confirms a purchase from ok=1 alone", async ({ page }) => {
      await page.goto(`${base}/seguimiento?folio=QA-1&email=qa%40example.invalid&ok=1`);
      await page.getByRole("heading", { name: "Rastrear pedido", exact: true }).waitFor();
      assert(!/fue confirmado/.test(await page.locator("main").innerText()));
    });
    await test("malformed tracking response remains recoverable without a runtime crash", async ({
      page,
      mode,
    }) => {
      mode.kind = "invalid";
      await tracking(page);
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await page.locator("main").getByRole("alert").waitFor();
      await expect(page.getByLabel("Folio", { exact: true })).toHaveValue("QA-1");
    });
    await test("tracking timeout recovers and keeps purchase identifiers", async ({
      page,
      mode,
    }) => {
      mode.kind = "timeout";
      await tracking(page);
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await page.locator("main").getByRole("alert").waitFor();
      await expect(page.getByRole("button", { name: "Buscar", exact: true })).toBeEnabled();
      await expect(page.getByLabel("Email de compra", { exact: true })).toHaveValue(
        "qa@example.invalid",
      );
    });
    await test("editing search identifiers discards an older in-flight result", async ({
      page,
      mode,
    }) => {
      mode.kind = "delayed";
      await tracking(page);
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect.poll(() => mode.pending.length).toBe(1);
      await page.getByLabel("Folio", { exact: true }).fill("QA-2");
      await mode.pending[0]();
      await page.waitForTimeout(150);
      assert.equal(await page.getByText("Total: $10.00", { exact: true }).count(), 0);
      await expect(page.getByLabel("Folio", { exact: true })).toHaveValue("QA-2");
    });
    await test("repeated tracking submit is a single request", async ({ page, mode }) => {
      mode.kind = "delayed";
      await tracking(page);
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect.poll(() => mode.pending.length).toBeGreaterThan(0);
      await page.locator("main form").evaluate((f) => {
        for (let n = 0; n < 3; n++)
          f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await expect.poll(() => mode.pending.length).toBeGreaterThan(0);
      assert.equal(mode.calls, 1);
      for (const finish of mode.pending) await finish();
    });
    await test("verified tracking honors the store status label and clears on input change", async ({
      page,
    }) => {
      await tracking(page);
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await page.getByText("Recibido en tienda", { exact: true }).waitFor();
      await page.getByLabel("Email de compra", { exact: true }).fill("another@example.invalid");
      assert.equal(await page.getByText("Total: $10.00", { exact: true }).count(), 0);
    });
    await test("receipt does not claim success while lookup is pending or after 404", async ({
      page,
      mode,
    }) => {
      mode.kind = "delayed";
      await page.goto(`${base}/gracias?folio=QA-1&email=qa%40example.invalid&recogida=1`);
      await expect.poll(() => mode.pending.length).toBeGreaterThan(0);
      assert.equal(
        await page
          .getByRole("heading", { name: "Tu pedido quedó registrado", exact: true })
          .count(),
        0,
      );
      for (const finish of mode.pending) await finish();
      await page
        .getByRole("heading", { name: "Tu pedido quedó registrado", exact: true })
        .waitFor();
      mode.kind = "notfound";
      await page.reload();
      await page.locator("main").getByRole("alert").waitFor();
      assert.equal(
        await page
          .getByRole("heading", { name: "Tu pedido quedó registrado", exact: true })
          .count(),
        0,
      );
    });
    await test("receipt network failure offers an explicit successful retry", async ({
      page,
      mode,
    }) => {
      mode.kind = "network";
      await page.goto(`${base}/gracias?folio=QA-1&email=qa%40example.invalid`);
      await page.locator("main").getByRole("alert").waitFor();
      mode.kind = "valid";
      await page.getByRole("button", { name: "Reintentar consulta", exact: true }).click();
      await page
        .getByRole("heading", { name: "Tu pedido quedó registrado", exact: true })
        .waitFor();
      await page
        .getByText(
          "No se realizó ningún cobro en línea. Paga tu pedido cuando lo recojas en la tienda.",
          { exact: true },
        )
        .waitFor();
    });
    await test("missing purchase email does not leave a false receipt loading forever", async ({
      page,
      mode,
    }) => {
      await page.goto(`${base}/gracias?folio=QA-1&recogida=1`);
      await page.locator("main").getByRole("alert").waitFor();
      assert.equal(mode.calls, 0);
      assert.equal(
        await page
          .getByRole("heading", { name: "Tu pedido quedó registrado", exact: true })
          .count(),
        0,
      );
    });
    await test("a canceled order is displayed as canceled instead of a new confirmed purchase", async ({
      page,
      mode,
    }) => {
      mode.data = { ...fixture, statusPedido: "cancelado", statusLabel: undefined };
      await page.goto(`${base}/gracias?folio=QA-1&email=qa%40example.invalid`);
      await page.getByRole("heading", { name: "Tu pedido fue cancelado", exact: true }).waitFor();
      await page.getByText("Cancelado", { exact: true }).waitFor();
    });
    await test("malformed receipt never invents an order total and remains retryable", async ({
      page,
      mode,
    }) => {
      mode.kind = "invalid";
      await page.goto(`${base}/gracias?folio=QA-1&email=qa%40example.invalid`);
      await page.locator("main").getByRole("alert").waitFor();
      assert(!/NaN/.test(await page.locator("main").innerText()));
      await expect(
        page.getByRole("button", { name: "Reintentar consulta", exact: true }),
      ).toBeEnabled();
    });
    await test("mobile and desktop tracking remain usable with long status and guide", async ({
      page,
      mode,
    }) => {
      mode.data = {
        ...fixture,
        statusLabel: "Estado".repeat(30),
        guiaTracking: "1234567890".repeat(18),
        eventos: [
          { tipo: "qa", descripcion: "Actualización".repeat(40), fecha: "2026-10-17T12:00:00Z" },
        ],
      };
      await tracking(page);
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await page.getByText("Total: $10.00", { exact: true }).waitFor();
      fs.mkdirSync("/tmp/gaes-order-status", { recursive: true, mode: 0o700 });
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        const size = await page.getByRole("button", { name: "Buscar", exact: true }).boundingBox();
        assert(size.height >= 44);
        await page.screenshot({
          path: `/tmp/gaes-order-status/tracking-${width}.png`,
          fullPage: true,
        });
      }
    });
  } finally {
    await browser.close();
  }
  if (failed) process.exitCode = 1;
  else
    console.log(
      "PASS 12 public order-status groups; browser responses simulated, no checkout/messages/payments/emails",
    );
})().catch((e) => {
  console.error(`Order status QA setup failed: ${e.name}`);
  process.exitCode = 1;
});
