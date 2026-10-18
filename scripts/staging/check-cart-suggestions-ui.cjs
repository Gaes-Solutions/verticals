/** Read-only price checks and a browser-local guest cart only. No orders or notifications. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const old = [
  {
    varianteId: "v-current",
    titulo: "Producto actual",
    precio: "12.00",
    cantidad: 2,
    imagenUrl: "/broken-a.png",
  },
];
const product = (id, variants = [`v-${id}`], patch = {}) => ({
  id,
  tituloPublico: `Producto ${id}`,
  slugSeo: `producto-${id}`,
  fotosArray: ["/tienda/imagenes/broken-b"],
  precioDesde: "25.50",
  enOferta: false,
  precioPromocion: null,
  stockPublico: null,
  producto: { variantes: variants.map((id) => ({ id, precioBase: "25.50" })) },
  ...patch,
});
const catalog = {
  items: [
    product("one"),
    product("multi", ["m1", "m2"]),
    product("exhausted", undefined, { stockPublico: 0 }),
    product("invalid", undefined, { precioDesde: "NaN" }),
    product("current", ["other", "v-current"]),
  ],
};
let stage = "setup";
(async () => {
  let server;
  let base = process.env.SUGGESTIONS_QA_URL;
  const published = !!base;
  if (published && new URL(base).hostname !== "web-tienda-staging.up.railway.app")
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
        contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {SugerenciasCarrito} from './src/components/sugerencias-carrito';import {ImagenCompra} from './src/components/imagen-compra';import {CarritoFlotante} from './src/components/carrito-flotante';const root=createRoot(document.getElementById('root'));window.unmountSuggestions=()=>root.unmount();function QA(){const [src,setSrc]=useState('/broken-a.png');window.changeImage=setSrc;return <><div style={{width:64,height:64}}><ImagenCompra src={src} alt='Imagen QA'/></div><SugerenciasCarrito/><CarritoFlotante/></>};root.render(<QA/>);`,
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
              resolveDir: app,
              loader: "tsx",
              contents:
                args.path === "next/link"
                  ? "export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}"
                  : "export function usePathname(){return '/producto/qa'}",
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
        return res.end(
          process.env.SUGGESTIONS_QA_CSS ? fs.readFileSync(process.env.SUGGESTIONS_QA_CSS) : "",
        );
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
  try {
    const pass = () => {
      groups++;
      console.log(`PASS ${stage}`);
    };
    const section = (p) => p.locator('section[aria-labelledby="sugerencias-titulo"]');
    const cart = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito")));
    const setup = async (mode = "ok", url = "/carrito") => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      await context.addInitScript(
        ({ old }) => {
          localStorage.setItem("gaespos_carrito", JSON.stringify(old));
          const timeout = AbortSignal.timeout.bind(AbortSignal);
          AbortSignal.timeout = (ms) => timeout(ms === 15000 ? 600 : ms);
        },
        { old },
      );
      const p = await context.newPage();
      p.setDefaultTimeout(8000);
      const f = { mode, gets: 0, errors: [], unexpected: [], release: null };
      p.on("pageerror", (e) => f.errors.push(e.message));
      await p.route("**/broken-*.png", (r) => r.fulfill({ status: 404, body: "" }));
      await p.route("**/tienda/imagenes/broken-b", (r) => r.fulfill({ status: 404, body: "" }));
      await p.route("**/good.png", (r) =>
        r.fulfill({
          status: 200,
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="green"/></svg>',
        }),
      );
      await p.route("**/api/**", async (r) => {
        const req = r.request();
        const pathname = new URL(req.url()).pathname;
        if (pathname === "/api/carrito/verificar")
          return r.fulfill({
            status: 200,
            json: {
              items: req
                .postDataJSON()
                .items.map((i) => ({ ...i, precio: "12.00", estado: "publicado" })),
            },
          });
        if (req.method() !== "GET") {
          f.unexpected.push(pathname);
          return r.abort();
        }
        if (pathname === "/api/tienda-config")
          return r.fulfill({ status: 200, json: { envioGratisDesde: null } });
        if (pathname !== "/api/catalogo") return r.continue();
        f.gets++;
        if (f.mode === "real") return r.continue();
        if (f.mode === "hold")
          await new Promise((resolve) => {
            f.release = resolve;
          });
        if (f.mode === "network") return r.abort();
        if (f.mode === "timeout") {
          await new Promise((resolve) => setTimeout(resolve, 950));
          return r.fulfill({ status: 200, json: catalog }).catch(() => {});
        }
        if (f.mode === "503") return r.fulfill({ status: 503, json: { message: "PRIVATE" } });
        if (f.mode === "json") return r.fulfill({ status: 200, body: "{bad" });
        return r.fulfill({
          status: 200,
          json:
            f.mode === "empty" ? { items: [] } : f.mode === "malformed" ? { items: null } : catalog,
        });
      });
      await p.goto(`${base}${url}`, { waitUntil: "domcontentloaded" });
      return { p, f };
    };
    const ready = async (p) =>
      expect(
        section(p).getByRole("button", { name: "Agregar Producto one", exact: true }),
      ).toBeVisible();
    const safe = (f) => {
      assert.deepEqual(f.errors, []);
      assert.deepEqual(f.unexpected, []);
    };
    stage = "suggestions omit exhausted, invalid and every variant already in the cart";
    let { p, f } = await setup();
    await ready(p);
    assert.equal(await section(p).getByText("Producto exhausted", { exact: true }).count(), 0);
    assert.equal(await section(p).getByText("Producto invalid", { exact: true }).count(), 0);
    assert.equal(await section(p).getByText("Producto current", { exact: true }).count(), 0);
    assert.deepEqual(await cart(p), old);
    safe(f);
    pass();
    stage = "multi-variant recommendation links to selection and never guesses an option";
    assert.equal(
      await section(p).getByRole("button", { name: "Agregar Producto multi", exact: true }).count(),
      0,
    );
    await expect(
      section(p).getByRole("link", { name: "Elegir opciones →", exact: true }),
    ).toHaveAttribute("href", "/producto/producto-multi");
    assert.deepEqual(await cart(p), old);
    safe(f);
    pass();
    stage = "double quick-add inserts exactly one unit with image and product link metadata";
    await section(p)
      .getByRole("button", { name: "Agregar Producto one", exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await expect
      .poll(async () => (await cart(p)).find((i) => i.varianteId === "v-one")?.cantidad)
      .toBe(1);
    await expect(
      section(p).getByRole("button", { name: "Agregar Producto one", exact: true }),
    ).toHaveCount(0);
    assert.equal((await cart(p)).find((i) => i.varianteId === "v-one").slugSeo, "producto-one");
    safe(f);
    pass();
    stage = "unchanged cart synchronization does not flicker or refetch recommendations";
    ({ p, f } = await setup());
    await ready(p);
    const count = f.gets;
    await p.evaluate(() => {
      for (let n = 0; n < 3; n++) window.dispatchEvent(new Event("carrito-actualizado"));
    });
    await p.waitForTimeout(400);
    assert.equal(f.gets, count);
    await ready(p);
    safe(f);
    pass();
    for (const mode of ["network", "timeout", "503", "json", "malformed", "empty"]) {
      stage = `${mode} refresh removes previous suggestions without affecting the cart`;
      ({ p, f } = await setup());
      await ready(p);
      f.mode = mode;
      await p.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(section(p)).toHaveCount(0);
      await expect.poll(() => f.gets).toBe(2);
      await p.waitForTimeout(mode === "timeout" ? 750 : 100);
      assert.deepEqual(await cart(p), old);
      safe(f);
      pass();
    }
    stage = "old button cannot add after an account context event in the same tick";
    ({ p, f } = await setup());
    await ready(p);
    f.mode = "hold";
    await section(p)
      .getByRole("button", { name: "Agregar Producto one", exact: true })
      .evaluate((el) => {
        window.dispatchEvent(new Event("carrito-contexto-cambiado"));
        el.click();
      });
    assert.deepEqual(await cart(p), old);
    await expect(section(p)).toHaveCount(0);
    await expect.poll(() => typeof f.release).toBe("function");
    f.mode = "ok";
    f.release();
    await ready(p);
    safe(f);
    pass();
    stage = "another tab adding a recommended variant is checked again at click time";
    await section(p)
      .getByRole("button", { name: "Agregar Producto one", exact: true })
      .evaluate((el) => {
        const items = JSON.parse(localStorage.getItem("gaespos_carrito"));
        items.push({ varianteId: "v-one", titulo: "Otra selección", precio: "1", cantidad: 3 });
        localStorage.setItem("gaespos_carrito", JSON.stringify(items));
        el.click();
      });
    assert.equal((await cart(p)).find((i) => i.varianteId === "v-one").cantidad, 3);
    safe(f);
    pass();
    stage = "storage write failure does not announce an addition";
    ({ p, f } = await setup());
    await ready(p);
    await p.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "gaespos_carrito") throw Error("storage unavailable");
        return set.call(this, key, value);
      };
    });
    await section(p).getByRole("button", { name: "Agregar Producto one", exact: true }).click();
    await expect(section(p).getByRole("alert")).toContainText("No pudimos confirmar");
    assert.deepEqual(await cart(p), old);
    safe(f);
    pass();
    if (!published) {
      stage = "late catalog from a previous context cannot revive old suggestions";
      ({ p, f } = await setup("hold"));
      await expect.poll(() => typeof f.release).toBe("function");
      const release = f.release;
      f.mode = "empty";
      await p.evaluate(() => window.dispatchEvent(new Event("carrito-contexto-cambiado")));
      await expect.poll(() => f.gets).toBe(2);
      release();
      await p.waitForTimeout(100);
      await expect(section(p)).toHaveCount(0);
      safe(f);
      pass();
      stage = "unmount aborts the catalog request without writing the cart";
      ({ p, f } = await setup("hold"));
      await expect.poll(() => typeof f.release).toBe("function");
      await p.evaluate(() => window.unmountSuggestions());
      f.release();
      await p.waitForTimeout(100);
      assert.deepEqual(await cart(p), old);
      safe(f);
      pass();
      stage = "a broken image can recover when its URL changes";
      ({ p, f } = await setup());
      await expect(
        p.getByRole("img", { name: "Imagen no disponible: Imagen QA", exact: true }),
      ).toBeVisible();
      await p.evaluate(() => window.changeImage("/good.png"));
      await expect(p.getByRole("img", { name: "Imagen QA", exact: true })).toBeVisible();
      assert.equal(
        await p
          .getByRole("img", { name: "Imagen QA", exact: true })
          .evaluate((el) => el.complete && el.naturalWidth > 0),
        true,
      );
      safe(f);
      pass();
    }
    stage = "broken recommendation images have named fallbacks and 44px quick-add targets";
    ({ p, f } = await setup());
    await ready(p);
    await expect(
      section(p).getByRole("img", { name: "Imagen no disponible: Producto one", exact: true }),
    ).toBeVisible();
    assert.ok(
      (
        await section(p)
          .getByRole("button", { name: "Agregar Producto one", exact: true })
          .boundingBox()
      ).height >= 44,
    );
    safe(f);
    pass();
    stage = "320px suggestions do not overflow or shift when images fail";
    await p.setViewportSize({ width: 320, height: 740 });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await p.screenshot({
      path: `/tmp/gaes-cart-suggestions-${published ? "published" : "local"}.png`,
      fullPage: true,
    });
    safe(f);
    pass();
    if (published) {
      stage = "published cart retains image space and a named fallback for a saved broken URL";
      await expect(
        p.getByRole("img", { name: "Imagen no disponible: Producto actual", exact: true }),
      ).toBeVisible();
      safe(f);
      pass();
      stage = "published floating cart also replaces a broken thumbnail";
      ({ p, f } = await setup("empty", "/producto/demo-lampara"));
      await expect(p.locator(".store-cart-preview")).toBeVisible();
      await expect(p.locator(".store-cart-preview img")).toHaveCount(0);
      await expect(p.locator(".store-cart-preview svg")).toBeVisible();
      safe(f);
      pass();
      stage = "published suggestions accept the real public catalog without mutating a cart";
      f.mode = "real";
      await p.goto(`${base}/carrito`, { waitUntil: "domcontentloaded" });
      await expect(section(p)).toBeVisible();
      assert.ok((await section(p).locator("a").count()) > 0);
      assert.deepEqual(await cart(p), old);
      safe(f);
      pass();
    }
    console.log(
      `PASS ${groups} ${published ? "published" : "local"} suggestion/image groups; no remote cart writes, orders or email`,
    );
  } catch (e) {
    throw Error(`${stage}: ${e.message}`);
  } finally {
    if (context) await context.close();
    await browser.close();
    if (server) await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
