/** Public owner signup and first configuration, real local UI/API and disposable DB.
 * Only explicit network failures are injected. No privileged login or tenant seeding.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium, expect } = require("@playwright/test");
const database = new URL(process.env.DATABASE_URL_MASTER);
assert(["127.0.0.1", "localhost"].includes(database.hostname));
assert.match(database.pathname, /^\/qa_platform_\d+$/);
assert.equal(database.search, "");
assert.equal(process.env.OWNER_ONBOARDING_FLOW_TESTS, "true");
const base = "http://127.0.0.1:5180";
const owner = {
  name: "QA Mi Primera Tienda",
  slug: "qa-new-owner",
  email: "new-owner@example.invalid",
  password: "QaOwnerNew!2026",
};
const diagnostics = path.join(os.tmpdir(), "gaes-owner-onboarding");
fs.mkdirSync(diagnostics, { recursive: true, mode: 0o700 });
const views =
  process.env.RELEASE_AUDIT_ISOLATED === "true" ? "/artifacts/owner-views" : diagnostics;
fs.mkdirSync(views, { recursive: true, mode: 0o700 });
let stage = "setup";
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 360, height: 900 },
    serviceWorkers: "block",
  });
  const p = await context.newPage();
  p.setDefaultTimeout(20000);
  const errors = [];
  const forbidden = [];
  const writes = [];
  let failPlans = true;
  let failStock = false;
  let failBranch = false;
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base) {
      forbidden.push(url.origin);
      return route.abort();
    }
    if (request.method() !== "GET") writes.push({ method: request.method(), path: url.pathname });
    if (failPlans && url.pathname === "/api/auth/plans") return route.abort();
    if (failBranch && request.method() === "PATCH" && url.pathname.startsWith("/api/t/sucursales/"))
      return route.abort();
    if (failStock && request.method() === "POST" && url.pathname === "/api/t/inventario/ajustes")
      return route.abort();
    return route.continue();
  });
  p.on("pageerror", (error) => errors.push(error.message));
  let groups = 0;
  const pass = () => console.log(`PASS owner onboarding ${++groups}: ${stage}`);
  const safe = async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(forbidden, []);
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  };
  const action = async (method, endpoint, run, status = 200) => {
    const pending = p.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api${endpoint}` && r.request().method() === method,
    );
    await run();
    const response = await pending;
    assert.equal(response.status(), status, `${method} ${endpoint}`);
    return response.json();
  };
  const go = async (label) => {
    const menu = p.getByRole("button", { name: "Menú del sistema", exact: true });
    if (await menu.isVisible()) await menu.click();
    await p.locator("aside nav").getByRole("button", { name: label, exact: true }).click();
  };
  const snapshot = async (name) => {
    await p.waitForFunction(() => {
      const menu = document.querySelector("#menu-sistema");
      if (!menu) return true;
      const box = menu.getBoundingClientRect();
      return innerWidth < 768 ? box.right <= 0 : Math.abs(box.left) < 1;
    });
    const file = path.join(views, `${name}.png`);
    await p.screenshot({ path: file, fullPage: true });
    fs.chmodSync(file, 0o600);
  };
  const modal = () => p.locator(".gx-modal-panel");
  const read = async (endpoint) => {
    const token = await p.evaluate(() => localStorage.getItem("gaespos_admin_token"));
    assert(token);
    const response = await context.request.get(`${base}/api${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status(), 200, endpoint);
    return response.json();
  };
  try {
    stage = "public registration recovers from unavailable plans without losing fields";
    await p.goto(base);
    await p.getByRole("button", { name: "¿Nuevo negocio? Crea tu cuenta", exact: true }).click();
    await expect(p.getByRole("alert")).toContainText("No pudimos cargar");
    await p.getByLabel("Nombre del negocio", { exact: true }).fill(owner.name);
    await expect(p.getByLabel("Identificador (URL)", { exact: true })).toHaveValue(
      "qa-mi-primera-tienda",
    );
    await p.getByLabel("Identificador (URL)", { exact: true }).fill(owner.slug);
    await p.getByLabel("Tu nombre", { exact: true }).fill("Dueña QA");
    await p.getByLabel("Correo", { exact: true }).fill(owner.email);
    await p.getByLabel("Contraseña (mín. 8)", { exact: true }).fill(owner.password);
    await expect(p.getByRole("button", { name: "Crear cuenta", exact: true })).toBeDisabled();
    failPlans = false;
    await p.getByRole("button", { name: "Reintentar opciones", exact: true }).click();
    await expect(p.getByRole("button", { name: "Crear cuenta", exact: true })).toBeEnabled();
    await expect(p.getByLabel("Correo", { exact: true })).toHaveValue(owner.email);
    await expect(p.getByLabel("Giro", { exact: true }).locator("option")).toHaveCount(1);
    await p.getByLabel("Plan", { exact: true }).selectOption("starter");
    await snapshot("registro-360");
    await safe();
    pass();

    stage = "public signup creates the first tenant, then the owner logs in through the real login";
    await action(
      "POST",
      "/auth/signup",
      () => p.getByRole("button", { name: "Crear cuenta", exact: true }).click(),
      201,
    );
    await expect(p.getByRole("heading", { name: "¡Cuenta creada! 🎉", exact: true })).toBeVisible();
    await p.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await p.getByLabel("Correo", { exact: true }).fill(owner.email);
    await p.getByLabel("Contraseña", { exact: true }).fill(owner.password);
    await p.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      p.getByRole("heading", { name: "Empieza aquí: te llevo paso a paso", exact: true }),
    ).toBeVisible();
    const welcome = p.getByRole("dialog", { name: "Recorrido de bienvenida", exact: true });
    await expect(welcome).toBeVisible();
    for (const [title, anchor] of [
      ["Tu guía de inicio", "nav-inicio"],
      ["Tus productos", "nav-productos"],
      ["Ayuda cuando la necesites", "nav-ayuda"],
      ["¡Listo para empezar! 🎉", null],
    ]) {
      await welcome.getByRole("button", { name: "Siguiente →", exact: true }).click();
      await expect(welcome.getByRole("heading", { name: title, exact: true })).toBeVisible();
      if (anchor) await expect(p.locator(`[data-tour="${anchor}"]`)).toBeInViewport();
    }
    await welcome.getByRole("button", { name: "¡Entendido!", exact: true }).click();
    await expect(welcome).toHaveCount(0);
    await p.getByRole("button", { name: "Guíame", exact: true }).first().click();
    await expect(p.getByRole("dialog")).toBeVisible();
    await p.keyboard.press("Escape");
    await expect(p.getByRole("dialog")).toHaveCount(0);
    const initial = await read("/t/onboarding");
    assert.equal(initial.conteos.productos, 0);
    assert.equal(initial.conteos.ventas, 0);
    await safe();
    pass();

    stage =
      "owner saves branch contact and address, recovers a failed save, and can clear optional contacts";
    await go("Configuración");
    await expect(
      p.getByRole("heading", { name: "Dirección y contacto de la sucursal", exact: true }),
    ).toBeVisible();
    const branches = await read("/t/sucursales");
    const branchId = branches.find((row) => row.isDefault).id;
    await p.getByLabel("Nombre de la sucursal", { exact: true }).fill("Sucursal primera tienda QA");
    await p.getByLabel("Teléfono de contacto", { exact: true }).fill("3312340000");
    await p.getByLabel("Correo de contacto", { exact: true }).fill("contact-owner@example.invalid");
    for (const [label, value] of [
      ["Calle", "Avenida Pruebas"],
      ["Número exterior e interior", "123"],
      ["Colonia", "Centro"],
      ["Municipio / alcaldía", "Guadalajara"],
      ["Ciudad", "Guadalajara"],
      ["Estado", "Jalisco"],
      ["Código postal", "44100"],
    ])
      await p.getByLabel(label, { exact: true }).fill(value);
    failBranch = true;
    await p.getByRole("button", { name: "Guardar sucursal", exact: true }).click();
    await expect(p.getByRole("alert")).toBeVisible();
    await expect(p.getByLabel("Calle", { exact: true })).toHaveValue("Avenida Pruebas");
    failBranch = false;
    await action("PATCH", `/t/sucursales/${branchId}`, () =>
      p.getByRole("button", { name: "Guardar sucursal", exact: true }).click(),
    );
    await p.reload();
    await go("Configuración");
    await expect(p.getByLabel("Calle", { exact: true })).toHaveValue("Avenida Pruebas");
    await expect(p.getByLabel("Correo de contacto", { exact: true })).toHaveValue(
      "contact-owner@example.invalid",
    );
    await p.getByLabel("Correo de contacto", { exact: true }).fill("");
    await p.getByLabel("Teléfono de contacto", { exact: true }).fill("");
    await action("PATCH", `/t/sucursales/${branchId}`, () =>
      p.getByRole("button", { name: "Guardar sucursal", exact: true }).click(),
    );
    const cleared = await read(`/t/sucursales/${branchId}`);
    assert.equal(cleared.emailContacto, null);
    assert.equal(cleared.telefono, null);
    await p.getByLabel("Correo de contacto", { exact: true }).fill("contact-owner@example.invalid");
    await p.getByLabel("Teléfono de contacto", { exact: true }).fill("3312340000");
    await action("PATCH", `/t/sucursales/${branchId}`, () =>
      p.getByRole("button", { name: "Guardar sucursal", exact: true }).click(),
    );
    assert.equal((await read("/t/onboarding")).pasos.datosNegocio, true);
    await snapshot("sucursal-360");
    await go("Guía de inicio");
    await safe();
    pass();

    stage = "owner creates a cashier with the intended role from the first-step guide";
    await p.getByRole("button", { name: "Empezar", exact: true }).click();
    await expect(
      p.getByRole("heading", { name: "Usuarios y permisos", exact: true }),
    ).toBeVisible();
    await p.getByRole("button", { name: "+ Nuevo usuario", exact: true }).click();
    await modal().getByLabel("Nombre", { exact: true }).fill("Cajera QA");
    await modal().getByLabel("Correo", { exact: true }).fill("cashier-new-owner@example.invalid");
    await modal().getByLabel("Contraseña (mínimo 8)", { exact: true }).fill("QaCashierNew!2026");
    await modal().getByRole("combobox", { name: /^Rol/ }).selectOption({ label: "Cajero" });
    await action(
      "POST",
      "/t/usuarios",
      () => modal().getByRole("button", { name: "Crear usuario", exact: true }).click(),
      201,
    );
    await expect(modal()).toHaveCount(0);
    await go("Guía de inicio");
    await expect(
      p.getByRole("heading", { name: "Agrega tus productos", exact: true }).first(),
    ).toBeVisible();
    assert.equal((await read("/t/onboarding")).pasos.vendedores, true);
    await safe();
    pass();

    stage = "first real product saves its initial stock in the default branch";
    await go("Productos");
    await p.getByRole("button", { name: "+ Nuevo producto", exact: true }).click();
    await modal().getByLabel("Nombre *", { exact: true }).fill("Kit primera tienda QA");
    await modal().getByLabel("Precio de venta (IVA incluido) *", { exact: true }).fill("149.90");
    await modal().getByLabel("SKU / código de barras *", { exact: true }).fill("QA-FIRST-OWNER");
    await modal().getByLabel("Existencias iniciales (opcional)", { exact: true }).fill("-1");
    await expect(modal().getByRole("button", { name: "Guardar", exact: true })).toBeDisabled();
    await expect(modal().getByRole("alert")).toContainText("mayor o igual a cero");
    await modal().getByLabel("Existencias iniciales (opcional)", { exact: true }).fill("10");
    const inventorySaved = p.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/t/inventario/ajustes" &&
        r.request().method() === "POST",
    );
    const product = await action(
      "POST",
      "/t/productos",
      () => modal().getByRole("button", { name: "Guardar", exact: true }).click(),
      201,
    );
    assert.equal((await inventorySaved).status(), 201);
    await expect(modal()).toHaveCount(0);
    assert(product.variantes[0]?.id);
    const inventory = await read("/t/inventario?pageSize=100");
    const stock = inventory.items.find((row) => row.varianteId === product.variantes[0].id);
    assert(stock);
    assert.equal(Number(stock.stockActual), 10);
    await safe();
    pass();

    stage = "owner uploads a real product image before publishing it";
    await p
      .locator("tr")
      .filter({ hasText: "QA-FIRST-OWNER" })
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    const imageBase64 = await p.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#12a89d";
      ctx.fillRect(0, 0, 64, 64);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    const imageResponse = p.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/t/productos/${product.id}/imagenes` &&
        r.request().method() === "POST",
    );
    await modal()
      .locator('input[type="file"]')
      .setInputFiles({
        name: "qa-product.png",
        mimeType: "image/png",
        buffer: Buffer.from(imageBase64, "base64"),
      });
    assert.equal((await imageResponse).status(), 201);
    const preview = modal().locator("img");
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    await modal().getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(modal()).toHaveCount(0);
    await safe();
    pass();

    stage = "a failed stock request is visible and does not recreate the product";
    await p.getByRole("button", { name: "+ Nuevo producto", exact: true }).click();
    await modal().getByLabel("Nombre *", { exact: true }).fill("Producto con stock pendiente QA");
    await modal().getByLabel("Precio de venta (IVA incluido) *", { exact: true }).fill("30");
    await modal().getByLabel("SKU / código de barras *", { exact: true }).fill("QA-STOCK-PENDING");
    await modal().getByLabel("Existencias iniciales (opcional)", { exact: true }).fill("7");
    failStock = true;
    await action(
      "POST",
      "/t/productos",
      () => modal().getByRole("button", { name: "Guardar", exact: true }).click(),
      201,
    );
    await expect(modal()).toHaveCount(0);
    await expect(p.getByRole("alert")).toContainText("No se confirmaron sus existencias iniciales");
    failStock = false;
    assert.equal((await read("/t/productos?q=QA-STOCK-PENDING")).items.length, 1);
    await p.getByRole("button", { name: "Revisar inventario", exact: true }).click();
    await expect(p.getByRole("heading", { name: "Inventario", exact: true })).toBeVisible();
    await safe();
    pass();

    stage = "owner recovers pending initial stock through the inventory screen";
    await p.getByRole("button", { name: "+ Entrada de inventario", exact: true }).click();
    await modal().getByPlaceholder("Buscar producto por nombre o SKU…").fill("QA-STOCK-PENDING");
    await modal()
      .getByRole("button", { name: /Producto con stock pendiente QA/ })
      .click();
    await modal().getByPlaceholder("Cantidad que entra").fill("7");
    await modal().getByPlaceholder("Motivo (mín. 3 letras)").fill("Alta inicial verificada");
    await action(
      "POST",
      "/t/inventario/ajustes",
      () => modal().getByRole("button", { name: "Dar entrada", exact: true }).click(),
      201,
    );
    await expect(modal()).toHaveCount(0);
    const recovered = (await read("/t/inventario?pageSize=100")).items.find(
      (row) => row.variante.sku === "QA-STOCK-PENDING",
    );
    assert(recovered);
    assert.equal(Number(recovered.stockActual), 7);
    await safe();
    pass();

    stage =
      "owner creates a wholesale price list, customer and commission through the guide modules";
    await go("Listas de precios");
    await p.getByRole("button", { name: "+ Nueva lista", exact: true }).click();
    await modal().getByLabel("Código", { exact: true }).fill("MAYOREO_QA");
    await modal().getByLabel("Nombre", { exact: true }).fill("Mayoreo primera tienda");
    await action(
      "POST",
      "/t/precios/listas",
      () => modal().getByRole("button", { name: "Crear", exact: true }).click(),
      201,
    );
    await expect(modal()).toHaveCount(0);
    await go("Clientes mayoreo");
    await p.getByRole("button", { name: "+ Nuevo cliente", exact: true }).click();
    await modal().getByLabel("Razón social", { exact: true }).fill("Cliente de mayoreo QA");
    await modal().getByLabel("RFC", { exact: true }).fill("XAXX010101000");
    await modal().getByLabel("Correo", { exact: true }).fill("wholesale-owner@example.invalid");
    await modal().getByLabel("Lista de precios", { exact: true }).selectOption("MAYOREO_QA");
    await action(
      "POST",
      "/t/clientes-b2b",
      () => modal().getByRole("button", { name: "Crear cliente", exact: true }).click(),
      201,
    );
    await expect(modal()).toHaveCount(0);
    await go("Comisiones");
    await p.getByRole("button", { name: "+ Nueva regla", exact: true }).click();
    await modal().getByLabel("Nombre", { exact: true }).fill("Comisión primera tienda QA");
    await modal().getByLabel("Porcentaje (%)", { exact: true }).fill("5");
    await action(
      "POST",
      "/t/comisiones/reglas",
      () => modal().getByRole("button", { name: "Crear regla", exact: true }).click(),
      201,
    );
    await expect(modal()).toHaveCount(0);
    const setup = await read("/t/onboarding");
    assert.equal(setup.pasos.listaPrecios, true);
    assert.equal(setup.pasos.clientesB2b, true);
    assert.equal(setup.pasos.comisiones, true);
    await safe();
    pass();

    stage = "new cashier can sell through the real POS with the signup defaults";
    const posContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: "block",
    });
    try {
      await posContext.route("**/*", (route) =>
        new URL(route.request().url()).origin === "http://127.0.0.1:5181"
          ? route.continue()
          : route.abort(),
      );
      const pos = await posContext.newPage();
      pos.setDefaultTimeout(20000);
      pos.on("pageerror", (error) => errors.push(error.message));
      await pos.goto("http://127.0.0.1:5181");
      await pos.getByLabel("Correo", { exact: true }).fill("cashier-new-owner@example.invalid");
      await pos.getByLabel("Contraseña", { exact: true }).fill("QaCashierNew!2026");
      await pos.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(
        pos.getByRole("heading", { name: "Prepara tu punto de venta", exact: true }),
      ).toBeVisible();
      await pos.getByLabel("Sucursal").selectOption({ index: 1 });
      await expect(pos.getByLabel("Caja")).toBeEnabled();
      await pos.getByLabel("Caja").selectOption({ index: 1 });
      await pos.getByRole("button", { name: "Consultar estado de caja", exact: true }).click();
      await pos.getByPlaceholder("Escribe el efectivo contado").fill("500");
      await pos.getByRole("button", { name: "Abrir caja con este fondo", exact: true }).click();
      await pos.getByRole("button", { name: "Entrar a vender", exact: true }).click();
      const search = pos.getByPlaceholder("Buscar producto o escanear código…");
      await search.fill("QA-FIRST-OWNER");
      await search.press("Enter");
      await expect(pos.getByText("Kit primera tienda QA", { exact: true }).first()).toBeVisible();
      await pos.getByRole("button", { name: /Cobrar/ }).click();
      await pos.getByRole("button", { name: "Confirmar", exact: true }).click();
      await expect(pos.getByRole("status")).toContainText("cobrada");
      await expect(pos.getByRole("status")).toContainText("149.90");
      await pos.getByRole("button", { name: "Iniciar nueva venta", exact: true }).click();
      await expect(pos.getByRole("button", { name: /Cobrar/ })).toBeDisabled();
    } finally {
      await posContext.close();
    }
    const sales = await read("/t/ventas?pageSize=10");
    assert.equal(sales.total, 1);
    const orders = await read("/t/pedidos?pageSize=10");
    await go("Guía de inicio");
    await expect(
      p.getByRole("heading", { name: "🎉 Ya tienes lo básico listo", exact: true }),
    ).toBeVisible();
    const recommendation = p.locator("section").filter({ hasText: "Siguiente paso recomendado" });
    await expect(
      recommendation.getByRole("heading", { name: "Protege el acceso", exact: true }),
    ).toBeVisible();
    await expect(recommendation).not.toContainText("Completa los datos de tu negocio");
    const finalStock = (await read("/t/inventario?pageSize=100")).items.find(
      (row) => row.varianteId === product.variantes[0].id,
    );
    assert.equal(Number(finalStock.stockActual), 9);
    await snapshot("guia-lista-360");
    await safe();
    pass();

    stage = "owner publishes the first product and enables the store with persisted configuration";
    await go("Tienda online");
    await expect(
      p.getByLabel("Tienda activa (visible al público)", { exact: true }),
    ).toBeDisabled();
    await p.getByLabel("Nombre de la tienda", { exact: true }).fill(owner.name);
    await p.getByRole("textbox", { name: /^Subdominio/ }).fill(owner.slug);
    await action(
      "PUT",
      "/t/ecommerce/config",
      () => p.getByRole("button", { name: "Guardar", exact: true }).click(),
      201,
    );
    await p.getByPlaceholder("Buscar producto por nombre o SKU…").fill("Kit primera tienda QA");
    await action(
      "POST",
      "/t/ecommerce/productos-publicados",
      () => p.getByRole("button", { name: "Publicar", exact: true }).first().click(),
      201,
    );
    await expect(p.getByLabel("Tienda activa (visible al público)", { exact: true })).toBeEnabled();
    await p.getByLabel("Tienda activa (visible al público)", { exact: true }).check();
    await action("PUT", "/t/ecommerce/config", () =>
      p.getByRole("button", { name: "Guardar", exact: true }).click(),
    );
    await p.reload();
    await go("Tienda online");
    await expect(p.getByLabel("Nombre de la tienda", { exact: true })).toHaveValue(owner.name);
    await expect(p.getByLabel("Tienda activa (visible al público)", { exact: true })).toBeChecked();
    await p.setViewportSize({ width: 1280, height: 900 });
    await expect
      .poll(() => p.locator("aside").evaluate((el) => Math.abs(el.getBoundingClientRect().left)))
      .toBeLessThan(1);
    await snapshot("tienda-1280");
    await safe();
    pass();

    stage = "owner enables pickup using the branch created by public signup";
    await go("Envíos");
    const pickupSection = p.locator("section").filter({
      has: p.getByRole("heading", { name: "Recoger en tienda (click & collect)", exact: true }),
    });
    const branch = pickupSection.getByRole("checkbox").first();
    await expect(branch).toBeVisible();
    const pickups = await read("/t/envios/pickup");
    assert(pickups[0]?.sucursal.id);
    await action("PUT", `/t/envios/pickup/${pickups[0].sucursal.id}`, () => branch.check());
    await p.reload();
    await go("Envíos");
    await expect(pickupSection.getByRole("checkbox").first()).toBeChecked();
    await safe();
    pass();

    stage = "cashier receives only operational access and cannot change branch configuration";
    const cashierContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: "block",
    });
    try {
      await cashierContext.route("**/*", (route) =>
        new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
      );
      const cashier = await cashierContext.newPage();
      await cashier.goto(base);
      await cashier.getByLabel("Correo", { exact: true }).fill("cashier-new-owner@example.invalid");
      await cashier.getByLabel("Contraseña", { exact: true }).fill("QaCashierNew!2026");
      await cashier.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(cashier.locator("aside nav")).toBeVisible();
      await expect(
        cashier.locator("aside nav").getByRole("button", { name: "Tienda online", exact: true }),
      ).toHaveCount(0);
      await expect(
        cashier
          .locator("aside nav")
          .getByRole("button", { name: "Usuarios y permisos", exact: true }),
      ).toHaveCount(0);
      const token = await cashier.evaluate(() => localStorage.getItem("gaespos_admin_token"));
      assert(token);
      const response = await cashierContext.request.patch(`${base}/api/t/sucursales/${branchId}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { nombre: "Unauthorized QA" },
      });
      assert.equal(response.status(), 403);
      const config = await cashierContext.request.get(`${base}/api/t/ecommerce/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(config.status(), 403);
    } finally {
      await cashierContext.close();
    }
    await safe();
    pass();

    stage =
      "own domain remains unverified and shows DNS instructions without replacing the working store link";
    await go("Tienda online");
    const ownDomain = p.getByPlaceholder("tienda.minegocio.com");
    await ownDomain.fill("qa-owner-domain.example.test");
    await action("PUT", "/t/ecommerce/config", () =>
      p.getByRole("button", { name: "Guardar", exact: true }).click(),
    );
    await expect(p.getByText("Sin verificar", { exact: true })).toBeVisible();
    await expect(p.getByText("CNAME", { exact: true })).toBeVisible();
    await expect(p.getByText("TXT", { exact: true })).toBeVisible();
    const domainConfig = await read("/t/ecommerce/config");
    assert.equal(domainConfig.dominioVerificado, false);
    assert.equal(domainConfig.urlPublica, "https://qa-new-owner.shops.example.test");
    await ownDomain.fill("");
    await action("PUT", "/t/ecommerce/config", () =>
      p.getByRole("button", { name: "Guardar", exact: true }).click(),
    );
    await safe();
    pass();

    stage = "owner activates real TOTP and can sign in with a one-use backup code";
    await go("Seguridad");
    const enroll = await action("POST", "/auth/tenant/mfa/enroll", () =>
      p.getByRole("button", { name: "Activar 2FA", exact: true }).click(),
    );
    const { authenticator } = require(`${process.cwd()}/apps/api/node_modules/otplib`);
    if (Date.now() % 30000 > 26000) await p.waitForTimeout(4500);
    await p.getByPlaceholder("123456").fill(authenticator.generate(enroll.secret));
    const activated = await action("POST", "/auth/tenant/mfa/enroll/confirm", () =>
      p.getByRole("button", { name: "Activar", exact: true }).click(),
    );
    assert(activated.backupCodes.length > 0);
    await expect(
      p.getByRole("heading", { name: "Códigos de respaldo", exact: true }),
    ).toBeVisible();
    await p.getByRole("button", { name: "Listo", exact: true }).click();
    const secured = await read("/auth/tenant/mfa/estado");
    assert.equal(secured.enabled, true);
    const loginContext = await browser.newContext({
      viewport: { width: 360, height: 900 },
      serviceWorkers: "block",
    });
    try {
      await loginContext.route("**/*", (route) =>
        new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
      );
      const login = await loginContext.newPage();
      await login.goto(base);
      await login.getByLabel("Correo", { exact: true }).fill(owner.email);
      await login.getByLabel("Contraseña", { exact: true }).fill(owner.password);
      await login.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(login.getByLabel("Código 2FA", { exact: true })).toBeVisible();
      await login
        .getByRole("button", { name: "Perdí mi teléfono · usar código de respaldo", exact: true })
        .click();
      await login.getByLabel("Código de respaldo", { exact: true }).fill(activated.backupCodes[0]);
      await login.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(
        login.getByRole("heading", { name: "🎉 Ya tienes lo básico listo", exact: true }),
      ).toBeVisible();
    } finally {
      await loginContext.close();
    }
    await safe();
    pass();

    const fixture = {
      imageExpected: true,
      slugSeo: "kit-primera-tienda-qa",
      titulo: product.nombre,
      precio: "149.90",
      varianteId: product.variantes[0].id,
      baseline: {
        orders: orders.total,
        ecommerceOrders: 0,
        sales: sales.total,
        inventory: [
          { varianteId: stock.varianteId, stock: String(finalStock.stockActual), reserved: "0" },
        ],
      },
      order: {
        checkoutAttempts: 0,
        email: "guest-order@shopper.example.invalid",
        sucursalId: pickups[0].sucursal.id,
      },
    };
    fs.writeFileSync(process.env.SHOPPER_FIXTURE_FILE, JSON.stringify(fixture), { mode: 0o600 });
    fs.writeFileSync(
      process.env.OWNER_ONBOARDING_RESULT_FILE,
      JSON.stringify({
        slug: owner.slug,
        productId: product.id,
        groups,
        registeredThroughPublicUI: true,
      }),
      { mode: 0o600 },
    );
    console.log(
      `PASS ${groups} public owner onboarding groups; no tenant preseed or privileged session`,
    );
  } catch (error) {
    console.error(`FAIL owner onboarding at ${stage}: ${error.stack}`);
    await p
      .screenshot({ path: path.join(diagnostics, "failure.png"), fullPage: true })
      .catch(() => {});
    fs.writeFileSync(
      path.join(diagnostics, "failure.txt"),
      await p
        .locator("body")
        .innerText()
        .catch(() => "unavailable"),
      { mode: 0o600 },
    );
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
