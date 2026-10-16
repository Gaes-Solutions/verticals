/** Staging audit. Creates a disposable shopper and address, without submitting an order. */
require("node:fs").mkdirSync("/tmp/gaes-design", { recursive: true });
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const p = await c.newPage();
  const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
  if (
    !["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(
      new URL(base).hostname,
    )
  )
    throw Error("Only staging or local URLs");
  const email = `ux-recovery-${Date.now()}@example.invalid`;
  const password = "UxQaTest-2026!";
  await p.goto(`${base}/producto/demo-lampara`, { waitUntil: "networkidle" });
  const qty = p.getByLabel("Cantidad", { exact: true });
  await qty.fill("0");
  await p.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
  await p.getByRole("alert").filter({ hasText: "cantidad entera" }).waitFor();
  assert.equal(
    await p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito") || "[]").length),
    0,
  );
  await qty.fill("1.5");
  await p.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
  assert.equal(
    await p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito") || "[]").length),
    0,
  );
  await qty.fill("1");
  await p.getByRole("button", { name: "Aumentar cantidad", exact: true }).click();
  assert.equal(await qty.inputValue(), "2");
  await p.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
  assert.equal(
    await p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito"))[0].cantidad),
    2,
  );
  console.log("PASS cantidades inválidas bloqueadas y stepper agrega 2");
  await p.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  await p.getByLabel("Email", { exact: true }).fill(email);
  await p.getByLabel("Nombre completo", { exact: true }).fill("Borrador conservado");
  await p.getByRole("button", { name: "Envío a domicilio", exact: true }).click();
  await p.getByLabel("Calle", { exact: true }).fill("Reforma");
  await p.getByLabel("Ciudad", { exact: true }).fill("Cuauhtémoc");
  await p.getByLabel("Estado", { exact: true }).fill("Ciudad de México");
  await p.getByLabel("Código postal", { exact: true }).fill("06060");
  await p.reload({ waitUntil: "networkidle" });
  assert.equal(await p.getByLabel("Calle", { exact: true }).inputValue(), "Reforma");
  assert.equal(await p.getByLabel("Código postal", { exact: true }).inputValue(), "06060");
  console.log("PASS borrador y CP con cero inicial se conservan al recargar");
  await p.goto(`${base}/cuenta/registro?next=%2Fcheckout`, { waitUntil: "networkidle" });
  await p.getByLabel("Tu nombre").fill("Cuenta QA");
  await p.getByLabel("Correo", { exact: true }).fill(email);
  await p.getByLabel("Contraseña", { exact: true }).fill(password);
  await p.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await p.waitForURL("**/checkout");
  await p.waitForLoadState("networkidle");
  assert.equal(
    await p.getByLabel("Nombre completo", { exact: true }).inputValue(),
    "Borrador conservado",
  );
  assert.equal(await p.getByLabel("Calle", { exact: true }).inputValue(), "Reforma");
  console.log("PASS registro regresa a compra sin perder formulario");
  await c.addCookies([
    {
      name: "gaespos_cliente_token",
      value: "expired.invalid.token",
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await p.reload({ waitUntil: "networkidle" });
  await p.getByRole("link", { name: "Iniciar sesión y continuar", exact: true }).click();
  await p.getByLabel("Correo", { exact: true }).fill(email);
  await p.getByLabel("Contraseña", { exact: true }).fill(password);
  await p.getByRole("button", { name: "Entrar", exact: true }).click();
  await p.waitForURL("**/checkout");
  await p.waitForLoadState("networkidle");
  assert.equal(await p.getByLabel("Calle", { exact: true }).inputValue(), "Reforma");
  console.log("PASS sesión inválida solicita login y retorna al mismo carrito");
  const identity = await p.evaluate(async () => (await fetch("/api/checkout/session")).json());
  await p.waitForFunction(
    (ctx) =>
      JSON.parse(localStorage.getItem("gaespos_checkout_attempt_v1") || "{}").context === ctx,
    identity.context,
  );
  const before = await p.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("gaespos_checkout_attempt_v1"));
    a.submitted = true;
    localStorage.setItem("gaespos_checkout_attempt_v1", JSON.stringify(a));
    return a;
  });
  await p.reload({ waitUntil: "networkidle" });
  await p.route("**/api/checkout?*", (r) => r.abort());
  await p.getByRole("button", { name: "Consultar estado del pago", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: /fetch|consultar|verificando/ })
    .waitFor();
  assert.equal(
    await p.evaluate(
      () => JSON.parse(localStorage.getItem("gaespos_checkout_attempt_v1")).submitted,
    ),
    true,
  );
  await p.unroute("**/api/checkout?*");
  await p.getByRole("button", { name: "Consultar estado del pago", exact: true }).click();
  await p.getByRole("alert").filter({ hasText: "No hay un pedido registrado" }).waitFor();
  const after = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("gaespos_checkout_attempt_v1")),
  );
  assert.equal(after.key, before.key);
  assert.equal(after.submitted, false);
  console.log("PASS fallo de red no habilita nuevo pago; ausencia confirmada recupera misma clave");
  await p.screenshot({ path: "/tmp/gaes-design/checkout-recovery.png", fullPage: true });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await p.goto(`${base}/cuenta`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Agregar", exact: true }).click();
  const form = p
    .locator("form")
    .filter({ has: p.getByRole("heading", { name: "Nueva dirección" }) });
  for (const [label, value] of [
    ["Etiqueta (Casa, Oficina…)", "Casa QA recuperación"],
    ["Calle", "Reforma"],
    ["Número", "10"],
    ["Colonia", "Centro"],
    ["Ciudad / Municipio", "Cuauhtémoc"],
    ["Estado", "Ciudad de México"],
    ["Código postal", "06060"],
  ])
    await form.getByLabel(label, { exact: true }).fill(value);
  await p.route("**/api/cuenta/direcciones", async (r) => {
    if (r.request().method() === "POST")
      await r.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "No hay conexión de prueba" }),
      });
    else await r.continue();
  });
  await form.getByRole("button", { name: "Guardar dirección", exact: true }).click();
  await form.getByRole("alert").filter({ hasText: "No hay conexión de prueba" }).waitFor();
  assert.equal(await form.getByLabel("Calle", { exact: true }).inputValue(), "Reforma");
  await p.unroute("**/api/cuenta/direcciones");
  await form.getByRole("button", { name: "Guardar dirección", exact: true }).click();
  await p.getByText("Casa QA recuperación", { exact: true }).waitFor();
  await p.reload({ waitUntil: "networkidle" });
  await p.getByText("Casa QA recuperación", { exact: true }).waitFor();
  console.log("PASS fallo de dirección conserva campos; reintento guarda y persiste");
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
