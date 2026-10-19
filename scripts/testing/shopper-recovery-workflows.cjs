/** Real local BFF/API/DB recovery; tokens/identities exist only in disposable fixtures. No email. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const { auditKeyboardPage } = require("../staging/storefront-keyboard-browser.cjs");
const base = process.env.SHOPPER_TEST_URL;
assert.equal(base, "http://127.0.0.1:3058");
assert.equal(process.env.SHOPPER_FLOW_TESTS, "true");
const fixture = JSON.parse(fs.readFileSync(process.env.SHOPPER_FIXTURE_FILE, "utf8"));
let stage = "setup";
(async () => {
  const browser = await chromium.launch();
  let context;
  let groups = 0;
  const pass = () => console.log(`PASS recovery ${++groups}: ${stage}`);
  try {
    context = await browser.newContext({
      viewport: { width: 360, height: 1000 },
      serviceWorkers: "block",
    });
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    const errors = [];
    const unexpected = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (route) => {
      const r = route.request();
      const u = new URL(r.url());
      const allowedPost = [
        "/api/cuenta/restablecer-contrasena",
        "/api/cuenta/login",
        "/api/cuenta/passkey/list",
      ];
      if (
        !["localhost", "127.0.0.1"].includes(u.hostname) ||
        (r.method() !== "GET" && !(r.method() === "POST" && allowedPost.includes(u.pathname)))
      ) {
        unexpected.push(`${r.method()} ${u.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    const safe = async () => {
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpected, []);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    };
    const reset = async (token) => {
      await p.goto(`${base}/cuenta/restablecer?token=${token}`, { waitUntil: "domcontentloaded" });
      // Header count is populated by an effect: wait for hydration before filling.
      await expect(
        p.getByRole("link", { name: "Carrito, 0 productos", exact: true }),
      ).toBeVisible();
      await p
        .getByLabel("Nueva contraseña (mín. 8)", { exact: true })
        .fill(fixture.recovery.password.newPassword);
      await p
        .getByLabel("Confirma tu nueva contraseña", { exact: true })
        .fill(fixture.recovery.password.newPassword);
      const response = p.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/cuenta/restablecer-contrasena",
      );
      await p.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
      return response;
    };
    for (const [mode, message] of [
      ["invalid", /no es válido/],
      ["expired", /expiró/],
    ]) {
      stage = `real password ${mode}: distinct error and new-link recovery without mail`;
      const r = await reset(fixture.recovery.password[mode]);
      assert.equal(r.status(), 400);
      await expect(p.locator('form [role="alert"]')).toContainText(message);
      await expect(
        p.getByRole("button", { name: "Guardar contraseña", exact: true }),
      ).toBeEnabled();
      await p.getByRole("link", { name: "Pedir un nuevo enlace", exact: true }).click();
      await p.waitForURL("**/cuenta/olvidar-contrasena");
      await expect(
        p.getByRole("heading", { name: "¿Olvidaste tu contraseña?", exact: true }),
      ).toBeVisible();
      await safe();
      pass();
    }
    stage = "real valid password token changes password and shows success";
    assert.equal((await reset(fixture.recovery.password.valid)).status(), 200);
    await expect(
      p.getByRole("heading", { name: "Contraseña actualizada", exact: true }),
    ).toBeVisible();
    await expect(p.getByRole("link", { name: "Iniciar sesión", exact: true })).toHaveAttribute(
      "href",
      "/cuenta/login",
    );
    await safe();
    pass();

    stage = "real used token cannot change password again";
    assert.equal((await reset(fixture.recovery.password.valid)).status(), 400);
    await expect(p.locator('form [role="alert"]')).toContainText(/ya fue utilizado/);
    await safe();
    pass();

    stage = "old password is rejected and new password logs into the real customer account";
    await p.goto(`${base}/cuenta/login`, { waitUntil: "domcontentloaded" });
    await expect(p.getByRole("link", { name: "Carrito, 0 productos", exact: true })).toBeVisible();
    await p.getByLabel("Correo", { exact: true }).fill(fixture.recovery.password.email);
    await p.getByLabel("Contraseña", { exact: true }).fill(fixture.recovery.password.oldPassword);
    let response = p.waitForResponse((r) => new URL(r.url()).pathname === "/api/cuenta/login");
    await p.getByRole("button", { name: "Entrar", exact: true }).click();
    assert.equal((await response).status(), 401);
    await expect(p.locator('form [role="alert"]')).toBeVisible();
    await p.getByLabel("Contraseña", { exact: true }).fill(fixture.recovery.password.newPassword);
    response = p.waitForResponse((r) => new URL(r.url()).pathname === "/api/cuenta/login");
    await p.getByRole("button", { name: "Entrar", exact: true }).click();
    assert.equal((await response).status(), 200);
    await p.waitForURL("**/cuenta");
    await expect(p.getByRole("heading", { name: "Hola, QA Comprador", exact: true })).toBeVisible();
    await safe();
    pass();
    const keyboard = { coverage: [], findings: [] };
    for (const width of [390, 1280]) {
      stage = `${width}: authenticated real account keyboard, labels and visible focus`;
      await p.setViewportSize({ width, height: 1000 });
      await p.waitForLoadState("networkidle");
      await auditKeyboardPage(p, `real-account-${width}`, keyboard);
      assert.deepEqual(keyboard.findings, []);
      await safe();
      pass();
    }
    fs.writeFileSync("/tmp/gaes-shopper-account-keyboard.json", JSON.stringify(keyboard, null, 2));
    await context.close();

    // Independent guest browser: restore must not overwrite its current selection silently.
    context = await browser.newContext({
      viewport: { width: 360, height: 1000 },
      serviceWorkers: "block",
    });
    const guest = await context.newPage();
    guest.setDefaultTimeout(15000);
    const current = [
      { varianteId: fixture.varianteId, titulo: fixture.titulo, precio: "12.00", cantidad: 1 },
    ];
    await context.addInitScript((current) => {
      if (localStorage.getItem("qa_initialized") !== "yes") {
        localStorage.setItem("gaespos_carrito", JSON.stringify(current));
        localStorage.setItem("qa_initialized", "yes");
      }
    }, current);
    guest.on("pageerror", (e) => errors.push(e.message));
    await guest.route("**/*", (r) => {
      const request = r.request();
      const u = new URL(request.url());
      if (
        !["localhost", "127.0.0.1"].includes(u.hostname) ||
        (request.method() !== "GET" &&
          !(request.method() === "POST" && u.pathname === "/api/carrito/verificar"))
      ) {
        unexpected.push(`${request.method()} ${u.pathname}`);
        return r.abort();
      }
      return r.continue();
    });
    const cart = () =>
      guest.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito") || "[]"));
    for (const mode of ["invalid", "expired"]) {
      stage = `real abandoned cart ${mode}: unavailable link preserves guest cart`;
      const code = fixture.recovery.cart[mode];
      const receipt = guest.waitForResponse(
        (r) => new URL(r.url()).pathname === `/api/recovery/${code}`,
      );
      await guest.goto(`${base}/recovery/${code}`, { waitUntil: "domcontentloaded" });
      // Expired status is deliberately returned as private404 by the actual API.
      assert.equal((await receipt).status(), 404);
      await expect(guest.getByText(/Este enlace ya no está disponible/)).toBeVisible();
      await expect(
        guest.getByRole("link", { name: "Ver mi carrito actual", exact: true }),
      ).toBeVisible();
      assert.deepEqual(await cart(), current);
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpected, []);
      pass();
    }
    stage = "real abandoned cart success requires consent and restores the actual DB receipt";
    await guest.goto(`${base}/recovery/${fixture.recovery.cart.valid}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(guest.getByText("Cantidad: 2", { exact: true })).toBeVisible();
    assert.deepEqual(await cart(), current);
    const restore = guest.getByRole("button", { name: "Reemplazar mi carrito", exact: true });
    await expect(restore).toBeDisabled();
    await guest.getByRole("checkbox", { name: /Quiero reemplazar mi carrito actual/ }).check();
    await restore.click();
    await guest.waitForURL("**/carrito");
    await expect(guest.getByRole("heading", { name: "Tu carrito", exact: true })).toBeVisible();
    await expect(guest.getByText(/Precios consultados\./)).toBeVisible();
    await expect.poll(cart).toEqual([{ ...current[0], cantidad: 2 }]);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    assert(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    pass();
    console.log(`PASS ${groups} real recovery groups; no mail/provider calls or ecommerce orders`);
  } catch (e) {
    const p = context?.pages()[0];
    if (p) {
      await p
        .screenshot({ path: "/tmp/gaes-shopper-recovery-failure.png", fullPage: true })
        .catch(() => {});
      fs.writeFileSync(
        "/tmp/gaes-shopper-recovery-failure.html",
        await p.content().catch(() => ""),
      );
    }
    throw Error(`${stage}: ${e.message}`);
  } finally {
    await context?.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
