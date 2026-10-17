/** Real staging shopper login; tests failed logout and retry without business writes.
 * STOREFRONT_LOGOUT_ACCOUNT: private JSON {email,password}; never logged.
 * STOREFRONT_TEST_URL: staging (default) or localhost running the changed frontend.
 */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
assert(
  ["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(new URL(base).hostname),
);
const account = JSON.parse(fs.readFileSync(process.env.STOREFRONT_LOGOUT_ACCOUNT, "utf8"));
let stage = "login";
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    context.setDefaultTimeout(30000);
    await context.route("**/api/**", (r) =>
      r.request().method() === "GET" ||
      ["/api/cuenta/login", "/api/cuenta/logout"].includes(new URL(r.request().url()).pathname)
        ? r.continue()
        : r.abort(),
    );
    const page = await context.newPage();
    await page.goto(`${base}/cuenta/login`, { timeout: 90000 });
    await page.getByLabel("Correo", { exact: true }).fill(account.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/cuenta");
    const logout = page.getByRole("button", { name: "Cerrar sesión", exact: true });
    await logout.waitFor();
    const cookie = (await context.cookies()).find((c) => c.name === "gaespos_cliente_token");
    assert(cookie);
    const key = "gaespos_checkout_draft_v1";
    const draft = JSON.stringify({
      expires: Date.now() + 120000,
      data: {
        email: "qa@example.invalid",
        nombre: "QA",
        calle: "QA",
        numero: "1",
        colonia: "QA",
        ciudad: "QA",
        estado: "QA",
        cp: "06060",
        modoEntrega: "envio",
      },
    });
    await page.evaluate(({ key, draft }) => sessionStorage.setItem(key, draft), { key, draft });
    for (const mode of ["http503", "network", "timeout"]) {
      stage = `failed logout ${mode}`;
      const failure = async (r) => {
        if (mode === "http503") return r.fulfill({ status: 503, body: "Temporarily unavailable" });
        if (mode === "timeout") await new Promise((resolve) => setTimeout(resolve, 20000));
        try {
          await r.abort("internetdisconnected");
        } catch {}
      };
      await page.route("**/api/cuenta/logout", failure);
      await logout.click();
      await page.getByRole("alert").filter({ hasText: "No se pudo cerrar la sesión" }).waitFor();
      assert.equal(new URL(page.url()).pathname, "/cuenta");
      assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), key), draft);
      assert.equal(
        (await context.cookies()).find((c) => c.name === cookie.name)?.value,
        cookie.value,
      );
      assert.equal(await logout.isEnabled(), true);
      await page.unroute("**/api/cuenta/logout", failure);
      console.log(
        `PASS ${mode}: visible failure, retry enabled, session and checkout draft retained`,
      );
    }
    stage = "successful retry and duplicate click";
    let calls = 0;
    await page.route("**/api/cuenta/logout", async (r) => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 500));
      await r.continue();
    });
    await logout.evaluate((b) => {
      b.click();
      b.click();
    });
    await page.waitForURL((u) => u.pathname === "/");
    assert.equal(calls, 1);
    assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), key), null);
    assert.equal(
      (await context.cookies()).find((c) => c.name === cookie.name),
      undefined,
    );
    const me = await context.request.get(`${base}/api/cuenta/me`);
    assert.equal(me.status(), 401);
    console.log(
      "PASS successful retry: one logout request, session removed, draft cleared, private profile denied",
    );
  } finally {
    await browser.close();
  }
})().catch(() => {
  console.error(`Shopper logout audit failed at ${stage}; credentials withheld`);
  process.exitCode = 1;
});
