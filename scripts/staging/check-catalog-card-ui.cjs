/** Read-only price checks and a browser-local guest cart only. No orders or notifications. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const qa = {
  id: "qa-card",
  tituloPublico: "Producto QA",
  slugSeo: "producto-qa",
  fotosArray: ["/broken-card.png"],
  destacadoHome: false,
  precioPublicoOverride: null,
  precioDesde: "12.00",
  precioPromocion: null,
  enOferta: false,
  descuentoPct: 0,
  stockPublico: 10,
  stockBajo: false,
  envioGratis: false,
  categoriaPublica: null,
  producto: { id: "qa-p", variantes: [{ id: "qa-v", precioBase: "12.00" }] },
  unidadMedida: "pza",
};
let stage = "setup";
(async () => {
  let server;
  let base = process.env.CARD_QA_URL;
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
        contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {ProductoCard} from './src/components/producto-card';import {configurarCarrito} from './src/lib/carrito-store';const root=createRoot(document.getElementById('root'));window.unmountCard=()=>root.unmount();window.switchOwner=owner=>configurarCarrito(owner,null);function QA(){const [p,setP]=useState(${JSON.stringify(qa)});window.changeCard=patch=>setP(old=>({...old,...patch}));return <div style={{width:'100%',maxWidth:300}}><ProductoCard p={p}/></div>};root.render(<QA/>);`,
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
        return res.end(process.env.CARD_QA_CSS ? fs.readFileSync(process.env.CARD_QA_CSS) : "");
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
    let product = qa;
    if (published) {
      const c = await browser.newContext();
      try {
        const r = await c.request.get(`${base}/api/catalogo?pageSize=100`);
        assert.equal(r.status(), 200);
        const data = await r.json();
        product = data.items.find(
          (p) =>
            p.producto.variantes.length === 1 && (p.stockPublico === null || p.stockPublico >= 4),
        );
        assert.ok(
          product,
          "Requires one published single-variant product with hidden stock or at least four public units",
        );
      } finally {
        await c.close();
      }
    }
    const variant = () => product.producto.variantes[0].id;
    const cart = (p) =>
      p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito") || "[]"));
    const article = (p) =>
      p.getByRole("article", { name: product.tituloPublico, exact: true }).first();
    const setup = async (qty = 2, brokenImage = false) => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      const initial = qty
        ? [{ varianteId: variant(), titulo: product.tituloPublico, precio: "12.00", cantidad: qty }]
        : [];
      await context.addInitScript(
        (initial) => localStorage.setItem("gaespos_carrito", JSON.stringify(initial)),
        initial,
      );
      const p = await context.newPage();
      p.setDefaultTimeout(8000);
      const f = { errors: [], writes: [] };
      p.on("pageerror", (e) => f.errors.push(e.message));
      if (published && brokenImage && product.fotosArray[0]) {
        await p.route(new URL(product.fotosArray[0], base).href, (r) =>
          r.fulfill({ status: 404, body: "" }),
        );
      }
      await p.route("**/broken-card.png", (r) => r.fulfill({ status: 404, body: "" }));
      await p.route("**/good-card.png", (r) =>
        r.fulfill({
          status: 200,
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>',
        }),
      );
      await p.route("**/api/**", (r) => {
        if (r.request().method() !== "GET") {
          f.writes.push(new URL(r.request().url()).pathname);
          return r.abort();
        }
        return published ? r.continue() : r.fulfill({ status: 200, json: { items: [], total: 0 } });
      });
      await p.goto(base, { waitUntil: "domcontentloaded" });
      await expect(article(p)).toBeVisible();
      if (qty)
        await expect(
          article(p).getByRole("button", { name: "Quitar uno", exact: true }),
        ).toBeVisible();
      else
        await expect(
          article(p).getByRole("button", { name: "Agregar", exact: true }),
        ).toBeEnabled();
      return { p, f };
    };
    const safe = (f) => {
      assert.deepEqual(f.errors, []);
      assert.deepEqual(f.writes, []);
    };
    const quantity = async (p) =>
      (await cart(p)).find((i) => i.varianteId === variant())?.cantidad ?? 0;
    stage = "two synchronous increments each count against the latest stored quantity";
    let { p, f } = await setup(2);
    await article(p)
      .getByRole("button", { name: "Agregar uno", exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await expect.poll(() => quantity(p)).toBe(4);
    safe(f);
    pass();
    if (published) {
      stage = "every displayed copy of the product stays synchronized across catalog sections";
      for (const copy of await p
        .getByRole("article", { name: product.tituloPublico, exact: true })
        .all()) {
        await expect(copy.locator('fieldset span[aria-live="polite"]')).toHaveText("4");
      }
      safe(f);
      pass();
    }
    stage = "two synchronous decrements each count without stale render quantities";
    await article(p)
      .getByRole("button", { name: "Quitar uno", exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await expect.poll(() => quantity(p)).toBe(2);
    safe(f);
    pass();
    stage = "decrement removes the last unit without recreating the product on a second click";
    ({ p, f } = await setup(1));
    await article(p)
      .getByRole("button", { name: "Quitar uno", exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await expect.poll(() => quantity(p)).toBe(0);
    await expect(article(p).getByRole("button", { name: "Agregar", exact: true })).toBeEnabled();
    safe(f);
    pass();
    stage = "empty-cart click still adds one unit and preserves product metadata";
    await article(p).getByRole("button", { name: "Agregar", exact: true }).click();
    await expect.poll(() => quantity(p)).toBe(1);
    const item = (await cart(p)).find((i) => i.varianteId === variant());
    assert.equal(item.slugSeo, product.slugSeo);
    safe(f);
    pass();
    stage = "keyboard activation increments without requiring a swipe";
    await article(p).getByRole("button", { name: "Agregar uno", exact: true }).focus();
    await p.keyboard.press("Enter");
    await expect.poll(() => quantity(p)).toBe(2);
    safe(f);
    pass();
    stage = "a storage write failure reports the error and leaves the quantity unchanged";
    ({ p, f } = await setup(2));
    await p.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "gaespos_carrito") throw Error("unavailable");
        return set.call(this, key, value);
      };
    });
    await article(p).getByRole("button", { name: "Agregar uno", exact: true }).click();
    await expect(article(p).getByRole("alert")).toContainText("No pudimos confirmar");
    assert.equal(await quantity(p), 2);
    safe(f);
    pass();
    stage =
      "recovering storage reads clears the stale read error and re-enables the original quantity";
    ({ p, f } = await setup(2));
    await p.evaluate(() => {
      window.restoreGet = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k) {
        if (k === "gaespos_carrito") throw Error("PRIVATE_READ");
        return window.restoreGet.call(this, k);
      };
      window.dispatchEvent(new Event("carrito-actualizado"));
    });
    await expect(article(p).getByRole("alert")).toContainText("No pudimos leer");
    await p.evaluate(() => {
      Storage.prototype.getItem = window.restoreGet;
      window.dispatchEvent(new Event("carrito-actualizado"));
    });
    await expect(article(p).getByRole("alert")).toHaveCount(0);
    await expect(
      article(p).getByRole("button", { name: "Agregar uno", exact: true }),
    ).toBeEnabled();
    assert.equal(await quantity(p), 2);
    safe(f);
    pass();
    stage = "a context event rejects an already captured control before the new render";
    ({ p, f } = await setup(2));
    await article(p)
      .getByRole("button", { name: "Agregar uno", exact: true })
      .evaluate((el) => {
        window.dispatchEvent(new Event("carrito-contexto-cambiado"));
        el.click();
      });
    assert.equal(await quantity(p), 2);
    safe(f);
    pass();
    stage = "cart changes from another tab are read again instead of overwritten";
    await article(p)
      .getByRole("button", { name: "Quitar uno", exact: true })
      .evaluate((el) => {
        const data = JSON.parse(localStorage.getItem("gaespos_carrito"));
        data[0].cantidad = 7;
        localStorage.setItem("gaespos_carrito", JSON.stringify(data));
        el.click();
      });
    await expect.poll(() => quantity(p)).toBe(6);
    safe(f);
    pass();
    if (!published) {
      stage = "a swipe started before switching accounts cannot add into the next account";
      ({ p, f } = await setup(0));
      const start = await article(p)
        .getByRole("button", { name: "Agregar", exact: true })
        .boundingBox();
      await p.mouse.move(start.x + 12, start.y + start.height / 2);
      await p.mouse.down();
      await p.mouse.move(start.x + start.width - 10, start.y + start.height / 2, { steps: 4 });
      await p.evaluate(() => window.switchOwner("qa-second-account"));
      await expect(article(p).getByRole("button", { name: "Agregar", exact: true })).toBeEnabled();
      await p.mouse.up();
      assert.deepEqual(
        await p.evaluate(() =>
          JSON.parse(localStorage.getItem("gaespos_carrito_cuenta:qa-second-account") || "[]"),
        ),
        [],
      );
      assert.deepEqual(await cart(p), []);
      safe(f);
      pass();
      stage = "public cap is enforced on each synchronous click before disabled styling updates";
      ({ p, f } = await setup(2));
      await p.evaluate(() => window.changeCard({ stockPublico: 3 }));
      await article(p)
        .getByRole("button", { name: "Agregar uno", exact: true })
        .evaluate((el) => {
          el.click();
          el.click();
        });
      await expect.poll(() => quantity(p)).toBe(3);
      await expect(
        article(p).getByRole("button", { name: "Agregar uno", exact: true }),
      ).toBeDisabled();
      safe(f);
      pass();
      stage = "fractional stock below one unit cannot be quick-added";
      ({ p, f } = await setup(0));
      await p.evaluate(() => window.changeCard({ stockPublico: 0.5 }));
      await expect(article(p).getByRole("button", { name: "Agotado", exact: true })).toBeDisabled();
      assert.equal(await quantity(p), 0);
      safe(f);
      pass();
      stage = "hidden-stock increment is bounded at 100000 units";
      ({ p, f } = await setup(100000));
      await p.evaluate(() => window.changeCard({ stockPublico: null }));
      await expect(
        article(p).getByRole("button", { name: "Agregar uno", exact: true }),
      ).toBeDisabled();
      assert.equal(await quantity(p), 100000);
      safe(f);
      pass();
      stage = "large quantities wrap inside a narrow card without shrinking touch targets";
      await p.locator("article").evaluate((el) => {
        el.parentElement.style.width = "140px";
      });
      assert.equal(await article(p).evaluate((el) => el.scrollWidth <= el.clientWidth), true);
      for (const label of ["Agregar uno", "Quitar uno"]) {
        const size = await article(p)
          .getByRole("button", { name: label, exact: true })
          .boundingBox();
        assert.ok(size.height >= 44 && size.width >= 44);
      }
      safe(f);
      pass();
      stage =
        "switching variant resets the visible quantity and old controls cannot mutate either variant";
      ({ p, f } = await setup(2));
      await article(p)
        .getByRole("button", { name: "Agregar uno", exact: true })
        .evaluate((el) => {
          window.oldStepper = el;
        });
      await p.evaluate(() =>
        window.changeCard({
          producto: { id: "qa-p", variantes: [{ id: "qa-v2", precioBase: "12" }] },
        }),
      );
      await expect(article(p).getByRole("button", { name: "Agregar", exact: true })).toBeEnabled();
      await p.evaluate(() => window.oldStepper.click());
      assert.equal(await quantity(p), 2);
      assert.equal(
        (await cart(p)).some((i) => i.varianteId === "qa-v2"),
        false,
      );
      safe(f);
      pass();
      stage = "multiple variants expose only the product option link";
      await p.evaluate(() =>
        window.changeCard({
          producto: {
            id: "qa-p",
            variantes: [
              { id: "qa-v2", precioBase: "12" },
              { id: "qa-v3", precioBase: "13" },
            ],
          },
        }),
      );
      await expect(
        article(p).getByRole("link", { name: "Elegir opciones →", exact: true }),
      ).toHaveAttribute("href", "/producto/producto-qa");
      assert.equal(await article(p).getByRole("button").count(), 0);
      safe(f);
      pass();
      stage = "a failed image recovers when the same product gets a new URL";
      ({ p, f } = await setup(2));
      await expect(
        article(p).getByRole("img", { name: "Imagen no disponible: Producto QA", exact: true }),
      ).toBeVisible();
      await p.evaluate(() => window.changeCard({ fotosArray: ["/good-card.png"] }));
      await expect(article(p).getByRole("img", { name: "Producto QA", exact: true })).toBeVisible();
      assert.equal(
        await article(p)
          .getByRole("img", { name: "Producto QA", exact: true })
          .evaluate((el) => el.complete && el.naturalWidth > 0),
        true,
      );
      safe(f);
      pass();
      stage = "unmounted controls cannot write a cart";
      ({ p, f } = await setup(2));
      await article(p)
        .getByRole("button", { name: "Agregar uno", exact: true })
        .evaluate((el) => {
          window.oldStepper = el;
        });
      await p.evaluate(() => window.unmountCard());
      await p.evaluate(() => window.oldStepper.click());
      assert.equal(await quantity(p), 2);
      safe(f);
      pass();
    }
    stage = "swipe-to-add followed by its compatibility click adds only once";
    ({ p, f } = await setup(0));
    const button = article(p).getByRole("button", { name: "Agregar", exact: true });
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    await p.mouse.move(box.x + 12, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 5 });
    await p.mouse.up();
    await expect.poll(() => quantity(p)).toBe(1);
    safe(f);
    pass();
    stage = "320px card keeps 44px increment and decrement targets without overflow";
    ({ p, f } = await setup(2));
    await p.setViewportSize({ width: 320, height: 740 });
    for (const label of ["Agregar uno", "Quitar uno"]) {
      const size = await article(p).getByRole("button", { name: label, exact: true }).boundingBox();
      assert.ok(size.height >= 44 && size.width >= 44);
    }
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await article(p).screenshot({
      path: `/tmp/gaes-catalog-card-${published ? "published" : "local"}.png`,
    });
    safe(f);
    pass();
    if (published && product.fotosArray[0]) {
      stage = "a real published card replaces a broken image instead of keeping the browser error";
      ({ p, f } = await setup(2, true));
      await article(p).scrollIntoViewIfNeeded();
      await expect(
        article(p).getByRole("img", {
          name: `Imagen no disponible: ${product.tituloPublico}`,
          exact: true,
        }),
      ).toBeVisible();
      safe(f);
      pass();
    }
    console.log(
      `PASS ${groups} ${published ? "published" : "local"} card groups; browser guest cart only, no remote writes or orders`,
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
