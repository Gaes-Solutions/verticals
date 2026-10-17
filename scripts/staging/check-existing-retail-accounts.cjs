/** Check existing staging accounts through real browser login. Private JSON input only.
 * RETAIL_ACCESS_FILE: [{role,email,password,url}]. No credentials or screenshots are published.
 * Opens read screens/forms; blocks all business writes. Never resets passwords/MFA.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("@playwright/test");
const accounts = JSON.parse(fs.readFileSync(process.env.RETAIL_ACCESS_FILE, "utf8"));
const roles = ["dueno", "gerente", "cajero", "vendedor", "almacen", "contador"];
const source = fs.readFileSync("apps/web-admin/src/App.tsx", "utf8");
const navSource = source
  .split("const NAV_GROUPS: NavGroup[] = [")[1]
  ?.split("const PAGE_COMPONENTS")[0];
assert(navSource, "Navigation definition missing");
const nav = [
  ...navSource.matchAll(
    /\{\s*key:\s*"[^"]+",\s*label:\s*"([^"]+)",[\s\S]*?perm:\s*"([^"]+)"\s*,?\s*\}/g,
  ),
].map((m) => ({ label: m[1], permission: m[2] }));
assert(nav.length > 20, "Incomplete navigation policy");

(async () => {
  const browser = await chromium.launch();
  let checks = 0;
  let forms = 0;
  const results = [];
  try {
    for (const account of accounts.filter((a) => roles.includes(a.role))) {
      const url = new URL(account.url);
      assert.equal(url.origin, "https://web-admin-staging-84b0.up.railway.app");
      assert.equal(url.searchParams.get("negocio"), "gaesland");
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      let current = `${account.role} login`;
      const errors = [];
      const pending = new Set();
      const failed = [];
      const writes = [];
      // Keep the live API below its per-IP budget. This changes timing, not responses.
      let queue = Promise.resolve();
      await context.route("**/api/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() !== "GET" && path !== "/api/auth/tenant/login") {
          writes.push({ path, method: request.method() });
          return route.abort("blockedbyclient");
        }
        const previous = queue;
        queue = previous.then(() => new Promise((r) => setTimeout(r, 1100)));
        await previous;
        await route.continue();
      });
      page.on("pageerror", () => errors.push(current));
      page.on("request", (r) => {
        if (r.url().includes("/api/") && !r.url().includes("/notificaciones/realtime"))
          pending.add(r);
      });
      page.on("requestfinished", (r) => pending.delete(r));
      page.on("requestfailed", (r) => pending.delete(r));
      page.on("response", (r) => {
        const path = new URL(r.url()).pathname;
        const unconfiguredFiscal = path === "/api/t/cfdis/config" && r.status() === 404;
        if (path.startsWith("/api/") && r.status() >= 400 && !unconfiguredFiscal)
          failed.push({ screen: current, path, status: r.status() });
      });
      const settled = async () => {
        const deadline = Date.now() + 40000;
        let quiet = Date.now();
        while (Date.now() < deadline) {
          if (pending.size) quiet = Date.now();
          else if (Date.now() - quiet > 250) return;
          await page.waitForTimeout(60);
        }
        throw Error(`${current}: screen requests did not settle`);
      };
      try {
        await page.goto(account.url, { waitUntil: "domcontentloaded" });
        await page.getByLabel("Correo", { exact: true }).fill(account.email);
        await page.getByLabel("Contraseña", { exact: true }).fill(account.password);
        const login = page.waitForResponse(
          (r) => new URL(r.url()).pathname === "/api/auth/tenant/login",
        );
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
        const response = await login;
        assert.equal(response.status(), 200, `${current}: password login failed`);
        const session = await response.json();
        assert(session.accessToken, `${current}: MFA ceremony still required`);
        assert.equal(session.user.email, account.email);
        assert.equal(session.tenant.slug, "gaesland");
        assert.deepEqual(session.user.roleCodes, [
          account.role === "contador" ? "contador_interno" : account.role,
        ]);
        await page.locator("aside nav button").first().waitFor();
        const tour = page.getByRole("button", { name: "Cerrar recorrido", exact: true });
        await tour.waitFor({ state: "visible", timeout: 1500 }).catch(() => {});
        if (await tour.isVisible()) await tour.click();
        await settled();
        const labels = (await page.locator("aside nav button").allTextContents()).map((s) =>
          s.trim(),
        );
        const allowed = (p) =>
          session.user.permissions.includes("*") || session.user.permissions.includes(p);
        const expected = nav
          .filter((item) => item.permission === "public" || allowed(item.permission))
          .map((item) => item.label);
        assert.deepEqual(
          [...labels].sort(),
          [...expected].sort(),
          `${current}: visible menu differs from permissions`,
        );
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 900 });
          for (const label of labels) {
            current = `${account.role} ${width}px ${label}`;
            if (width === 390)
              await page.getByRole("button", { name: "Menú del sistema", exact: true }).click();
            await page.locator("aside nav button").filter({ hasText: label }).first().click();
            await page.waitForTimeout(350);
            await settled();
            const main = await page.locator("main").innerText();
            assert(
              main.length > 10 && !/^Cargando[.…]*$/.test(main.trim()),
              `${current}: blank/loading screen`,
            );
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
              false,
              `${current}: page overflow`,
            );
            const form = [
              ["Productos", "productos.crear", "+ Nuevo producto"],
              ["Inventario", "inventario.ajustar", "+ Entrada de inventario"],
              ["Compras (OC)", "compras_oc.crear", "+ Nueva orden"],
            ].find(([section, permission]) => label === section && allowed(permission));
            if (form) {
              await page.getByRole("button", { name: form[2], exact: true }).click();
              const modal = page.locator(".gx-modal-panel");
              await modal.waitFor();
              await settled();
              await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
              await modal.waitFor({ state: "hidden" });
              forms++;
            }
            checks++;
          }
          assert.deepEqual(errors, [], `${account.role}: JavaScript errors`);
          assert.deepEqual(failed, [], `${account.role}: failed screen API reads`);
          assert.deepEqual(writes, [], `${account.role}: unexpected business writes blocked`);
          console.log(
            `PASS ${account.role}: ${labels.length} live permitted screens at ${width}px`,
          );
        }
        assert.deepEqual(errors, [], `${account.role}: JavaScript errors`);
        assert.deepEqual(failed, [], `${account.role}: failed screen API reads`);
        assert.deepEqual(writes, [], `${account.role}: unexpected business writes blocked`);
        results.push({ role: account.role, status: "PASS", screens: labels.length * 2 });
      } catch (error) {
        // Diagnostic messages only contain role/screen labels and statuses.
        console.error(`FAIL ${current}: ${error.message.split("\n")[0]}`);
        results.push({
          role: account.role,
          status: "FAIL",
          screen: current,
          failed,
          writes,
          runtimeErrors: errors.length,
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ checks, forms, results }));
  if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
})().catch(() => {
  console.error("Live account verification stopped; private input was not printed");
  process.exitCode = 1;
});
