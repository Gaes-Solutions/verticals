/** Real staging browser session regression; ends its own refresh session.
 * PLATFORM_SESSION_ACCOUNT: private JSON { email, password, totpSecret }.
 * PLATFORM_SESSION_BASE: fixed staging panel (default), or localhost proxy.
 * Never logs credentials, MFA keys, codes or cookies. No business writes.
 */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium, request } = require(`${process.cwd()}/node_modules/playwright`);
const { authenticator } = require(`${process.cwd()}/apps/api/node_modules/otplib`);
const a = JSON.parse(fs.readFileSync(process.env.PLATFORM_SESSION_ACCOUNT, "utf8"));
const secret = a.totpSecret;
assert(a.email && a.password && secret);
const base = process.env.PLATFORM_SESSION_BASE || "https://web-superadmin-staging.up.railway.app";
assert(["localhost", "web-superadmin-staging.up.railway.app"].includes(new URL(base).hostname));
let stage = "login";
(async () => {
  const b = await chromium.launch();
  const probes = await request.newContext();
  try {
    const c = await b.newContext({ userAgent: "GaesSoft-Staging-QA-Billing-MFA/1.0" });
    c.setDefaultTimeout(30000);
    await c.route("**/api/**", (route) =>
      route.request().method() === "GET" ||
      ["/api/auth/login", "/api/auth/mfa/verify", "/api/auth/refresh", "/api/auth/logout"].includes(
        new URL(route.request().url()).pathname,
      )
        ? route.continue()
        : route.abort(),
    );
    const p = await c.newPage();
    await p.goto(base);
    await p.getByLabel("Correo", { exact: true }).fill(a.email);
    await p.getByLabel("Contraseña", { exact: true }).fill(a.password);
    await p.getByRole("button", { name: "Continuar", exact: true }).click();
    await p.getByLabel("Código 2FA", { exact: true }).waitFor();
    const initialStep = Math.floor(Date.now() / 30000);
    while (Math.floor(Date.now() / 30000) <= initialStep)
      await new Promise((r) => setTimeout(r, 1000));
    await p.getByLabel("Código 2FA", { exact: true }).fill(authenticator.generate(secret));
    await p.getByRole("button", { name: "Entrar", exact: true }).click();
    await p.locator("aside nav button").first().waitFor();
    stage = "cookie scope";
    const initial = (await c.cookies()).find((x) => x.name === "gaespos_refresh");
    assert(initial);
    assert.equal(initial.path, "/api/auth");
    assert(initial.httpOnly && initial.secure);
    console.log("PASS browser refresh cookie: /api/auth, HttpOnly, Secure");
    stage = "refresh rotation";
    const refreshed = await p.evaluate(async () => {
      const r = await fetch("/api/auth/refresh", { method: "POST" });
      const data = await r.json();
      return { status: r.status, token: typeof data.accessToken === "string" };
    });
    assert.equal(refreshed.status, 200);
    assert(refreshed.token);
    const rotated = (await c.cookies()).find((x) => x.name === "gaespos_refresh");
    assert(rotated);
    assert.notEqual(rotated.value, initial.value);
    const replay = await probes.post(`${base}/api/auth/refresh`, {
      headers: { cookie: `gaespos_refresh=${initial.value}` },
    });
    assert.equal(replay.status(), 401);
    console.log("PASS real browser refresh: rotates cookie and rejects old refresh token");
    stage = "logout retry";
    await p.route("**/api/auth/logout", (r) =>
      r.fulfill({ status: 503, json: { message: "QA simulated outage" } }),
    );
    await p.getByRole("button", { name: "Salir", exact: true }).click();
    await p.getByRole("alert").filter({ hasText: "No se pudo cerrar la sesión" }).waitFor();
    assert((await p.locator("aside nav button").count()) > 0);
    await p.unroute("**/api/auth/logout");
    console.log("PASS logout failure: visible error and retry, no false success");
    stage = "server logout";
    const logout = p.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/logout");
    await p.getByRole("button", { name: "Salir", exact: true }).click();
    assert.equal((await logout).status(), 200);
    stage = "logout returns login form";
    await p.getByLabel("Correo", { exact: true }).waitFor();
    stage = "logout removes access token";
    assert.equal(await p.evaluate(() => localStorage.getItem("gaespos_super_token")), null);
    stage = "logout removes refresh cookie";
    assert.equal((await c.cookies()).filter((x) => x.name === "gaespos_refresh").length, 0);
    stage = "logout revokes refresh in server";
    const revoked = await probes.post(`${base}/api/auth/refresh`, {
      headers: { cookie: `gaespos_refresh=${rotated.value}` },
    });
    assert.equal(revoked.status(), 401);
    console.log("PASS logout: clears browser token/cookie and revokes server refresh session");
  } finally {
    await probes.dispose();
    await b.close();
  }
})().catch(() => {
  console.error(`Session regression failed at ${stage}; private values withheld`);
  process.exitCode = 1;
});
