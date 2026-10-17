/** Published profile UI and guest boundaries. Authenticated writes are blocked. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
let stage = "private fixture";
(async () => {
  const account = JSON.parse(fs.readFileSync(process.env.PERFIL_QA_ACCOUNT, "utf8"));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: base,
    viewport: { width: 390, height: 844 },
    locale: "es-MX",
  });
  try {
    stage = "guest authorization";
    for (const [method, url] of [
      ["put", "/api/cuenta/perfil"],
      ["post", "/api/cuenta/cambiar-password"],
    ]) {
      const res = await context.request[method](url, { data: {}, timeout: 20000 });
      assert.equal(res.status(), 401);
      assert.match(res.headers()["cache-control"], /private.*no-store/);
    }
    console.log("PASS both guest mutations require a session and disable caching");
    stage = "buyer login and actual profile";
    assert.equal(
      (
        await context.request.post("/api/cuenta/login", {
          data: { email: account.email, password: account.password },
        })
      ).status(),
      200,
    );
    const me = await context.request.get("/api/cuenta/me");
    assert.equal(me.status(), 200);
    const data = await me.json();
    assert.equal(data.email, account.email);
    stage = "authenticated input rejection without persistence";
    for (const [method, url] of [
      ["put", "/api/cuenta/perfil"],
      ["post", "/api/cuenta/cambiar-password"],
    ]) {
      const rejected = await context.request[method](url, { data: {}, timeout: 20000 });
      assert.equal(rejected.status(), 400);
      assert.match(rejected.headers()["cache-control"], /private.*no-store/);
    }
    console.log("PASS authenticated malformed inputs are rejected before persistence");
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.name));
    await page.route("**/api/**", (route) =>
      route.request().method() === "GET" ? route.continue() : route.abort(),
    );
    assert.equal(
      (await page.goto(`${base}/cuenta`, { waitUntil: "domcontentloaded" })).status(),
      200,
    );
    const profile = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "Mis datos", exact: true }) });
    const password = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "Cambiar contraseña", exact: true }) });
    await expect(profile.getByLabel("Nombre", { exact: true })).toHaveValue(data.nombre);
    await expect(profile.getByLabel("Teléfono", { exact: true })).toHaveValue(data.telefono ?? "");
    await expect(
      password.getByLabel("Confirma la nueva contraseña", { exact: true }),
    ).toBeVisible();
    console.log("PASS real buyer profile and password confirmation render in published mobile UI");
    stage = "mobile controls and validation without writes";
    for (const form of [profile, password]) {
      const button = form.getByRole("button", { name: /^(Guardar|Actualizar)$/ });
      const box = await button.boundingBox();
      assert(box && box.height >= 44);
    }
    await profile.getByLabel("Nombre", { exact: true }).fill("   ");
    await profile.getByRole("button", { name: "Guardar", exact: true }).click();
    assert.equal(
      await profile.getByLabel("Nombre", { exact: true }).evaluate((el) => el.validity.valid),
      false,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await expect(profile.getByRole("status")).toHaveCount(0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS mobile targets, whitespace validation, no horizontal overflow or JavaScript errors; all authenticated writes blocked",
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(() => {
  console.error(`FAIL profile access at ${stage}; private values withheld`);
  process.exitCode = 1;
});
