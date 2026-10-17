/** Cold public product loads: prove fields become interactive and retain input.
 * All API writes are blocked. No shipping request, account edit, order or message is sent. */
const assert = require("node:assert/strict");
const { chromium, expect } = require("@playwright/test");
const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
assert(
  ["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(new URL(base).hostname),
);
(async () => {
  const browser = await chromium.launch();
  let context;
  let sample = 0;
  let diagnostic;
  try {
    for (sample = 1; sample <= 8; sample++) {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const current = { writes: 0, errors: [], assets: [] };
      diagnostic = current;
      page.on("pageerror", (e) => current.errors.push(e.message));
      page.on("requestfailed", (req) => {
        const path = new URL(req.url()).pathname;
        if (path.startsWith("/_next/"))
          current.assets.push({ path, failure: req.failure()?.errorText });
      });
      page.on("response", (res) => {
        const path = new URL(res.url()).pathname;
        if (path.startsWith("/_next/") && res.status() >= 400)
          current.assets.push({ path, status: res.status() });
      });
      await page.route("**/api/**", (route) => {
        if (route.request().method() !== "GET") {
          current.writes++;
          return route.abort();
        }
        return route.continue();
      });
      const start = Date.now();
      assert.equal(
        (
          await page.goto(`${base}/producto/demo-lampara`, { waitUntil: "domcontentloaded" })
        ).status(),
        200,
      );
      const region = page.getByRole("region", { name: "¿Cuándo llega?", exact: true });
      const cp = region.getByLabel("Código postal", { exact: true });
      await expect(cp).toBeEnabled({ timeout: 15000 });
      const readyMs = Date.now() - start;
      await cp.fill("06000");
      await region.getByLabel("Estado (opcional)", { exact: true }).fill("Ciudad de México");
      await expect(cp).toHaveValue("06000");
      await expect(region.getByLabel("Estado (opcional)", { exact: true })).toHaveValue(
        "Ciudad de México",
      );
      assert.equal(current.writes, 0);
      assert.deepEqual(current.errors, []);
      assert.deepEqual(current.assets, []);
      console.log(JSON.stringify({ sample, readyMs, errors: 0, assetErrors: 0, writes: 0 }));
    }
    console.log(
      "PASS 8 cold public product loads; interactive fields retain input; no business writes",
    );
  } catch (e) {
    console.error(JSON.stringify({ sample, message: e.message, diagnostic }));
    process.exitCode = 1;
  } finally {
    if (context) await context.close();
    await browser.close();
  }
})();
