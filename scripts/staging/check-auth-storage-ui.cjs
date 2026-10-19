/** Actual local admin/POS/platform apps; synthetic accounts, no remote requests or writes. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const surfaces = [
  {
    name: "admin",
    base: "http://127.0.0.1:5417",
    key: "gaespos_admin_token",
    permissions: "gaespos_admin_permisos",
  },
  {
    name: "pos",
    base: "http://127.0.0.1:5418",
    key: "gaespos_pos_token",
    permissions: "gaespos_pos_permisos",
  },
  {
    name: "platform",
    base: "http://127.0.0.1:5419",
    key: "gaespos_super_token",
    permissions: "gaespos_super_permissions",
  },
];
(async () => {
  const browser = await chromium.launch();
  let groups = 0;
  let writes = 0;
  const errors = [];
  try {
    for (const surface of surfaces) {
      for (const mode of [
        "read",
        "getter",
        "login",
        ...(surface.name === "pos" ? [] : ["restore"]),
      ]) {
        const context = await browser.newContext();
        let requests = 0;
        let releaseResponse;
        let markStarted;
        const responseGate = new Promise((resolve) => {
          releaseResponse = resolve;
        });
        const requestStarted = new Promise((resolve) => {
          markStarted = resolve;
        });
        await context.route("**/*", async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin !== surface.base) return route.abort();
          if (!url.pathname.startsWith("/api/")) return route.continue();
          requests++;
          if (request.method() !== "GET") {
            writes++;
            return route.abort();
          }

          if (
            mode === "restore" &&
            ["/api/auth/tenant/me", "/api/auth/me"].includes(url.pathname)
          ) {
            markStarted();
            await responseGate;
          }
          if (url.pathname === "/api/auth/tenant/me")
            return route.fulfill({
              json: {
                id: "qa-user",
                nombre: "Cuenta verificada",
                tenantSlug: "qa-store",
                permissions: surface.name === "admin" ? ["productos.leer"] : [],
              },
            });
          if (url.pathname === "/api/auth/me")
            return route.fulfill({
              json: {
                name: "Cuenta verificada",
                email: "qa@example.test",
                role: "support",
                permissions: ["tickets.read"],
              },
            });
          if (url.pathname === "/api/t/notificaciones")
            return route.fulfill({ json: { items: [], noLeidas: 0 } });
          if (url.pathname === "/api/t/notificaciones/realtime")
            return route.fulfill({ body: "", contentType: "text/event-stream" });
          if (url.pathname === "/api/t/productos")
            return route.fulfill({ json: { items: [], total: 0 } });
          return route.fulfill({ json: [] });
        });
        await context.addInitScript(
          ({ surface, mode }) => {
            const storage = window.localStorage;
            const read = Storage.prototype.getItem;
            if (mode !== "login") storage.setItem(surface.key, "synthetic-retained-session");
            storage.setItem(surface.permissions, JSON.stringify(["*"]));
            storage.setItem("qa_other_session", "unrelated-account");
            storage.setItem("qa_other_permissions", JSON.stringify(["billing.read"]));
            window.qaOriginalStorage = storage;
            window.qaOriginalRead = (key) => read.call(storage, key);
            window.qaStorageDenied = mode !== "restore";
            if (mode === "getter")
              Object.defineProperty(window, "localStorage", {
                configurable: true,
                get() {
                  if (window.qaStorageDenied) throw new DOMException("Denied", "SecurityError");
                  return storage;
                },
              });
            else
              Storage.prototype.getItem = function (key) {
                if (this === storage && window.qaStorageDenied)
                  throw new DOMException("Denied", "SecurityError");
                return read.call(this, key);
              };
          },
          { surface, mode },
        );
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(`${surface.name}: ${error.message}`));
        await page.goto(surface.base);
        if (mode === "restore") {
          await requestStarted;
          await page.evaluate(() => {
            window.qaStorageDenied = true;
          });
          releaseResponse();
        }
        await page
          .getByRole("alert")
          .filter({ hasText: "No podemos acceder al almacenamiento" })
          .waitFor();
        const blockedRequests = requests;
        if (mode === "restore") assert(blockedRequests >= 1);
        else assert.equal(blockedRequests, 0);
        assert.equal(await page.getByLabel("Correo", { exact: true }).count(), 0);
        await page.getByRole("button", { name: "Reintentar acceso", exact: true }).click();
        assert.equal(requests, blockedRequests);
        const initial = await page.evaluate(
          (surface) => ({
            token: window.qaOriginalRead(surface.key),
            permissions: window.qaOriginalRead(surface.permissions),
            other: window.qaOriginalRead("qa_other_session"),
            otherPermissions: window.qaOriginalRead("qa_other_permissions"),
          }),
          surface,
        );
        assert.equal(initial.token, mode === "login" ? null : "synthetic-retained-session");
        assert.equal(initial.permissions, '["*"]');
        assert.equal(initial.other, "unrelated-account");
        assert.equal(initial.otherPermissions, '["billing.read"]');
        await page.evaluate(() => {
          window.qaStorageDenied = false;
        });
        await page.getByRole("button", { name: "Reintentar acceso", exact: true }).click();
        if (mode === "login") await page.getByLabel("Correo", { exact: true }).waitFor();
        else if (surface.name === "admin")
          await page.getByRole("button", { name: /Cuenta verificada/ }).waitFor();
        else if (surface.name === "pos")
          await page.getByText("Cuenta verificada · qa-store", { exact: true }).waitFor();
        else await page.getByRole("button", { name: /Soporte/ }).waitFor();
        const after = await page.evaluate(
          (surface) => ({
            token: localStorage.getItem(surface.key),
            other: localStorage.getItem("qa_other_session"),
            otherPermissions: localStorage.getItem("qa_other_permissions"),
          }),
          surface,
        );
        assert.equal(after.token, initial.token);
        assert.equal(after.other, initial.other);
        assert.equal(after.otherPermissions, initial.otherPermissions);
        groups++;
        console.log(
          `PASS ${surface.name}/${mode}: SecurityError is recoverable, saved session and unrelated permissions preserved`,
        );
        await context.close();
      }
    }
    assert.equal(writes, 0);
    assert.deepEqual(errors, []);
    console.log(
      `${groups} actual local app browser groups passed; synthetic GETs only, 0 writes, 0 JavaScript errors.`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
