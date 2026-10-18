/** Synthetic shipping/price receipts. Browser-local guest cart only; all remote writes blocked. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const selection = [{ varianteId: "qa-v", titulo: "Producto QA", precio: "12.00", cantidad: 2 }];
const qa = {
  id: "qa-published",
  tituloPublico: "Producto QA con oferta",
  slugSeo: "qa-producto",
  fotosArray: [],
  destacadoHome: false,
  precioPublicoOverride: null,
  precioDesde: "100.00",
  precioPromocion: "90.00",
  enOferta: true,
  descuentoPct: 10,
  stockPublico: 10,
  stockBajo: false,
  envioGratis: true,
  categoriaPublica: null,
  producto: { id: "qa-p", variantes: [{ id: "qa-v", precioBase: "100.00", nombreVariante: null }] },
  unidadMedida: "pza",
};
(async () => {
  let server;
  let browser;
  let context;
  let base = process.env.SHIPPING_QA_URL;
  const published = !!base;
  if (published && new URL(base).origin !== "https://web-tienda-staging.up.railway.app")
    throw Error("Staging only");
  let groups = 0;
  try {
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
          contents: `import {createRoot} from 'react-dom/client';import Carrito from './src/app/carrito/page';import {ProductoCard} from './src/components/producto-card';import {ProductoCompra} from './src/components/producto-compra';const p=${JSON.stringify(qa)};createRoot(document.getElementById('root')).render(location.pathname==='/carrito'?<Carrito/>:<><div style={{width:140}}><ProductoCard p={p}/></div><ProductoCompra variantes={p.producto.variantes} titulo={p.tituloPublico} precioOverride={null} comprarAhora={false} envioGratis={true} msi={{habilitado:false,meses:[],montoMinimo:'0'}}/></>);`,
        },
        bundle: true,
        write: false,
        jsx: "automatic",
        define: { "process.env.NODE_ENV": '"production"' },
        plugins: [
          {
            name: "next-fixtures",
            setup(build) {
              build.onResolve({ filter: /^next\/(link|navigation)$/ }, (a) => ({
                path: a.path,
                namespace: "fixture",
              }));
              build.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
                resolveDir: app,
                loader: "tsx",
                contents:
                  a.path === "next/link"
                    ? "export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}"
                    : "export function useRouter(){return {push:()=>{throw Error('Unexpected navigation')}}};export function usePathname(){return '/'}",
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
          return res.end(fs.readFileSync(process.env.SHIPPING_QA_CSS || "/tmp/gaes-shipping.css"));
        }
        res.end(
          '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>',
        );
      });
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${server.address().port}`;
    }
    browser = await chromium.launch();
    const open = async (threshold, mode = "ok", pathname = "/carrito") => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 320, height: 844 },
        serviceWorkers: "block",
      });
      await context.addInitScript(
        (items) => localStorage.setItem("gaespos_carrito", JSON.stringify(items)),
        selection,
      );
      const p = await context.newPage();
      p.setDefaultTimeout(10000);
      const issues = { errors: [], writes: [] };
      p.on("pageerror", (e) => issues.errors.push(e.message));
      await p.route("**/api/**", async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.pathname === "/api/carrito/verificar")
          return route.fulfill({
            json: {
              items: req.postDataJSON().items.map((i) => ({
                ...i,
                estado: mode === "unavailable" ? "no_publicado" : "publicado",
                precio: mode === "unavailable" ? null : "25.50",
              })),
            },
          });
        if (req.method() !== "GET") {
          issues.writes.push(url.pathname);
          return route.abort();
        }
        if (url.pathname === "/api/tienda-config")
          return route.fulfill({
            status: mode === "config-error" ? 503 : 200,
            json: { envioGratisDesde: threshold },
          });
        if (url.pathname === "/api/catalogo")
          return route.fulfill({ json: { items: [], total: 0 } });
        return published ? route.continue() : route.fulfill({ json: {} });
      });
      await p.goto(base + pathname, { waitUntil: "domcontentloaded" });
      if (pathname === "/carrito")
        await expect(p.getByText("Precios consultados.", { exact: false })).toBeVisible();
      return { p, issues };
    };
    const safe = async (p, issues) => {
      assert.deepEqual(issues.errors, []);
      assert.deepEqual(issues.writes, []);
      assert(
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        "horizontal page overflow",
      );
      assert.deepEqual(
        await p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito"))),
        selection,
      );
    };
    const pass = (name) => {
      console.log(`PASS ${name}`);
      groups++;
    };
    let { p, issues } = await open("100.00");
    await expect(p.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "51");
    await expect(p.getByText("$49.00", { exact: true })).toBeVisible();
    await expect(
      p.getByText("Depende de tu dirección y la tarifa elegida.", { exact: false }),
    ).toBeVisible();
    assert(!(await p.getByText("¡Tienes envío gratis!", { exact: true }).count()));
    await safe(p, issues);
    pass("remaining amount uses verified prices, conditions fit at 320px and cart is unchanged");
    ({ p, issues } = await open("51.01"));
    await expect(p.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "99");
    await expect(p.getByText("$0.01", { exact: true })).toBeVisible();
    await safe(p, issues);
    pass("one cent short never reports 100%");
    for (const threshold of ["51.00", "50.00", "0"]) {
      ({ p, issues } = await open(threshold));
      await expect(p.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
      await expect(
        p.getByText("Alcanzaste el monto de referencia para envío gratis", { exact: true }),
      ).toBeVisible();
      await expect(
        p.getByText("Depende de tu dirección y la tarifa elegida.", { exact: false }),
      ).toBeVisible();
      await safe(p, issues);
      pass(`threshold ${threshold} is advisory, including zero`);
      if (threshold === "50.00")
        await p.screenshot({
          path: `/tmp/gaes-shipping-${published ? "published" : "local"}-320.png`,
          fullPage: true,
        });
    }
    for (const threshold of [null, "NaN", "Infinity", "-1", "", true]) {
      ({ p, issues } = await open(threshold));
      await expect(
        p.getByRole("button", { name: "Continuar compra", exact: false }).first(),
      ).toBeEnabled();
      await expect(p.getByRole("progressbar")).toHaveCount(0);
      await safe(p, issues);
      pass(`invalid or absent threshold ${threshold} makes no shipping claim`);
    }
    ({ p, issues } = await open("50", "unavailable"));
    await expect(p.getByRole("progressbar")).toHaveCount(0);
    await expect(
      p.getByRole("button", { name: "Continuar compra", exact: false }).first(),
    ).toBeDisabled();
    await safe(p, issues);
    pass("unavailable cart never displays a shipping incentive");
    ({ p, issues } = await open("50", "config-error"));
    await expect(
      p.getByRole("button", { name: "Continuar compra", exact: false }).first(),
    ).toBeEnabled();
    await expect(p.getByRole("progressbar")).toHaveCount(0);
    await safe(p, issues);
    pass("failed configuration does not advertise a threshold from an error response");
    if (!published) {
      ({ p, issues } = await open("50", "ok", "/product-fixture"));
      await expect(p.getByText("Envío gratis según zona y tarifa", { exact: true })).toHaveCount(2);
      const card = p.getByRole("article");
      await expect(card.getByText("-10%", { exact: true })).toBeVisible();
      await expect(
        card.getByText("Envío gratis según zona y tarifa", { exact: true }),
      ).toBeVisible();
      assert(await card.evaluate((el) => el.scrollWidth <= el.clientWidth), "narrow card overflow");
      await safe(p, issues);
      await p.screenshot({ path: "/tmp/gaes-shipping-products-320.png", fullPage: true });
      pass(
        "140px offer card and product purchase show visible shipping conditions without overlap",
      );
    }
    console.log(
      JSON.stringify({
        mode: published
          ? "published staging with synthetic receipts"
          : "local real components with synthetic receipts",
        groups,
        remoteWrites: 0,
      }),
    );
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    if (server) await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
