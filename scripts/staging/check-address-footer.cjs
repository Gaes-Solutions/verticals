/** Real staging UI checks with a synthetic shopper, no orders; always cleans its fixture. */
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const { chromium } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
const run = String(Date.now());
const email = `qa-native-${run}-1@example.invalid`;
const password = randomBytes(24).toString("base64url");
fs.mkdirSync("/tmp/gaes-design", { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 640 },
    geolocation: { latitude: 19.4326, longitude: -99.1332, accuracy: 10 },
    permissions: ["geolocation"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${base}/cuenta/registro?next=%2Fcuenta`, { waitUntil: "networkidle" });
    await page.getByLabel("Tu nombre").fill("Prueba Android");
    await page.getByLabel("Correo", { exact: true }).fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/cuenta", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Mis direcciones", exact: true }).waitFor();
    const add = page.getByRole("button", { name: "Agregar", exact: true });
    const visibleFooter = async (dialog) => {
      const button = dialog.getByRole("button", { name: "Guardar dirección", exact: true });
      const box = await button.boundingBox();
      const size = page.viewportSize();
      assert(box && box.width > 20 && box.height > 20, "Save control missing");
      assert(
        box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= size.width + 1 &&
          box.y + box.height <= size.height + 1,
        `Save control leaves ${size.width}x${size.height} viewport`,
      );
      return box;
    };
    for (const size of [
      { width: 320, height: 568 },
      { width: 390, height: 640 },
      { width: 390, height: 420 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(size);
      await add.click();
      const dialog = page.getByRole("dialog", { name: "Nueva dirección", exact: true });
      await dialog.waitFor();
      const before = await visibleFooter(dialog);
      await dialog
        .getByLabel("Referencias (opcional)", { exact: true })
        .fill("Solo prueba, sin entrega");
      const after = await visibleFooter(dialog);
      assert(Math.abs(before.y - after.y) < 2, "Footer moved with the address fields");
      for (let i = 0; i < 24; i++) {
        await page.keyboard.press("Tab");
        assert(
          await dialog.evaluate(
            (el) => el.contains(document.activeElement) || document.activeElement === document.body,
          ),
          "Focus moved into the background page",
        );
      }
      await page.screenshot({
        path: `/tmp/gaes-design/address-footer-${size.width}x${size.height}.png`,
      });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      console.log(
        `PASS fixed address footer, modal focus and Escape at ${size.width}x${size.height}`,
      );
    }
    await page.setViewportSize({ width: 390, height: 640 });
    await add.click();
    let dialog = page.getByRole("dialog", { name: "Nueva dirección", exact: true });
    const lookup = page.waitForResponse((r) => r.url().includes("/api/cuenta/ubicacion"));
    await dialog.getByRole("button", { name: "Usar mi ubicación actual", exact: true }).click();
    assert((await lookup).ok(), "Location service failed");
    await page.waitForFunction(() =>
      document.querySelector("dialog output")?.textContent?.includes("Complet"),
    );
    assert.equal(await dialog.getByLabel("Código postal", { exact: true }).inputValue(), "06060");
    assert((await dialog.getByLabel("Estado", { exact: true }).inputValue()).length > 2);
    assert((await dialog.getByLabel("Calle", { exact: true }).inputValue()).length > 2);
    await visibleFooter(dialog);
    await dialog
      .getByLabel("Etiqueta (Casa, Oficina…)", { exact: true })
      .fill("Prueba web sin entrega");
    let response = page.waitForResponse(
      (r) => r.url().endsWith("/api/cuenta/direcciones") && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Guardar dirección", exact: true }).click();
    assert((await response).ok(), "Address creation failed");
    await dialog.waitFor({ state: "hidden" });
    console.log("PASS real geolocation autofill and address save with leading-zero postal code");

    // Exercise address selection without permitting an order submission.
    await page.route("**/api/checkout", (route) => route.abort());
    await page.goto(`${base}/producto/demo-lampara`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
    await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Finalizar compra", exact: true }).waitFor();
    await page.getByRole("button", { name: "Envío a domicilio", exact: true }).click();
    const savedAddress = page.getByRole("radio", { name: /Prueba web sin entrega/ });
    await savedAddress.waitFor();
    assert.equal(await savedAddress.getAttribute("aria-checked"), "true");
    assert((await savedAddress.innerText()).includes("CP 06060"));
    await page.getByRole("radio", { name: "Nueva dirección", exact: true }).click();
    assert.equal(await page.getByLabel("Código postal", { exact: true }).inputValue(), "");
    await savedAddress.click();
    assert.equal(await savedAddress.getAttribute("aria-checked"), "true");
    console.log(
      "PASS saved address preselected in checkout; leading-zero CP retained; switching to new address clears the fields; no order submitted",
    );
    await page.goto(`${base}/cuenta`, { waitUntil: "networkidle" });
    const card = page
      .locator(".tienda-surface")
      .filter({ has: page.getByText("Prueba web sin entrega", { exact: true }) });
    await card.getByRole("button", { name: "Editar", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Editar dirección", exact: true });
    await dialog.getByLabel("Calle", { exact: true }).fill("Calle de prueba editada");
    await dialog.getByLabel("Usar como predeterminada", { exact: true }).uncheck();
    response = page.waitForResponse(
      (r) => r.url().includes("/api/cuenta/direcciones/") && r.request().method() === "PUT",
    );
    await dialog.getByRole("button", { name: "Guardar dirección", exact: true }).click();
    assert((await response).ok(), "Address update failed");
    await dialog.waitFor({ state: "hidden" });
    await card.getByText(/Calle de prueba editada.*CP 06060/).waitFor();
    assert.equal(await card.getByText("Predeterminada", { exact: true }).count(), 0);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await card.getByText("Predeterminada", { exact: true }).count(), 0);
    await card.getByRole("button", { name: "Editar", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Editar dirección", exact: true });
    assert.equal(
      await dialog.getByLabel("Usar como predeterminada", { exact: true }).isChecked(),
      false,
    );
    await dialog.getByLabel("Usar como predeterminada", { exact: true }).check();
    await dialog.getByRole("button", { name: "Guardar dirección", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await card.getByText("Predeterminada", { exact: true }).waitFor();
    console.log(
      "PASS default-address preference persists unchecked after reload and can be checked again",
    );
    await card.getByRole("button", { name: "Eliminar", exact: true }).click();
    response = page.waitForResponse(
      (r) => r.url().includes("/api/cuenta/direcciones/") && r.request().method() === "DELETE",
    );
    await card.getByRole("button", { name: "¿Seguro? Sí, eliminar", exact: true }).click();
    assert((await response).ok(), "Address deletion failed");
    await page.getByText("Aún no tienes direcciones guardadas", { exact: true }).waitFor();
    assert.deepEqual(errors, [], "Browser JavaScript error");
    console.log("PASS saved address edit/delete and no browser runtime errors; no orders created");
  } catch (error) {
    console.log(`Failed at ${new URL(page.url()).pathname}`);
    await page.screenshot({ path: "/tmp/gaes-design/address-footer-failure.png" });
    console.log(
      (await page.locator("main").innerText())
        .replaceAll(email, "[FIXTURE]")
        .replaceAll(password, "[REDACTED]")
        .slice(0, 3000),
    );
    throw error;
  } finally {
    await browser.close();
    const cleanup = execFileSync(
      process.execPath,
      ["scripts/staging/cleanup-native-fixture.cjs", run, "1", "--delete"],
      { encoding: "utf8", timeout: 70000 },
    );
    console.log(cleanup.trim());
  }
})().catch((error) => {
  console.error(error.message.replaceAll(email, "[FIXTURE]").replaceAll(password, "[REDACTED]"));
  process.exitCode = 1;
});
