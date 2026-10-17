/** Real staging authorization, snapshot and SSE-handshake reads only.
 * No authenticated read-marker POST, notification delivery or email. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
let stage = "private account input";
(async () => {
  const account = JSON.parse(fs.readFileSync(process.env.NOTIFICACIONES_QA_ACCOUNT, "utf8"));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: base,
    viewport: { width: 390, height: 844 },
    locale: "es-MX",
  });
  try {
    stage = "guest access";
    for (const [method, path] of [
      ["get", "/api/cuenta/notificaciones"],
      ["post", "/api/cuenta/notificaciones/QA-NONEXISTENT-NOTICE/leer"],
      ["post", "/api/cuenta/notificaciones/leer-todas"],
      ["get", "/api/cuenta/realtime"],
    ]) {
      const res = await context.request[method](path, { timeout: 20000 });
      assert.equal(res.status(), 401);
      assert.match(res.headers()["cache-control"], /private.*no-store/);
    }
    console.log(
      "PASS four guest routes reject access with private caching disabled, including the realtime stream",
    );
    stage = "buyer identity";
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
    stage = "published bell";
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.route("**/api/**", (route) =>
      route.request().method() === "GET" ? route.continue() : route.abort(),
    );
    const response = await page.goto(`${base}/cuenta`, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 200);
    const bell = page.getByRole("button", { name: /^Notificaciones(?:,|$)/ });
    await bell.click();
    const dialog = page.getByRole("dialog", { name: "Notificaciones", exact: true });
    await dialog.waitFor();
    const refresh = dialog.getByRole("button", { name: "Actualizar avisos", exact: true });
    await expect(refresh).toBeEnabled();
    const update = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/cuenta/notificaciones" &&
        r.request().method() === "GET",
    );
    await refresh.click();
    const remote = await update;
    assert.equal(remote.status(), 200);
    const data = await remote.json();
    assert(Array.isArray(data.items) && Number.isSafeInteger(data.noLeidas) && data.noLeidas >= 0);
    await expect(refresh).toBeEnabled();
    await expect(dialog.getByText(`${data.noLeidas} sin leer`, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    console.log(
      "PASS published buyer bell opens an accessible dialog and displays the real server unread count after refresh",
    );
    stage = "real SSE handshake and cancellation";
    const stream = await page.evaluate(async () => {
      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), 20000);
      let reader;
      try {
        const res = await fetch("/api/cuenta/realtime", { signal: c.signal, cache: "no-store" });
        reader = res.body?.getReader();
        const chunk = await reader?.read();
        const text = chunk?.value ? new TextDecoder().decode(chunk.value) : "";
        return {
          status: res.status,
          type: res.headers.get("content-type"),
          cache: res.headers.get("cache-control"),
          handshake: text.includes("retry:") || text.includes(": ok"),
        };
      } finally {
        clearTimeout(timer);
        await reader?.cancel().catch(() => {});
        c.abort();
      }
    });
    assert.equal(stream.status, 200);
    assert.match(stream.type, /^text\/event-stream/);
    assert.match(stream.cache, /private.*no-store/);
    assert.equal(stream.handshake, true);
    console.log(
      "PASS actual authenticated SSE opening, handshake and browser cancellation; no event published for this test",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    assert.equal(await bell.evaluate((n) => document.activeElement === n), true);
    console.log(
      "PASS published mobile keyboard close returns focus to the bell; all browser writes were blocked",
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(() => {
  console.error(`FAIL notification access at ${stage}; credentials withheld`);
  process.exitCode = 1;
});
