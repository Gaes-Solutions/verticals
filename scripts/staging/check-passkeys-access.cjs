/** Published guest boundaries and buyer key-list reads only. Never enrolls/removes a real key. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
let stage = "private input";
(async () => {
  const account = JSON.parse(fs.readFileSync(process.env.PASSKEY_QA_ACCOUNT, "utf8"));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: base,
    viewport: { width: 390, height: 844 },
    locale: "es-MX",
  });
  try {
    stage = "guest protected actions";
    for (const action of ["list", "register-options", "register-verify", "remove"]) {
      const res = await context.request.post(`/api/cuenta/passkey/${action}`, {
        headers: { origin: base },
        data: {},
        timeout: 20000,
      });
      assert.equal(res.status(), 401);
      assert.match(res.headers()["cache-control"], /private.*no-store/);
      assert.equal(res.headers()["set-cookie"], undefined);
    }
    console.log("PASS all four protected actions reject guests with private/no-store responses");
    stage = "origin and malformed public proof";
    const denied = await context.request.post("/api/cuenta/passkey/login-options", {
      headers: { origin: "https://attacker.example" },
      data: {},
    });
    assert.equal(denied.status(), 403);
    const invalid = await context.request.post("/api/cuenta/passkey/login-verify", {
      headers: { origin: base },
      data: {},
    });
    assert.equal(invalid.status(), 400);
    assert.equal(invalid.headers()["set-cookie"], undefined);
    console.log("PASS cross-origin requests and incomplete login proofs cannot issue sessions");
    stage = "actual anonymous login options";
    const options = await context.request.post("/api/cuenta/passkey/login-options", {
      headers: { origin: base },
      data: {},
      timeout: 20000,
    });
    assert.equal(options.status(), 200);
    const challenge = await options.json();
    assert.equal(challenge.options.rpId, new URL(base).hostname);
    assert.equal(challenge.options.userVerification, "required");
    assert.equal(typeof challenge.challengeToken, "string");
    assert.match(options.headers()["cache-control"], /private.*no-store/);
    console.log(
      "PASS actual backend issues options for this shop origin with required device verification; no ceremony completed",
    );
    stage = "buyer login and list";
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
    assert.equal((await me.json()).email, account.email);
    const list = await context.request.post("/api/cuenta/passkey/list", {
      headers: { origin: base },
      data: {},
      timeout: 20000,
    });
    assert.equal(list.status(), 200);
    const keys = await list.json();
    assert(Array.isArray(keys));
    assert.equal(new Set(keys.map((k) => k.id)).size, keys.length);
    assert.match(list.headers()["cache-control"], /private.*no-store/);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.name));
    await page.route("**/api/**", (route) =>
      route.request().method() === "GET" ||
      new URL(route.request().url()).pathname === "/api/cuenta/passkey/list"
        ? route.continue()
        : route.abort(),
    );
    assert.equal(
      (await page.goto(`${base}/cuenta`, { waitUntil: "domcontentloaded" })).status(),
      200,
    );
    const region = page.getByRole("region", { name: "Huella y llaves de acceso" });
    const refresh = region.getByRole("button", { name: "Actualizar llaves", exact: true });
    await expect(refresh).toBeEnabled();
    await expect(region.getByRole("alert")).toHaveCount(0);
    await expect(region.getByRole("button", { name: /^Eliminar llave / })).toHaveCount(keys.length);
    if (!keys.length)
      await expect(
        region.getByText("Todavía no tienes llaves de acceso en esta tienda.", { exact: true }),
      ).toBeVisible();
    await refresh.click();
    await expect(refresh).toBeEnabled();
    await expect(region.getByRole("alert")).toHaveCount(0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS published mobile key list and manual refresh match the real buyer metadata; no enrollment/removal writes",
    );
    stage = "mobile controls";
    for (const b of [
      refresh,
      region.getByRole("button", { name: "Configurar huella o llave de acceso", exact: true }),
    ]) {
      await b.scrollIntoViewIfNeeded();
      const box = await b.boundingBox();
      assert(box && box.height >= 44);
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    console.log("PASS published mobile targets and no horizontal overflow");
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(() => {
  console.error(`FAIL published passkeys at ${stage}; private values withheld`);
  process.exitCode = 1;
});
