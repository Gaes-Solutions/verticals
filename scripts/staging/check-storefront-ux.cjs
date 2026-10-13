/** Browser audit of the staging demo storefront. Creates one unpaid pickup order. */
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const assert = require("node:assert/strict");
require("node:fs").mkdirSync("/tmp/gaes-design", { recursive: true });
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const p = await c.newPage();
  const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
  const target = new URL(base);
  if (!["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(target.hostname))
    throw new Error("Only local or staging URLs are allowed");
  const cart = () => p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito") || "[]"));
  const units = async () => (await cart()).reduce((n, i) => n + i.cantidad, 0);
  await p.goto(`${base}/?q=Lámpara`, { waitUntil: "networkidle" });
  const btn = p.getByRole("button", { name: "Agregar", exact: true }).first();
  await btn.scrollIntoViewIfNeeded();
  const rect = await btn.boundingBox();
  const cd = await c.newCDPSession(p);
  const x = rect.x + 15;
  const y = rect.y + rect.height / 2;
  await cd.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  for (let d = 10; d <= 85; d += 15) {
    await cd.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + d, y, id: 1 }],
    });
  }
  await cd.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await p.getByRole("link", { name: "Ver mi compra", exact: true }).waitFor();
  assert.equal(await units(), 1);
  console.log("PASS deslizar agrega exactamente una unidad");
  await p.screenshot({ path: "/tmp/gaes-design/cart-feedback.png" });
  await p.getByRole("button", { name: "Deshacer", exact: true }).click();
  assert.equal(await units(), 0);
  assert.equal(await p.getByRole("link", { name: "Ver mi compra", exact: true }).count(), 0);
  console.log("PASS Deshacer revierte la adición");
  await p.getByRole("button", { name: "Agregar", exact: true }).first().click();
  assert.equal(await units(), 1);
  await p.getByRole("button", { name: "Agregar uno", exact: true }).first().click();
  assert.equal(await units(), 2);
  await p.reload({ waitUntil: "networkidle" });
  assert.equal(await units(), 2);
  console.log("PASS tap, cambiar cantidad y recuperar carrito al recargar");
  await p.getByRole("link", { name: "Ver mi compra", exact: true }).click();
  await p.getByRole("heading", { name: "Tu carrito", exact: true }).waitFor();
  assert.equal(await p.getByRole("link", { name: "Ver mi compra", exact: true }).count(), 0);
  await p
    .getByRole("link", { name: /Continuar compra/ })
    .last()
    .click();
  await p.getByRole("heading", { name: "Finalizar compra", exact: true }).waitFor();
  await p.getByLabel("Email", { exact: true }).fill(`checkout-qa-${Date.now()}@example.invalid`);
  await p.getByLabel("Nombre completo", { exact: true }).fill("Compra de prueba");
  await p.getByRole("button", { name: "Recoger en tienda", exact: true }).click();
  await p.getByRole("radio", { name: /Sucursal principal/ }).check();
  const pay = p.getByRole("button", { name: /Apartar pedido/ }).last();
  await pay.waitFor();
  const old = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("gaespos_checkout_attempt_v1")),
  );
  const response = p.waitForResponse(
    (r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST",
  );
  await pay.click();
  const res = await response;
  const data = await res.json();
  assert.equal(res.status(), 200, JSON.stringify(data));
  assert.equal(data.pagoAlRecoger, true);
  assert.equal(data.intentStatus, "pendiente");
  await p.waitForURL("**/gracias?*", { timeout: 20000 });
  await p.getByRole("heading", { name: "Tu pedido quedó registrado", exact: true }).waitFor();
  await p
    .getByText(
      "No se realizó ningún cobro en línea. Paga tu pedido cuando lo recojas en la tienda.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await units(), 0);
  console.log(
    "PASS pedido de prueba al recoger registrado; carrito vacío; no afirma pago realizado",
  );
  const retry = await c.request.get(
    `${base}/api/checkout?context=${encodeURIComponent(old.context)}&idempotencyKey=${encodeURIComponent(old.key)}`,
  );
  const replay = await retry.json();
  assert.equal(retry.status(), 200, JSON.stringify(replay));
  assert.equal(replay.folioPublico, data.folioPublico);
  assert.equal(replay.pagoAlRecoger, true);
  console.log("PASS reconsultar intento conserva el mismo folio, sin duplicar pedido");
  await p.screenshot({ path: "/tmp/gaes-design/receipt-pickup.png" });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
