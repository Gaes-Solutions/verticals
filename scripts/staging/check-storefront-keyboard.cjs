/** Chromium keyboard audit. Staging GETs only; cart/account/shipping are synthetic.
 * KEYBOARD_QA_LOCAL_SOURCE=1 checks actual checkout/AuthForm source in isolation.
 * Does not cover authenticated account SSR, screen readers or every store state.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const { auditKeyboardPage } = require("./storefront-keyboard-browser.cjs");
const local = process.env.KEYBOARD_QA_LOCAL_SOURCE === "1";
const app = path.resolve("apps/web-tienda");
const findings = [];
const coverage = [];
const writes = [];
let server;
let browser;
const fixtureAddress = {
  id: "qa-address",
  etiqueta: "Casa QA",
  calle: "Calle QA",
  numeroExterior: "1",
  colonia: null,
  municipio: "Monterrey",
  estado: "Nuevo León",
  codigoPostal: "64000",
  referencias: null,
  isDefaultEnvio: true,
};
const fixtureCards = ["1111", "2222"].map((last4, i) => ({
  id: `qa-card-${i}`,
  marca: "visa",
  last4,
  expMes: 12,
  expAnio: 2030,
}));
const record = (condition, message) => {
  if (!condition) findings.push(message);
};
async function localServer() {
  const fromApp = (name) =>
    require(require.resolve(name, { paths: [app, path.resolve("node_modules/vite")] }));
  const result = await fromApp("esbuild").build({
    absWorkingDir: app,
    stdin: {
      resolveDir: app,
      loader: "tsx",
      contents: `import {createRoot} from 'react-dom/client';import Checkout from './src/app/checkout/page';import {AuthForm} from './src/components/auth-form';const p=location.pathname;createRoot(document.getElementById('root')).render(p==='/checkout'?<Checkout/>:<AuthForm modo={p.endsWith('registro')?'registro':'login'}/>);`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "next-fixture",
        setup(b) {
          b.onResolve({ filter: /^next\/(link|navigation)$/ }, (a) => ({
            path: a.path,
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            loader: "tsx",
            resolveDir: app,
            contents:
              a.path === "next/link"
                ? "export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}"
                : "export function useRouter(){return {push:url=>{location.href=url},refresh:()=>{}}}",
          }));
        },
      },
    ],
  });
  const tailwindConfig = fromApp("tailwindcss/loadConfig")(path.join(app, "tailwind.config.ts"));
  tailwindConfig.content = [path.join(app, "src/**/*.{ts,tsx}")];
  const css = await fromApp("postcss")([
    fromApp("postcss-import")(),
    fromApp("tailwindcss")(tailwindConfig),
    fromApp("autoprefixer")(),
  ]).process(fs.readFileSync(path.join(app, "src/app/globals.css"), "utf8"), {
    from: path.join(app, "src/app/globals.css"),
  });
  server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("content-type", "application/javascript");
      return res.end(result.outputFiles[0].contents);
    }
    if (req.url === "/styles.css") {
      res.setHeader("content-type", "text/css");
      return res.end(css.css);
    }
    res.end(
      '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root"></main><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${server.address().port}`;
}
async function keyboardReach(page, target) {
  for (let i = 0; i < 170; i++) {
    if (await target.evaluate((e) => e === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw Error(
    `Cannot reach target using Tab: ${await target.evaluate((e) => e.outerHTML.slice(0, 800))}`,
  );
}
async function auditCheckout(page, name) {
  for (const groupName of ["Dirección de envío", "Método de pago", "Tu tarjeta"]) {
    const group = page.getByRole("radiogroup", { name: groupName, exact: true });
    const items = group.getByRole("radio");
    await expect(items.first()).toBeVisible();
    await expect(items.first()).toBeEnabled();
    const count = await items.count();
    assert(count >= 2);
    const selected = group.locator("[role=radio][aria-checked=true]");
    await keyboardReach(page, selected);
    const keys = [
      ["End", count - 1],
      ["ArrowRight", 0],
      ["ArrowLeft", count - 1],
      ["Home", 0],
      ["ArrowDown", 1],
      ["ArrowUp", 0],
    ];
    // Going to a non-card payment hides the card group, so restore first afterward.
    for (const [key, index] of keys) {
      await page.keyboard.press(key);
      record(
        await items
          .nth(index)
          .evaluate(
            (e) => e === document.activeElement && e.getAttribute("aria-checked") === "true",
          ),
        `${name}: ${groupName} ${key} selection/focus failed`,
      );
    }
    record(
      (await items.evaluateAll((es) => es.filter((e) => e.tabIndex === 0).length)) === 1,
      `${name}: ${groupName} must have one Tab stop`,
    );
    // A synthetic disabled alternative exercises the real group's handler safely.
    if (count >= 3) {
      await items.nth(1).evaluate((e) => {
        e.disabled = true;
      });
      await page.keyboard.press("ArrowDown");
      record(
        await items
          .nth(2)
          .evaluate(
            (e) => e === document.activeElement && e.getAttribute("aria-checked") === "true",
          ),
        `${name}: ${groupName} did not skip disabled option`,
      );
      await items.nth(1).evaluate((e) => {
        e.disabled = false;
      });
      await page.keyboard.press("Home");
    }
  }
  await keyboardReach(page, page.getByLabel("Email", { exact: true }));
  await page.keyboard.type("qa@example.invalid");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Nombre completo", { exact: true })).toBeFocused();
}
async function auditAuth(page, name) {
  const toggle = page.getByRole("button", { name: "Mostrar contraseña", exact: true });
  await keyboardReach(page, toggle);
  const box = await toggle.boundingBox();
  record(
    box.width >= 44 && box.height >= 44,
    `${name}: password toggle ${box.width}x${box.height}, expected 44x44`,
  );
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("type", "text");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("type", "password");
}
async function auditGallery(page, name) {
  const open = page.getByRole("button", { name: /Ampliar imagen/ });
  await keyboardReach(page, open);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i < 6 ? "Tab" : "Shift+Tab");
    record(
      await dialog.evaluate(
        (e) => e.contains(document.activeElement) || document.activeElement === document.body,
      ),
      `${name}: gallery focus escaped`,
    );
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(open).toBeFocused();
}
async function auditFilters(page, name) {
  const open = page.getByRole("button", { name: /^Filtros/ });
  await keyboardReach(page, open);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Filtros", exact: true });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press(i < 10 ? "Tab" : "Shift+Tab");
    record(
      await dialog.evaluate(
        (e) => e.contains(document.activeElement) || document.activeElement === document.body,
      ),
      `${name}: filters focus escaped`,
    );
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(open).toBeFocused();
}
function networkRoute(base, r) {
  const req = r.request();
  const u = new URL(req.url());
  if (u.origin !== base) return r.abort();
  if (u.pathname === "/api/carrito/verificar")
    return r.fulfill({
      json: {
        items: req
          .postDataJSON()
          .items.map((i) => ({ ...i, estado: "publicado", precio: "100.00" })),
      },
    });
  if (req.method() !== "GET") {
    writes.push(u.pathname);
    return r.abort();
  }
  const fixtures = {
    "/api/checkout/session": { context: "qa-keyboard" },
    "/api/tienda-config": {
      msiHabilitado: false,
      msiMeses: [],
      msiMontoMinimo: "0",
      cuponEnCheckout: false,
      envioGratisDesde: null,
      metodosPago: ["tarjeta", "oxxo", "spei"],
      proveedorPago: "conekta",
    },
    "/api/envios": {
      opcionesEnvio: [
        {
          tarifaId: "qa",
          nombrePublico: "Envío QA",
          paqueteria: "QA",
          costo: "25.00",
          gratis: false,
          diasEntregaEstimados: 2,
        },
      ],
      pickup: [{ sucursalId: "qa", nombre: "Sucursal QA", tiempoPreparacionPromedioMin: 20 }],
    },
    "/api/cuenta/direcciones": [fixtureAddress],
    "/api/cuenta/medios-pago": fixtureCards,
    "/api/cuenta/me": { id: "qa-buyer", nombre: "Persona QA", email: "qa@example.invalid" },
  };
  if (u.pathname in fixtures) return r.fulfill({ json: fixtures[u.pathname] });
  if (u.pathname === "/api/checkout")
    return r.fulfill({
      status: 404,
      json: { safeToRetry: true, code: "CHECKOUT_NOT_FOUND" },
    });
  return r.continue();
}
async function auditPurchase(page, name, detail) {
  const before = await page.evaluate(() => localStorage.getItem("gaespos_carrito"));
  const add = page
    .getByRole("button", { name: detail ? "Agregar al carrito" : "Agregar", exact: true })
    .first();
  await keyboardReach(page, add);
  await page.keyboard.press(detail ? "Space" : "Enter");
  const undo = page.getByRole("button", { name: "Deshacer", exact: true });
  await expect(undo).toBeVisible();
  const units = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gaespos_carrito")).reduce((n, item) => n + item.cantidad, 0),
  );
  record(units === 2, `${name}: keyboard add must add exactly one unit`);
  await keyboardReach(page, undo);
  await page.keyboard.press(detail ? "Enter" : "Space");
  record(
    (await page.evaluate(() => localStorage.getItem("gaespos_carrito"))) === before,
    `${name}: keyboard undo did not restore cart`,
  );
}
async function auditCart(page, name) {
  const up = page.getByRole("button", {
    name: "Aumentar cantidad de Producto teclado QA",
    exact: true,
  });
  const down = page.getByRole("button", {
    name: "Disminuir cantidad de Producto teclado QA",
    exact: true,
  });
  await keyboardReach(page, up);
  await page.keyboard.press("Space");
  record(
    (await page.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito"))[0].cantidad)) ===
      2,
    `${name}: keyboard increment failed`,
  );
  await keyboardReach(page, down);
  await page.keyboard.press("Enter");
  record(
    (await page.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito"))[0].cantidad)) ===
      1,
    `${name}: keyboard decrement failed`,
  );
}
async function runPage(width, route, base) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    hasTouch: width === 390,
    serviceWorkers: "block",
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      "gaespos_carrito",
      JSON.stringify([
        {
          varianteId: "qa-keyboard",
          titulo: "Producto teclado QA",
          precio: "100.00",
          cantidad: 1,
        },
      ]),
    ),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/*", (r) => networkRoute(base, r));
  await page.goto(base + route, { waitUntil: "networkidle", timeout: 45000 });
  const name = `${width}px ${route}`;
  await auditKeyboardPage(page, name, { coverage, findings });
  if (route.startsWith("/?") || route.startsWith("/producto/"))
    await auditPurchase(page, name, route.startsWith("/producto/"));
  if (route === "/carrito") await auditCart(page, name);
  if (route === "/checkout") {
    await auditCheckout(page, name);
  }
  if (route.includes("/cuenta/") || route === "/cuenta") {
    await auditAuth(page, name);
  }
  if (route.startsWith("/producto/")) {
    await auditGallery(page, name);
  }
  if (route.startsWith("/?") && width === 390) {
    await auditFilters(page, name);
  }
  record(errors.length === 0, `${name}: client errors: ${errors.join(";")}`);
  console.log(`CHECK ${name}`);
  await context.close();
}
(async () => {
  const base = local ? await localServer() : "https://web-tienda-staging.up.railway.app";
  browser = await chromium.launch();
  for (const width of process.env.KEYBOARD_QA_WIDTH
    ? [Number(process.env.KEYBOARD_QA_WIDTH)]
    : [1280, 390]) {
    assert([1280, 390].includes(width));
    const paths = local
      ? ["/checkout", "/cuenta/login", "/cuenta/registro"]
      : [
          "/?q=L%C3%A1mpara",
          "/producto/demo-lampara",
          "/carrito",
          "/checkout",
          "/cuenta/login",
          "/cuenta/registro",
          "/cuenta",
        ];
    for (const route of process.env.KEYBOARD_QA_ROUTES
      ? process.env.KEYBOARD_QA_ROUTES.split(",")
      : paths) {
      assert(paths.includes(route));
      await runPage(width, route, base);
    }
  }
  record(writes.length === 0, `Unexpected mutation attempts blocked: ${writes.join(",")}`);
  const report = {
    mode: local ? "source-isolated" : "published-staging",
    coverage,
    findings,
    forwardedWrites: 0,
    blockedMutationAttempts: writes.length,
    limitations: [
      "CSS outline/shadow detector does not prove contrast or screen reader support",
      "No authenticated account SSR, orders, payment, emails, physical devices or complete state matrix",
    ],
  };
  fs.writeFileSync(
    `/tmp/gaes-storefront-keyboard-${local ? "source" : "staging"}-report.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (findings.length) process.exitCode = 1;
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    if (server) await new Promise((r) => server.close(r));
  });
