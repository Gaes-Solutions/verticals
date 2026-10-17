/** Real product shipping component with synthetic GETs; optional published read-only BFF check.
 * No orders, payments, shipping purchases, profile edits or outgoing messages. */
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const rate = {
  tarifaId: "qa-rate",
  nombrePublico: "Entrega QA",
  paqueteria: "propio",
  costo: "75.00",
  gratis: false,
  diasEntregaEstimados: 2,
};
const quote = { opcionesEnvio: [rate], pickup: [] };
let stage = "setup";
let diagnostic;
(async () => {
  let server;
  let browser;
  let context;
  let groups = 0;
  try {
    let base = process.env.STOREFRONT_TEST_URL;
    const published = Boolean(base);
    let productPath = "/";
    if (base)
      assert(
        ["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(
          new URL(base).hostname,
        ),
      );
    else {
      const app = path.join(process.cwd(), "apps/web-tienda");
      const esbuild = require(
        require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
      );
      const bundle = await esbuild.build({
        absWorkingDir: app,
        stdin: {
          resolveDir: app,
          loader: "tsx",
          contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {ProductoCompra} from './src/components/producto-compra';function QA(){const [amount,setAmount]=useState(null);window.setAmount=setAmount;return <ProductoCompra mostrarCotizacion variantes={[{id:"qa-standard",precioBase:"100",nombreVariante:"Estándar"},{id:"qa-large",precioBase:"200",nombreVariante:"Grande"}]} precioOverride={amount===null?null:String(amount)} titulo="Producto sintético QA" comprarAhora={false} msi={{habilitado:false,meses:[],montoMinimo:"0"}}/>};const root=createRoot(document.getElementById('root'));window.unmountEstimate=()=>root.unmount();root.render(<QA/>);`,
        },
        bundle: true,
        write: false,
        jsx: "automatic",
        define: { "process.env.NODE_ENV": '"production"' },
        plugins: [
          {
            name: "next-fixtures",
            setup(build) {
              build.onResolve({ filter: /^next\/(link|navigation)$/ }, (args) => ({
                path: args.path,
                namespace: "fixture",
              }));
              build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
                loader: "tsx",
                resolveDir: app,
                contents:
                  args.path === "next/link"
                    ? "export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}"
                    : "export function useRouter(){return {push(){throw Error('Unexpected navigation')}}}",
              }));
            },
          },
        ],
      });
      server = http.createServer((req, res) => {
        if (req.url === "/bundle.js") {
          res.setHeader("content-type", "application/javascript");
          return res.end(bundle.outputFiles[0].contents);
        }
        if (req.url === "/styles.css") {
          res.setHeader("content-type", "text/css");
          return res.end(
            process.env.SHIPPING_QA_CSS ? fs.readFileSync(process.env.SHIPPING_QA_CSS) : "",
          );
        }
        res.end(
          '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>',
        );
      });
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${server.address().port}`;
    }
    browser = await chromium.launch();
    if (published) {
      context = await browser.newContext({ serviceWorkers: "block" });
      await context.route("**/api/**", (route) =>
        route.request().method() === "GET" ? route.continue() : route.abort(),
      );
      const page = await context.newPage();
      await page.goto(base, { waitUntil: "domcontentloaded" });
      const href = await page.locator('a[href^="/producto/"]').first().getAttribute("href");
      assert(href?.startsWith("/producto/"));
      productPath = href;
    }
    const pass = () => {
      groups++;
      console.log(`PASS ${stage}`);
    };
    const setup = async () => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        locale: "es-MX",
        serviceWorkers: "block",
      });
      await context.addInitScript(() => {
        const timeout = AbortSignal.timeout.bind(AbortSignal);
        AbortSignal.timeout = (ms) => timeout(ms === 20000 && window.qaFastDeadline ? 500 : ms);
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const f = { mode: "standard", reads: [], writes: 0, errors: [], release: null, assets: [] };
      diagnostic = f;
      page.on("requestfailed", (req) => {
        const url = new URL(req.url());
        if (url.pathname.startsWith("/_next/"))
          f.assets.push({ path: url.pathname, failure: req.failure()?.errorText });
      });
      page.on("response", (res) => {
        const url = new URL(res.url());
        if (url.pathname.startsWith("/_next/") && res.status() >= 400)
          f.assets.push({ path: url.pathname, status: res.status() });
      });
      page.on("pageerror", (e) => f.errors.push(e.message));
      await page.route("**/api/**", async (route) => {
        const req = route.request();
        if (req.method() !== "GET") {
          f.writes++;
          return route.abort();
        }
        const url = new URL(req.url());
        if (url.pathname !== "/api/envios") return published ? route.continue() : route.abort();
        f.reads.push(Object.fromEntries(url.searchParams));
        const mode = f.mode;
        if (mode === "network") return route.abort();
        if (mode === "delayed")
          await new Promise((r) => {
            f.release = r;
          });
        if (mode === "timeout") await new Promise((r) => setTimeout(r, 1200));
        const options =
          mode === "malformed"
            ? { contentType: "application/json", body: "broken" }
            : mode === "error"
              ? { status: 503, json: { message: "PRIVATE UPSTREAM DETAIL" } }
              : mode === "limited"
                ? { status: 429, json: {} }
                : mode === "invalid"
                  ? { json: { ...quote, opcionesEnvio: [{ ...rate, costo: "NaN" }] } }
                  : mode === "false-free"
                    ? { json: { ...quote, opcionesEnvio: [{ ...rate, gratis: true }] } }
                    : mode === "missing"
                      ? { json: { opcionesEnvio: [] } }
                      : mode === "empty"
                        ? { json: { opcionesEnvio: [], pickup: [] } }
                        : mode === "free"
                          ? {
                              json: {
                                ...quote,
                                opcionesEnvio: [
                                  {
                                    ...rate,
                                    gratis: true,
                                    costo: "0.00",
                                    diasEntregaEstimados: null,
                                  },
                                ],
                              },
                            }
                          : { json: quote };
        return route.fulfill(options).catch(() => {});
      });
      await page.goto(`${base}${productPath}`, { waitUntil: "domcontentloaded" });
      const region = page.getByRole("region", { name: "¿Cuándo llega?", exact: true });
      await expect(region).toBeVisible();
      const cp = region.getByLabel("Código postal", { exact: true });
      const state = region.getByLabel("Estado (opcional)", { exact: true });
      const calculate = () => region.getByRole("button", { name: "Calcular", exact: true });
      const fill = async () => {
        await cp.fill("06000");
        await state.fill("Ciudad de México");
      };
      return { page, f, region, cp, state, calculate, fill };
    };
    stage = "leading zero, encoded destination, honest estimate, amount and ETA";
    let t = await setup();
    await t.fill();
    await t.calculate().click();
    await expect(t.region).toContainText("$75.00");
    await expect(t.region).toContainText("2 días estimados");
    assert.equal(t.f.reads[0].cp, "06000");
    assert.equal(t.f.reads[0].estado, "Ciudad de México");
    assert.equal(t.f.writes, 0);
    assert.deepEqual(t.f.errors, []);
    pass();
    stage =
      "editing destination removes an old free quote immediately; returning to it does not revive the result";
    t = await setup();
    await t.fill();
    t.f.mode = "free";
    await t.calculate().click();
    await expect(t.region.getByText("Gratis", { exact: true })).toBeVisible();
    await t.cp.fill("07000");
    await expect(t.region.getByText("Gratis", { exact: true })).toHaveCount(0);
    await t.cp.fill("06000");
    await expect(t.region.getByText("Gratis", { exact: true })).toHaveCount(0);
    await t.calculate().click();
    await expect(t.region.getByText("Gratis", { exact: true })).toBeVisible();
    await t.state.fill("Puebla");
    await expect(t.region.getByText("Gratis", { exact: true })).toHaveCount(0);
    pass();
    stage =
      "double submit makes one request; edits cancel it and late answers cannot replace the new destination";
    t = await setup();
    await t.fill();
    t.f.mode = "delayed";
    await t.calculate().evaluate((b) => {
      b.click();
      b.click();
    });
    await expect.poll(() => t.f.reads.length).toBe(1);
    await expect(t.region.getByRole("button", { name: "Calculando…" })).toBeDisabled();
    await t.cp.fill("07000");
    await expect(t.calculate()).toBeEnabled();
    const release = t.f.release;
    t.f.mode = "free";
    await t.calculate().click();
    await expect(t.region.getByText("Gratis", { exact: true })).toBeVisible();
    release();
    await t.page.waitForTimeout(200);
    await expect(t.region).not.toContainText("$75.00");
    await expect(t.region).toContainText("CP 07000");
    assert.equal(t.f.reads.length, 2);
    pass();
    stage = "invalid postal code is explained locally without a request";
    t = await setup();
    await t.cp.fill("1234");
    await t.calculate().click();
    await expect(t.region.getByRole("alert")).toContainText("código postal");
    assert.equal(t.f.reads.length, 0);
    pass();
    stage = "optional state may be omitted and Enter submits only the current postal code";
    t = await setup();
    await t.cp.fill("06000");
    await t.cp.press("Enter");
    await expect(t.region).toContainText("$75.00");
    assert.equal("estado" in t.f.reads[0], false);
    pass();
    for (const mode of [
      "error",
      "limited",
      "malformed",
      "invalid",
      "false-free",
      "missing",
      "network",
      "timeout",
    ]) {
      stage = `${mode}: recoverable service error never presented as free shipping or missing coverage`;
      t = await setup();
      await t.fill();
      t.f.mode = mode;
      if (mode === "timeout")
        await t.page.evaluate(() => {
          window.qaFastDeadline = true;
        });
      await t.calculate().click();
      await expect(t.region.getByRole("alert")).toBeVisible();
      await expect(t.calculate()).toBeEnabled();
      await expect(t.region).not.toContainText("No tenemos cobertura");
      await expect(t.region).not.toContainText("PRIVATE");
      await expect(t.region.getByText("Gratis", { exact: true })).toHaveCount(0);
      t.f.mode = "standard";
      await t.page.evaluate(() => {
        window.qaFastDeadline = false;
      });
      await t.calculate().click();
      await expect(t.region).toContainText("$75.00");
      await expect(t.region.getByRole("alert")).toHaveCount(0);
      assert.equal(t.f.writes, 0);
      assert.deepEqual(t.f.errors, []);
      pass();
    }
    stage = "genuine empty coverage stays distinct from errors";
    t = await setup();
    await t.fill();
    t.f.mode = "empty";
    await t.calculate().click();
    await expect(t.region).toContainText("No tenemos cobertura");
    await expect(t.region.getByRole("alert")).toHaveCount(0);
    pass();
    if (!published) {
      stage = "a changed product amount invalidates the quote and cancels pending results";
      t = await setup();
      await t.fill();
      t.f.mode = "free";
      await t.calculate().click();
      await expect(t.region.getByText("Gratis", { exact: true })).toBeVisible();
      await t.page.evaluate(() => window.setAmount(50));
      await expect(t.region.getByText("Gratis", { exact: true })).toHaveCount(0);
      await t.page.evaluate(() => window.setAmount(100));
      await expect(t.region.getByText("Gratis", { exact: true })).toHaveCount(0);
      t.f.mode = "delayed";
      await t.calculate().click();
      await expect.poll(() => t.f.reads.length).toBe(2);
      await t.page.evaluate(() => window.setAmount(25));
      t.f.release();
      await t.page.waitForTimeout(200);
      await expect(t.region.getByText("Gratis", { exact: true })).toHaveCount(0);
      await expect(t.region).not.toContainText("$75.00");
      pass();
      stage = "unmounted estimates ignore late responses";
      t = await setup();
      await t.fill();
      t.f.mode = "delayed";
      await t.calculate().click();
      await expect.poll(() => t.f.reads.length).toBe(1);
      await t.page.evaluate(() => window.unmountEstimate());
      t.f.release();
      await t.page.waitForTimeout(200);
      assert.deepEqual(t.f.errors, []);
      pass();
    }
    stage = "selected quantity updates the estimate amount and invalidates the previous quote";
    t = await setup();
    await t.fill();
    await t.calculate().click();
    await expect(t.region).toContainText("$75.00");
    const qty = t.page.getByLabel("Cantidad", { exact: true });
    await qty.fill("2");
    await expect(t.region).not.toContainText("$75.00");
    await t.calculate().click();
    await expect(t.region).toContainText("$75.00");
    assert.equal(Number(t.f.reads[1].subtotal), Number(t.f.reads[0].subtotal) * 2);
    await qty.fill("0");
    await expect(t.region).not.toContainText("$75.00");
    await t.calculate().click();
    await expect(t.region.getByRole("alert")).toContainText("cantidad");
    assert.equal(t.f.reads.length, 2);
    pass();
    if (!published) {
      stage = "selected variant uses its own price and a 44px selector";
      t = await setup();
      await t.fill();
      await t.calculate().click();
      await expect(t.region).toContainText("$75.00");
      const large = t.page.getByRole("button", { name: "Grande", exact: true });
      await large.click();
      await expect(t.region).not.toContainText("$75.00");
      await t.calculate().click();
      await expect(t.region).toContainText("$75.00");
      assert.equal(t.f.reads[1].subtotal, "200");
      assert((await large.boundingBox()).height >= 44);
      pass();
    }
    stage = "320px layout, accessible feedback, 44px inputs and submit control";
    t = await setup();
    await t.page.setViewportSize({ width: 320, height: 700 });
    await t.fill();
    await t.calculate().click();
    await expect(t.region).toContainText("$75.00");
    assert(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const control of [t.cp, t.state, t.calculate()])
      assert((await control.boundingBox()).height >= 44);
    if (!published)
      await t.page.screenshot({ path: "/tmp/gaes-shipping-estimate.png", fullPage: true });
    assert.equal(t.f.writes, 0);
    assert.deepEqual(t.f.errors, []);
    pass();
    if (published) {
      for (const kind of ["pickup", "delivery"]) {
        stage = `checkout ${kind} timeout shows a manual retry and keeps the cart`;
        if (context) await context.close();
        context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          serviceWorkers: "block",
        });
        await context.addInitScript(() => {
          localStorage.setItem(
            "gaespos_carrito",
            JSON.stringify([
              {
                varianteId: "qa-shipping-local",
                titulo: "Producto QA",
                precio: "100.00",
                cantidad: 1,
              },
            ]),
          );
          const timeout = AbortSignal.timeout.bind(AbortSignal);
          AbortSignal.timeout = (ms) => timeout(ms === 20000 ? 600 : ms);
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const f = { hang: true, writes: 0, errors: [] };
        page.on("pageerror", (e) => f.errors.push(e.message));
        await page.route("**/api/**", async (route) => {
          const req = route.request();
          if (req.method() !== "GET") {
            f.writes++;
            return route.abort();
          }
          const url = new URL(req.url());
          if (url.pathname === "/api/checkout/session")
            return route.fulfill({
              json: { context: "qa-shipping-context", guestContext: "qa-shipping-context" },
            });
          if (url.pathname === "/api/tienda-config")
            return route.fulfill({
              json: {
                msiHabilitado: false,
                msiMeses: [],
                msiMontoMinimo: "0",
                cuponEnCheckout: false,
                envioGratisDesde: null,
                metodosPago: ["tarjeta"],
                proveedorPago: null,
              },
            });
          if (url.pathname === "/api/envios") {
            const delivery = url.searchParams.has("cp");
            if (f.hang && ((kind === "delivery" && delivery) || (kind === "pickup" && !delivery)))
              await new Promise((r) => setTimeout(r, 1200));
            return route
              .fulfill({
                json: {
                  opcionesEnvio: [rate],
                  pickup: [
                    { sucursalId: "qa", nombre: "Sucursal QA", tiempoPreparacionPromedioMin: 30 },
                  ],
                },
              })
              .catch(() => {});
          }
          return route.fulfill({ status: 401, json: {} });
        });
        await page.goto(`${base}/checkout`, { waitUntil: "domcontentloaded" });
        await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
        if (kind === "delivery") {
          await page.getByLabel("Estado", { exact: true }).fill("Ciudad de México");
          await page.getByLabel("Código postal", { exact: true }).fill("06000");
          await expect(
            page.getByRole("button", { name: "Reintentar envío", exact: true }),
          ).toBeVisible();
          f.hang = false;
          await page.getByRole("button", { name: "Reintentar envío", exact: true }).click();
          await expect(page.getByRole("radio", { name: /Entrega QA/ })).toBeChecked();
          await expect(
            page.getByRole("button", { name: "Reintentar envío", exact: true }),
          ).toHaveCount(0);
        } else {
          await expect(
            page.getByRole("button", { name: "Reintentar entrega", exact: true }),
          ).toBeVisible();
          f.hang = false;
          await page.getByRole("button", { name: "Reintentar entrega", exact: true }).click();
          await expect(
            page.getByRole("button", { name: "Recoger en tienda", exact: true }),
          ).toBeEnabled();
          await expect(
            page.getByRole("button", { name: "Reintentar entrega", exact: true }),
          ).toHaveCount(0);
        }
        assert.equal(
          await page.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito")).length),
          1,
        );
        assert.equal(f.writes, 0);
        assert.deepEqual(f.errors, []);
        pass();
      }
    }
    if (published) {
      stage = "real BFF quote and invalid input are private read-only responses";
      const invalid = await context.request.get(`${base}/api/envios?cp=bad&subtotal=100`);
      assert.equal(invalid.status(), 400);
      assert.equal(invalid.headers()["cache-control"], "private, no-store");
      const res = await context.request.get(
        `${base}/api/envios?cp=06000&estado=Ciudad%20de%20Mexico&subtotal=100`,
      );
      assert.equal(res.status(), 200);
      assert.equal(res.headers()["cache-control"], "private, no-store");
      const data = await res.json();
      assert(Array.isArray(data.opcionesEnvio));
      assert(Array.isArray(data.pickup));
      assert(
        data.opcionesEnvio.every(
          (r) =>
            Number.isFinite(Number(r.costo)) &&
            Number(r.costo) >= 0 &&
            (!r.gratis || Number(r.costo) === 0),
        ),
      );
      pass();
    }
    console.log(
      `PASS ${groups} ${published ? "published" : "local"} shipping groups; no business writes`,
    );
  } catch (e) {
    console.error(`FAIL ${stage}: ${e.message}`);
    console.error(
      JSON.stringify({ clientErrors: diagnostic?.errors, assetErrors: diagnostic?.assets }),
    );
    process.exitCode = 1;
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    if (server) await new Promise((r) => server.close(r));
  }
})();
