/** Staging-only. Real authentication/private reads; synthetic preview receipts; no cart/order writes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
let stage = "setup";
(async () => {
  const browser = await chromium.launch();
  let context;
  let groups = 0;
  const pass = () => {
    groups++;
    console.log(`PASS ${stage}`);
  };
  try {
    context = await browser.newContext({
      viewport: { width: 320, height: 844 },
      serviceWorkers: "block",
    });
    stage = "guest repeat reads require a session and prohibit private caching";
    for (const query of ["", "?sesion=1", "?owner=nonexistent"]) {
      const res = await context.request.get(`${base}/api/cuenta/repetir-pedido${query}`);
      assert.equal(res.status(), 401);
      assert.match(res.headers()["cache-control"], /private, no-store/);
      assert.deepEqual(Object.keys(await res.json()), ["message"]);
    }
    pass();
    if (!process.env.REPEAT_QA_ACCOUNT) {
      console.log("SKIP buyer checks: no private account fixture");
      return;
    }
    stage = "existing test buyer can authenticate without creating a customer or order";
    const a = JSON.parse(fs.readFileSync(process.env.REPEAT_QA_ACCOUNT, "utf8"));
    const login = await context.request.post(`${base}/api/cuenta/login`, {
      data: { email: a.email, password: a.password },
    });
    assert.equal(login.status(), 200);
    pass();
    stage =
      "actual private repeat receipt only exposes verified ownership and minimal line selection";
    const res = await context.request.get(`${base}/api/cuenta/repetir-pedido`);
    assert.equal(res.status(), 200);
    assert.match(res.headers()["cache-control"], /private, no-store/);
    const real = await res.json();
    assert.deepEqual(Object.keys(real).sort(), ["owner", "pedido"]);
    assert.equal(typeof real.owner, "string");
    if (real.pedido) {
      assert.deepEqual(Object.keys(real.pedido).sort(), ["folioPublico", "items"]);
      for (const line of real.pedido.items)
        assert.deepEqual(Object.keys(line).sort(), ["cantidad", "nombre", "varianteId"]);
    }
    pass();
    stage = "actual session confirmation rejects caller ownership before reading order details";
    const same = await context.request.get(
      `${base}/api/cuenta/repetir-pedido?sesion=1&owner=${encodeURIComponent(real.owner)}`,
    );
    assert.equal(same.status(), 200);
    assert.deepEqual(await same.json(), { owner: real.owner });
    const wrong = await context.request.get(
      `${base}/api/cuenta/repetir-pedido?sesion=1&owner=qa-wrong-owner`,
    );
    assert.equal(wrong.status(), 409);
    assert.equal((await wrong.json()).code, "SESSION_CHANGED");
    pass();
    const f = { price: "25.50", errors: [], writes: [], quoteCount: 0 };
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => f.errors.push(e.name));
    await page.route("**/api/**", async (r) => {
      const req = r.request();
      const u = new URL(req.url());
      if (u.pathname === "/api/cuenta/repetir-pedido" && u.searchParams.get("sesion") !== "1")
        return r.fulfill({
          json: {
            owner: real.owner,
            pedido: {
              folioPublico: "PED-QA-PREVIEW",
              items: [
                { varianteId: "qa-repeat-one", nombre: "Producto de prueba", cantidad: 2 },
                { varianteId: "qa-repeat-gone", nombre: "Producto retirado", cantidad: 1 },
              ],
            },
          },
        });
      if (u.pathname === "/api/cuenta/carrito" && req.method() === "GET")
        return r.fulfill({ json: { owner: real.owner, cart: null } });
      if (u.pathname === "/api/carrito/verificar") {
        f.quoteCount++;
        return r.fulfill({
          json: {
            items: req.postDataJSON().items.map((i) => ({
              ...i,
              estado: i.varianteId === "qa-repeat-gone" ? "no_publicado" : "publicado",
              precio: i.varianteId === "qa-repeat-gone" ? null : f.price,
            })),
          },
        });
      }
      if (req.method() !== "GET") {
        f.writes.push(u.pathname);
        return r.abort();
      }
      return r.continue();
    });
    stage = "published preview with synthetic order and prices uses the real verified test account";
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const trigger = page.getByRole("button", { name: "Revisar productos", exact: true });
    await trigger.click();
    let d = page.getByRole("dialog", { name: "Revisa los productos para repetir" });
    await expect(d).toBeVisible();
    await expect(d.getByText("Subtotal a agregar: $51.00", { exact: true })).toBeVisible();
    await expect(d.getByRole("checkbox", { name: /Producto retirado/ })).toBeDisabled();
    assert.equal(await d.evaluate((e) => e.matches(":modal")), true);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: "/tmp/gaes-repeat-published-320.png", fullPage: true });
    pass();
    stage = "published Escape and manual close restore focus to the async trigger";
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    d = page.getByRole("dialog", { name: "Revisa los productos para repetir" });
    await d.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(d).toHaveCount(0);
    await expect(trigger).toBeFocused();
    pass();
    stage = "published changed price requires new consent and does not write a real cart";
    await trigger.click();
    d = page.getByRole("dialog", { name: "Revisa los productos para repetir" });
    await expect(d).toBeVisible();
    f.price = "30.00";
    await d.getByRole("button", { name: "Agregar selección", exact: true }).click();
    await expect(d.getByRole("alert")).toContainText("Cambió un precio");
    await expect(d.getByText("Subtotal a agregar: $60.00", { exact: true })).toBeVisible();
    await expect(d.getByRole("button", { name: "Agregar selección", exact: true })).toBeEnabled();
    assert.deepEqual(
      await page.evaluate(
        (owner) => JSON.parse(localStorage.getItem(`gaespos_carrito_cuenta:${owner}`)),
        real.owner,
      ),
      [],
    );
    pass();
    stage =
      "published reviewed paths have no JavaScript errors, horizontal overflow or remote writes";
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.writes, []);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    pass();
    console.log(
      JSON.stringify({
        groups,
        remoteWrites: 0,
        actual: "login, own order reads, session verification and changed-owner rejection",
        synthetic:
          "preview order, public prices and empty account cart; no order/payment submitted",
      }),
    );
  } finally {
    if (context) await context.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(`FAIL ${stage}: ${e.name}`);
  process.exitCode = 1;
});
