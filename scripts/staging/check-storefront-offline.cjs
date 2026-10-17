/** Real browser PWA cache and offline regression. No business writes or push delivery.
 * STOREFRONT_OFFLINE_ACCOUNT: private JSON {email,password}.
 * STOREFRONT_TEST_URL: staging (default) or localhost.
 * OFFLINE_QA_PROFILE: optional owned /tmp/gaes-* browser profile for old-worker upgrade QA.
 */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
assert(
  ["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(new URL(base).hostname),
);
const cacheName = "tienda-public-offline-v2";
const profile = process.env.OFFLINE_QA_PROFILE;
if (profile) assert(profile.startsWith("/tmp/gaes-"));
let stage = "account input";
(async () => {
  const account = JSON.parse(fs.readFileSync(process.env.STOREFRONT_OFFLINE_ACCOUNT, "utf8"));
  const browser = profile ? null : await chromium.launch();
  const context = profile
    ? await chromium.launchPersistentContext(profile, { viewport: { width: 390, height: 844 } })
    : await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    context.setDefaultTimeout(45000);
    await context.setOffline(false);
    await context.route("**/api/**", (r) =>
      r.request().method() === "GET" ? r.continue() : r.abort(),
    );
    const requests = [];
    context.on("request", (r) => {
      if (new URL(r.url()).pathname === "/offline.html" && r.serviceWorker())
        requests.push(r.allHeaders().then((h) => !!h.cookie));
    });
    const page = context.pages()[0] || (await context.newPage());
    if (profile) {
      stage = "load previous installed worker while offline";
      await context.setOffline(true);
      await page.goto(`${base}/cuenta`);
      const old = await page.evaluate(() => caches.keys());
      assert(old.some((key) => key.startsWith("tienda-shell-")));
      console.log(
        "CHECK old installed worker and its legacy cache loaded from persistent QA profile",
      );
      await context.setOffline(false);
    }
    stage = "static offline page";
    const response = await page.goto(`${base}/offline.html`);
    assert.equal(response.status(), 200);
    await page.getByRole("heading", { name: "Se perdió la conexión", exact: true }).waitFor();
    await page.evaluate(async (seed) => {
      const unrelated = await caches.open("qa-unrelated");
      await unrelated.put("/qa-keep", new Response("QA-KEEP"));
      if (seed) {
        const old = await caches.open("tienda-shell-v1");
        await old.put("/", new Response("QA-PRIVATE-LEGACY"));
      }
    }, !profile);
    stage = "real shopper login";
    const login = await context.request.post(`${base}/api/cuenta/login`, {
      data: { email: account.email, password: account.password },
    });
    assert.equal(login.status(), 200);
    const meResponse = await context.request.get(`${base}/api/cuenta/me`);
    assert.equal(meResponse.status(), 200);
    const me = await meResponse.json();
    assert.equal(me.email, account.email);
    stage = "worker activation and old-cache cleanup";
    await page.goto(`${base}/`);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });
      await registration.update();
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(async (name) => {
      const keys = await caches.keys();
      const reg = await navigator.serviceWorker.getRegistration("/");
      return (
        keys.includes(name) &&
        !keys.some((k) => k.startsWith("tienda-shell-")) &&
        reg?.active?.state === "activated" &&
        navigator.serviceWorker.controller === reg.active
      );
    }, cacheName);
    const state = await page.evaluate(
      async ({ name, id, email }) => {
        const c = await caches.open(name);
        const keys = await c.keys();
        const bodies = await Promise.all(keys.map(async (k) => (await c.match(k)).text()));
        return {
          paths: keys.map((k) => new URL(k.url).pathname),
          privateData: bodies.some(
            (b) => b.includes(id) || b.includes(email) || b.includes("QA-PRIVATE-LEGACY"),
          ),
          unrelated: await (await caches.open("qa-unrelated")).match("/qa-keep").then(Boolean),
        };
      },
      { name: cacheName, id: me.id, email: me.email },
    );
    assert.deepEqual(state.paths, ["/offline.html"]);
    assert.equal(state.privateData, false);
    assert.equal(state.unrelated, true);
    const cookies = await Promise.all(requests);
    assert(cookies.length > 0);
    assert(cookies.every((value) => value === false));
    console.log(
      "PASS worker activation: legacy authenticated cache removed, unrelated cache kept, static offline page cached without cookies or shopper data",
    );
    await context.clearCookies({ name: "gaespos_cliente_token" });
    await context.setOffline(true);
    stage = "private navigations while offline";
    for (const path of ["/cuenta", "/checkout", "/seguimiento?folio=QA"]) {
      const r = await page.goto(base + path);
      assert.equal(r.status(), 503);
      await page.getByRole("heading", { name: "Se perdió la conexión", exact: true }).waitFor();
      const html = await page.content();
      assert(
        !html.includes(me.id) && !html.includes(me.email) && !html.includes("QA-PRIVATE-LEGACY"),
      );
    }
    console.log(
      "PASS offline account/checkout/tracking: public offline page only after account cookie removal",
    );
    stage = "offline API does not receive HTML";
    const failed = await page.evaluate(async () => {
      try {
        await fetch("/api/cuenta/me");
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(failed, true);
    console.log("PASS offline API: network failure, never substituted with cached HTML");
    stage = "offline layout";
    fs.mkdirSync("/tmp/gaes-offline-privacy", { recursive: true, mode: 0o700 });
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      const button = await page
        .getByRole("button", { name: "Reintentar", exact: true })
        .boundingBox();
      assert(button.height >= 44);
      await page.screenshot({ path: `/tmp/gaes-offline-privacy/offline-${width}.png` });
    }
    console.log(
      "PASS offline layout: 320px/1280px, no horizontal overflow, touch target at least 44px",
    );
    stage = "cache eviction fallback";
    await page.evaluate(async (name) => caches.delete(name), cacheName);
    const empty = await page.reload();
    assert.equal(empty.status(), 503);
    await page.getByRole("heading", { name: "Sin conexión", exact: true }).waitFor();
    assert(!(await page.content()).includes(me.id));
    console.log("PASS deleted cache: safe inline fallback remains available");
    stage = "reconnect and retry";
    await page.goto(`${base}/cuenta`);
    await context.setOffline(false);
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await page.getByRole("heading", { name: "Iniciar sesión", exact: true }).waitFor();
    assert(!(await page.content()).includes(me.id));
    assert.equal((await context.request.get(`${base}/api/cuenta/me`)).status(), 401);
    console.log("PASS reconnect: current logged-out state is used; no prior account is restored");
    console.log(
      "PASS 6 browser offline/privacy groups; no purchases, emails or notifications sent",
    );
  } finally {
    await context.close();
    if (browser) await browser.close();
  }
})().catch(() => {
  console.error(`Offline browser audit failed at ${stage}; credentials and identity withheld`);
  process.exitCode = 1;
});
