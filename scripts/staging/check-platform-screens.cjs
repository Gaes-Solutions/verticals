/** Read-only platform screen audit, including injected failures and recovery.
 * PLATFORM_QA_ACCOUNTS: private JSON [{ role, token }] with disposable staging admin sessions.
 * PLATFORM_TEST_URL: staging panel or localhost proxy to staging. Never production.
 */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const base = process.env.PLATFORM_TEST_URL || "https://web-superadmin-staging.up.railway.app";
assert(
  ["localhost", "127.0.0.1", "web-superadmin-staging.up.railway.app"].includes(
    new URL(base).hostname,
  ),
);
const accounts = JSON.parse(fs.readFileSync(process.env.PLATFORM_QA_ACCOUNTS, "utf8"));
const expected = { superadmin: 14, support: 2, billing: 4 };
(async () => {
  const browser = await chromium.launch();
  let checks = 0;
  try {
    for (const account of accounts) {
      assert(account.token && expected[account.role]);
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(
        (token) => localStorage.setItem("gaespos_super_token", token),
        account.token,
      );
      await page.goto(base);
      await page.locator("aside nav button").first().waitFor();
      const labels = await page.locator("aside nav button").allTextContents();
      assert.equal(labels.length, expected[account.role]);
      const navigate = async (label, width) => {
        if (width === 320) await page.getByRole("button", { name: "Menú", exact: true }).click();
        await page.locator("aside nav button").filter({ hasText: label }).click();
        await page.waitForTimeout(750);
        await page.waitForLoadState("networkidle");
        await page.waitForFunction(() => {
          const main = document.querySelector("main");
          return main && !/Cargando|Recorriendo/.test(main.textContent);
        });
      };
      for (const width of [1280, 320]) {
        await page.setViewportSize({ width, height: 900 });
        for (const label of labels) {
          const failed = [];
          const listener = (response) => {
            if (response.url().includes("/api/") && response.status() >= 400)
              failed.push(response.status());
          };
          page.on("response", listener);
          await navigate(label, width);
          const main = page.locator("main");
          const text = await main.innerText();
          assert(
            text.length > 10 && !/Cargando|Recorriendo/.test(text),
            `${account.role}: ${label} stuck loading`,
          );
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
            `${label}: page overflow`,
          );
          const tabs = label.includes("Partners")
            ? ["Comisiones", "Payouts"]
            : label.includes("Planes y cupones")
              ? ["Cupones", "Planes"]
              : [];
          for (const tab of tabs) {
            await main.getByRole("button", { name: tab, exact: true }).click();
            await page.waitForTimeout(750);
            await page.waitForLoadState("networkidle");
            await page.waitForFunction(() => {
              const main = document.querySelector("main");
              return main && !/Cargando|Recorriendo/.test(main.textContent);
            });
          }
          // Exercise each list filter without modifying business records.
          for (const select of await main.locator("select").all()) {
            const values = await select
              .locator("option")
              .evaluateAll((options) => options.map((o) => o.value));
            if (values.length > 1) {
              await select.selectOption(values[1]);
              await page.waitForTimeout(750);
              await page.waitForLoadState("networkidle");
              await page.waitForFunction(() => {
                const main = document.querySelector("main");
                return main && !/Cargando|Recorriendo/.test(main.textContent);
              });
              await select.selectOption(values[0]);
              await page.waitForTimeout(750);
              await page.waitForLoadState("networkidle");
              await page.waitForFunction(() => {
                const main = document.querySelector("main");
                return main && !/Cargando|Recorriendo/.test(main.textContent);
              });
            }
          }
          assert.deepEqual(failed, [], `${account.role}: ${label} failed API calls`);
          page.off("response", listener);
          checks++;
        }
      }
      // Every screen must show an honest error and recover on retry.
      if (account.role === "superadmin") {
        await page.setViewportSize({ width: 1280, height: 900 });
        for (const label of labels) {
          // Unmount first so the current screen's initial read is exercised too.
          const other = labels.find((item) => item !== label);
          await navigate(other, 1280);
          let injected = false;
          const failOnce = async (route) => {
            const path = new URL(route.request().url()).pathname;
            if (!injected && route.request().method() === "GET" && path !== "/api/auth/me") {
              injected = true;
              await route.fulfill({
                status: 503,
                contentType: "text/html",
                body: "Temporarily unavailable",
              });
            } else await route.continue();
          };
          await page.route("**/api/**", failOnce);
          await navigate(label, 1280);
          await page
            .getByRole("alert")
            .filter({ hasText: "No se pudo cargar esta pantalla" })
            .waitFor();
          assert(injected);
          await page.unroute("**/api/**", failOnce);
          await page.getByRole("button", { name: "Reintentar", exact: true }).click();
          await page.waitForTimeout(750);
          await page.waitForLoadState("networkidle");
          await page.waitForFunction(() => {
            const main = document.querySelector("main");
            return main && !/Cargando|Recorriendo/.test(main.textContent);
          });
          assert.equal(await page.getByRole("alert").count(), 0);
          assert(!/Cargando|Recorriendo/.test(await page.locator("main").innerText()));
          checks++;
        }
      }
      if (account.role === "superadmin") {
        const forms = [
          ["Clientes", null, "+ Crear cliente"],
          ["Roles predefinidos", null, "+ Nuevo rol predefinido"],
          ["Planes y cupones", null, "+ Nuevo plan"],
          ["Planes y cupones", "Cupones", "+ Nuevo cupón"],
          ["Partners", null, "+ Nuevo partner"],
          ["Partners", "Payouts", "+ Generar payout"],
          ["Equipo", null, "+ Nuevo admin"],
        ];
        for (const width of [1280, 320]) {
          await page.setViewportSize({ width, height: 740 });
          for (const [section, tab, button] of forms) {
            await navigate(
              labels.find((label) => label.includes(section)),
              width,
            );
            if (tab)
              await page.locator("main").getByRole("button", { name: tab, exact: true }).click();
            await page.getByRole("button", { name: button, exact: true }).click();
            const modal = page.locator(".gx-modal-panel");
            await modal.waitFor();
            await page.waitForLoadState("networkidle");
            const box = await modal.boundingBox();
            assert(box.y >= 0 && box.y + box.height <= 741, `${button} modal clipped`);
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
              false,
            );
            await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
            await modal.waitFor({ state: "hidden" });
          }
        }
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${account.role}: permitted screens, tabs, filters, desktop/mobile${account.role === "superadmin" ? ", all 14 failure/retry paths" : ""}`,
      );
      await context.close();
    }
    assert.equal(checks, 54);
    console.log(`PASS ${checks} screen checks; no business records modified`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
