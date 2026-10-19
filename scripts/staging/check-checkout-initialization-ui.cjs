/** Real checkout locally or on fixed staging, synthetic account/shipping responses; no orders or real writes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
let stage = "setup";
(async () => {
  let server;
  let base = process.env.CHECKOUT_INIT_QA_URL;
  const published = !!base;
  if (published && base !== "https://web-tienda-staging.up.railway.app")
    throw Error("Staging only");
  if (!base) {
    const app = path.join(process.cwd(), "apps/web-tienda");
    const esbuild = require(
      require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
    );
    const bundle = await esbuild.build({
      absWorkingDir: app,
      stdin: {
        resolveDir: app,
        loader: "tsx",
        contents: `import {createRoot} from 'react-dom/client';import Checkout from './src/app/checkout/page';createRoot(document.getElementById('root')).render(<Checkout/>);`,
      },
      bundle: true,
      write: false,
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [
        {
          name: "navigation",
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
                  : "export function useRouter(){return {push:(url)=>{window.qaPushes=(window.qaPushes||[]).concat(url)}}}",
            }));
          },
        },
      ],
    });
    server = http.createServer((req, res) => {
      if (req.url === "/bundle.js") {
        res.setHeader("Content-Type", "application/javascript");
        return res.end(bundle.outputFiles[0].contents);
      }
      if (req.url === "/styles.css") {
        res.setHeader("Content-Type", "text/css");
        return res.end(fs.readFileSync("/tmp/gaes-audit-storefront.css"));
      }
      res.end(
        '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>',
      );
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const browser = await chromium.launch();
  let context;
  let groups = 0;
  const row = { varianteId: "qa-one", titulo: "Producto QA", precio: "100.00", cantidad: 1 };
  const config = {
    msiHabilitado: false,
    msiMeses: [],
    msiMontoMinimo: "0",
    cuponEnCheckout: false,
    envioGratisDesde: null,
    metodosPago: [],
    proveedorPago: null,
  };
  const shipping = {
    opcionesEnvio: [
      {
        tarifaId: "qa-tarifa",
        nombrePublico: "Envío QA",
        paqueteria: "QA",
        costo: "25.00",
        gratis: false,
        diasEntregaEstimados: 2,
      },
    ],
    pickup: [{ sucursalId: "qa-pickup", nombre: "Sucursal QA", tiempoPreparacionPromedioMin: 20 }],
  };
  try {
    const setup = async (mode = "ok") => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 320, height: 844 },
        serviceWorkers: "block",
      });
      await context.addInitScript(
        ({ row, mode }) => {
          localStorage.setItem("gaespos_carrito", JSON.stringify([row]));
          window.failCart = mode === "read";
          const get = Storage.prototype.getItem;
          Storage.prototype.getItem = function (k) {
            if (window.failCart && k === "gaespos_carrito") throw Error("PRIVATE_STORAGE_READ");
            return get.call(this, k);
          };
          const timeout = AbortSignal.timeout.bind(AbortSignal);
          AbortSignal.timeout = (ms) => timeout(ms === 20000 ? 700 : ms);
        },
        { row, mode },
      );
      const p = await context.newPage();
      p.setDefaultTimeout(7000);
      const f = { mode, errors: [], writes: [], configGets: 0 };
      p.on("pageerror", (e) => f.errors.push(e.message));
      await p.route("**/api/**", async (r) => {
        const u = new URL(r.request().url());
        if (r.request().method() !== "GET") {
          f.writes.push(u.pathname);
          return r.abort();
        }
        if (u.pathname === "/api/checkout/session") {
          if (f.mode === "unauthorized")
            return r.fulfill({ status: 401, contentType: "text/html", body: "PRIVATE_PROXY" });
          if (f.mode === "session-error")
            return r.fulfill({ status: 503, json: { message: "PRIVATE_DB_DETAILS" } });
          return r.fulfill({ json: { context: "qa-checkout-owner" } });
        }
        if (u.pathname === "/api/tienda-config") {
          f.configGets++;
          if (f.mode === "network") return r.abort();
          if (f.mode === "timeout") {
            await new Promise((x) => setTimeout(x, 1200));
            return r.fulfill({ json: config }).catch(() => {});
          }
          if (f.mode === "json") return r.fulfill({ contentType: "application/json", body: "{" });
          if (f.mode === "config-shape")
            return r.fulfill({ json: { ...config, msiMeses: null, metodosPago: "tarjeta" } });
          return r.fulfill({ json: config });
        }
        if (u.pathname === "/api/envios")
          return r.fulfill({
            json: f.mode === "shipping" ? { opcionesEnvio: [null], pickup: [null] } : shipping,
          });
        if (u.pathname === "/api/cuenta/medios-pago")
          return r.fulfill({ json: f.mode === "cards" ? [null] : [] });
        if (u.pathname === "/api/cuenta/direcciones")
          return r.fulfill({ json: f.mode === "addresses" ? [null] : [] });
        if (u.pathname === "/api/cuenta/me")
          return r.fulfill({
            status: f.mode === "profile" ? 200 : 401,
            json: f.mode === "profile" ? { nombre: { internal: "bad" }, email: [] } : {},
          });
        if (u.pathname === "/api/checkout")
          return r.fulfill({
            status: 404,
            json: { safeToRetry: true, code: "CHECKOUT_NOT_FOUND" },
          });
        if (published) return r.continue();
        throw Error(`Unexpected fixture path ${u.pathname}`);
      });
      await p.goto(`${base}${published ? "/checkout" : "/"}`, { waitUntil: "domcontentloaded" });
      return { p, f };
    };
    const safe = async (p, f) => {
      assert.deepEqual(f.errors, []);
      assert.deepEqual(f.writes, []);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(!(await p.getByText("PRIVATE", { exact: false }).count()));
    };
    const ready = async (p) => {
      await expect(p.getByRole("heading", { name: "Finalizar compra", exact: true })).toBeVisible();
      await p.getByLabel("Email", { exact: true }).fill("qa@example.invalid");
      await p.getByLabel("Nombre completo", { exact: true }).fill("Persona QA");
    };
    const _pay = (p) =>
      p.getByRole("button", { name: "Confirmar pedido · Pagar al recoger", exact: true });
    const pass = () => {
      groups++;
      console.log(`PASS ${stage}`);
    };
    stage = "denied cart read offers recovery rather than an empty cart or a crashed checkout";
    let { p, f } = await setup("read");
    await expect(
      p.getByRole("button", { name: "Volver a leer carrito", exact: true }),
    ).toBeVisible();
    await expect(
      p.getByRole("heading", { name: "Tu carrito está vacío", exact: true }),
    ).toHaveCount(0);
    await p.evaluate(() => {
      window.failCart = false;
    });
    await p.getByRole("button", { name: "Volver a leer carrito", exact: true }).click();
    await ready(p);
    await safe(p, f);
    pass();
    stage = "a later storage read failure preserves entered contact fields after recovery";
    await p.evaluate(() => {
      window.failCart = true;
      dispatchEvent(new Event("carrito-actualizado"));
    });
    await expect(
      p.getByRole("button", { name: "Volver a leer carrito", exact: true }),
    ).toBeVisible();
    await p.evaluate(() => {
      window.failCart = false;
    });
    await p.getByRole("button", { name: "Volver a leer carrito", exact: true }).click();
    await expect(p.getByLabel("Nombre completo", { exact: true })).toHaveValue("Persona QA");
    await safe(p, f);
    pass();
    for (const mode of ["network", "timeout", "json", "config-shape"]) {
      stage = `${mode} configuration is recoverable and does not discard customer fields`;
      ({ p, f } = await setup(mode));
      await ready(p);
      await expect(
        p.getByRole("button", { name: "Volver a consultar opciones de pago", exact: true }),
      ).toBeVisible();
      f.mode = "ok";
      await p
        .getByRole("button", { name: "Volver a consultar opciones de pago", exact: true })
        .click();
      await expect(
        p.getByRole("button", { name: "Volver a consultar opciones de pago", exact: true }),
      ).toHaveCount(0);
      await expect(p.getByLabel("Nombre completo", { exact: true })).toHaveValue("Persona QA");
      await expect(p.getByRole("button", { name: "Recoger en tienda", exact: true })).toBeVisible();
      await safe(p, f);
      pass();
    }
    for (const mode of ["cards", "addresses", "profile"]) {
      stage = `${mode} malformed optional data cannot crash or corrupt checkout`;
      ({ p, f } = await setup(mode));
      await ready(p);
      await expect(p.getByRole("button", { name: "Recoger en tienda", exact: true })).toBeVisible();
      await safe(p, f);
      pass();
    }
    stage = "malformed delivery responses cannot enable a free or invalid delivery";
    ({ p, f } = await setup("shipping"));
    await ready(p);
    await expect(
      p.getByRole("alert").filter({ hasText: "No se pudieron consultar las sucursales" }),
    ).toBeVisible();
    await expect(p.getByRole("button", { name: "Recoger en tienda", exact: true })).toHaveCount(0);
    await safe(p, f);
    pass();
    stage = "an HTML 401 still leads to login rather than a retry loop";
    ({ p, f } = await setup("unauthorized"));
    await expect(
      p.getByRole("link", { name: "Iniciar sesión para continuar", exact: true }),
    ).toBeVisible();
    await safe(p, f);
    pass();
    stage = "initial session errors never expose server diagnostics";
    ({ p, f } = await setup("session-error"));
    await expect(p.getByRole("button", { name: "Reintentar", exact: true })).toBeVisible();
    await safe(p, f);
    pass();
    stage = "silent cart edits immediately before payment require a new review without submitting";
    ({ p, f } = await setup());
    await ready(p);
    await p.getByRole("button", { name: "Recoger en tienda", exact: true }).click();
    const submit = p.getByRole("button", {
      name: /Confirmar pedido|Apartar pedido|Reservar pedido/,
    });
    await expect(submit).toBeEnabled();
    await p.evaluate(
      (row) => localStorage.setItem("gaespos_carrito", JSON.stringify([{ ...row, cantidad: 2 }])),
      row,
    );
    await submit.click();
    await expect(p.getByRole("alert").filter({ hasText: "Tu carrito cambió" })).toBeVisible();
    assert.equal(
      await p.evaluate(
        () => JSON.parse(localStorage.getItem("gaespos_checkout_attempt_v1")).submitted,
      ),
      false,
    );
    await safe(p, f);
    pass();
    console.log(
      JSON.stringify({
        groups,
        realWrites: 0,
        orders: 0,
        fixtures: "real checkout with synthetic account, configuration and shipping",
        published,
      }),
    );
  } catch (e) {
    console.error(`FAIL ${stage}`, e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    if (server) await new Promise((r) => server.close(r));
  }
})();
