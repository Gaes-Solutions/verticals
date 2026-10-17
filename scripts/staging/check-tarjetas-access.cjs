/** Published read/authorization checks. Never saves/deletes real cards or submits checkout. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
let stage = "private input";
(async () => {
  const account = JSON.parse(fs.readFileSync(process.env.TARJETAS_QA_ACCOUNT, "utf8"));
  const browser = await chromium.launch();
  const guest = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 844 } });
  const buyer = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 844 } });
  try {
    stage = "guest card authorization";
    for (const [method, url] of [
      ["get", "/api/cuenta/medios-pago"],
      ["post", "/api/cuenta/medios-pago"],
      ["delete", "/api/cuenta/medios-pago/QA-NONEXISTENT"],
    ]) {
      const res = await guest.request[method](url, { timeout: 20000 });
      assert.equal(res.status(), 401);
      assert.match(res.headers()["cache-control"], /private.*no-store/);
    }
    console.log(
      "PASS all three saved-card guest operations require authentication and disable caching",
    );
    stage = "guest checkout compatibility";
    const page = await guest.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.name));
    await page.route("**/api/**", (route) =>
      route.request().method() === "GET" ? route.continue() : route.abort(),
    );
    await page.goto(`${base}/cuenta/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() =>
      localStorage.setItem(
        "gaespos_carrito",
        JSON.stringify([
          {
            varianteId: "qa-local-checkout-only",
            titulo: "Producto sintético QA",
            precio: "100.00",
            cantidad: 1,
          },
        ]),
      ),
    );
    const cardsResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/cuenta/medios-pago",
    );
    assert.equal(
      (await page.goto(`${base}/checkout`, { waitUntil: "domcontentloaded" })).status(),
      200,
    );
    assert.equal((await cardsResponse).status(), 401);
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Nombre completo", { exact: true })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("qa-local@example.invalid");
    await page.getByLabel("Nombre completo", { exact: true }).fill("Invitado local QA");
    assert.deepEqual(errors, []);
    console.log(
      "PASS guest checkout remains usable after saved-card 401 with a browser-only synthetic cart; no purchase submitted",
    );
    stage = "buyer identity";
    assert.equal(
      (
        await buyer.request.post("/api/cuenta/login", {
          data: { email: account.email, password: account.password },
        })
      ).status(),
      200,
    );
    const me = await buyer.request.get("/api/cuenta/me");
    assert.equal(me.status(), 200);
    assert.equal((await me.json()).email, account.email);
    const list = await buyer.request.get("/api/cuenta/medios-pago", { timeout: 20000 });
    assert.equal(list.status(), 200);
    assert.match(list.headers()["cache-control"], /private.*no-store/);
    const data = await list.json();
    assert(Array.isArray(data));
    for (const card of data) {
      assert.deepEqual(Object.keys(card).sort(), ["expAnio", "expMes", "id", "last4", "marca"]);
      assert.match(card.last4, /^\d{4}$/);
    }
    assert.equal(
      (
        await buyer.request.post("/api/cuenta/medios-pago", {
          data: {},
          headers: { origin: base },
          timeout: 20000,
        })
      ).status(),
      400,
    );
    console.log(
      "PASS actual buyer receives only masked metadata; malformed save input is rejected before provider access",
    );
    stage = "published buyer wallet";
    const own = await buyer.newPage();
    own.setDefaultTimeout(20000);
    const ownErrors = [];
    own.on("pageerror", (e) => ownErrors.push(e.name));
    await own.route("**/api/**", (route) =>
      route.request().method() === "GET" ||
      new URL(route.request().url()).pathname === "/api/cuenta/passkey/list"
        ? route.continue()
        : route.abort(),
    );
    assert.equal(
      (await own.goto(`${base}/cuenta`, { waitUntil: "domcontentloaded" })).status(),
      200,
    );
    const region = own.getByRole("region", { name: "Mis tarjetas" });
    const refresh = region.getByRole("button", { name: "Actualizar tarjetas", exact: true });
    await expect(refresh).toBeEnabled();
    await expect(region.getByRole("alert")).toHaveCount(0);
    await expect(region.getByRole("button", { name: /^Eliminar tarjeta / })).toHaveCount(
      data.length,
    );
    if (!data.length)
      await expect(
        region.getByText("No tienes tarjetas guardadas.", { exact: false }),
      ).toBeVisible();
    const update = own.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/cuenta/medios-pago",
    );
    await refresh.click();
    assert.equal((await update).status(), 200);
    await expect(refresh).toBeEnabled();
    await expect(region.getByRole("alert")).toHaveCount(0);
    assert((await refresh.boundingBox()).height >= 44);
    assert.equal(
      await own.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.deepEqual(ownErrors, []);
    console.log(
      "PASS published mobile wallet and refresh match the real buyer list, with no JavaScript errors or overflow; all card writes blocked",
    );
  } finally {
    await guest.close();
    await buyer.close();
    await browser.close();
  }
})().catch(() => {
  console.error(`FAIL published saved cards at ${stage}; private values withheld`);
  process.exitCode = 1;
});
