/** Real staging reads plus guest authorization checks. No authenticated content writes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
let stage = "private account input";
(async () => {
  const account = JSON.parse(fs.readFileSync(process.env.PREFERENCIAS_QA_ACCOUNT, "utf8"));
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: base, locale: "es-MX" });
  try {
    stage = "guest access";
    for (const [method, path] of [
      ["get", "/api/cuenta/wishlist"],
      ["post", "/api/cuenta/wishlist"],
      ["delete", "/api/cuenta/wishlist/QA-NONEXISTENT-PREFERENCE"],
      ["get", "/api/cuenta/resenas"],
      ["post", "/api/cuenta/resenas"],
    ]) {
      const res = await context.request[method](path, method === "post" ? { data: {} } : {});
      assert.equal(res.status(), 401);
      assert.match(res.headers()["cache-control"], /private.*no-store/);
    }
    console.log("PASS five real guest routes require a session and disable private caching");
    stage = "buyer identity";
    const login = await context.request.post("/api/cuenta/login", {
      data: { email: account.email, password: account.password },
    });
    assert.equal(login.status(), 200);
    const me = await context.request.get("/api/cuenta/me");
    assert.equal(me.status(), 200);
    assert.equal((await me.json()).email, account.email);
    stage = "real buyer reads";
    for (const path of ["/api/cuenta/wishlist", "/api/cuenta/resenas"]) {
      const res = await context.request.get(path);
      assert.equal(res.status(), 200);
      assert(Array.isArray(await res.json()));
      assert.match(res.headers()["cache-control"], /private.*no-store/);
    }
    console.log("PASS real buyer wishlist/review-eligibility reads return verified private lists");
    stage = "published account UI";
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.route("**/api/**", (route) =>
      route.request().method() === "GET" ? route.continue() : route.abort(),
    );
    const response = await page.goto(`${base}/cuenta#favoritos`, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 200);
    const refresh = page.getByRole("button", { name: "Actualizar lista de deseos", exact: true });
    await refresh.waitFor();
    const result = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/cuenta/wishlist" && r.request().method() === "GET",
    );
    await refresh.click();
    assert.equal((await result).status(), 200);
    await expect(refresh).toBeEnabled();
    await expect(refresh.locator("..").getByRole("alert")).toHaveCount(0);
    console.log(
      "PASS published account renders the new list control and refreshes against the real API; browser writes blocked",
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(() => {
  console.error(`FAIL preferences access at ${stage}; credentials withheld`);
  process.exitCode = 1;
});
