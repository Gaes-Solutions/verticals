/** Read-only price checks and a browser-local guest cart only. No orders or notifications. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const old = [{ varianteId: "qa1", titulo: "Producto QA", precio: "12.00", cantidad: 2 }];
let stage = "setup";
(async () => {
  let server;
  let base = process.env.VERIFICATION_QA_URL;
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
        contents: `import {createRoot} from 'react-dom/client';import Carrito from './src/app/carrito/page';const root=createRoot(document.getElementById('root'));window.unmountCart=()=>root.unmount();root.render(<Carrito/>);`,
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
        return res.end(
          process.env.VERIFICATION_QA_CSS ? fs.readFileSync(process.env.VERIFICATION_QA_CSS) : "",
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
    const next = (p) => p.locator("button:visible").filter({ hasText: "Continuar compra" }).first();
    const cart = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito")));
    const setup = async (mode = "ok", selection = old) => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      await context.addInitScript(
        ({ selection }) => {
          localStorage.setItem("gaespos_carrito", JSON.stringify(selection));
          const timeout = AbortSignal.timeout.bind(AbortSignal);
          AbortSignal.timeout = (ms) => timeout(ms === 20000 ? 600 : ms);
        },
        { selection },
      );
      const p = await context.newPage();
      p.setDefaultTimeout(8000);
      const f = { mode, requests: [], unexpected: [], errors: [], release: null };
      p.on("pageerror", (e) => f.errors.push(e.message));
      await p.route("**/api/**", async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.pathname === "/api/carrito/verificar") {
          const body = req.postDataJSON();
          f.requests.push(body);
          if (f.mode === "network") return route.abort();
          if (f.mode === "timeout") {
            await new Promise((r) => setTimeout(r, 950));
            return route.fulfill({ status: 503, json: {} }).catch(() => {});
          }
          if (f.mode === "hold")
            await new Promise((r) => {
              f.release = r;
            });
          if (/^\d+$/.test(f.mode))
            return route.fulfill({ status: Number(f.mode), json: { message: "PRIVATE" } });
          if (f.mode === "json") return route.fulfill({ status: 200, body: "{broken" });
          const items = body.items.map((i) => ({ ...i, estado: "publicado", precio: "25.50" }));
          if (f.mode === "quantity") items[0].cantidad += 1;
          if (f.mode === "variant") items[0].varianteId = "other";
          if (f.mode === "malformed") items[0].precio = "NaN";
          if (f.mode === "no_publicado") {
            items[0].estado = "no_publicado";
            items[0].precio = null;
          }
          if (f.mode === "insuficiente") items[0].estado = "insuficiente";
          await route.fulfill({ status: 200, json: { items } });
          return;
        }
        if (req.method() !== "GET") {
          f.unexpected.push(url.pathname);
          return route.abort();
        }
        if (url.pathname === "/api/catalogo")
          return route.fulfill({ status: 200, json: { items: [], total: 0 } });
        if (url.pathname === "/api/tienda-config")
          return route.fulfill({ status: 200, json: { envioGratisDesde: null } });
        return route.continue();
      });
      await p.goto(`${base}/carrito`, { waitUntil: "domcontentloaded" });
      return { p, f };
    };
    const safe = (f) => {
      assert.deepEqual(f.unexpected, []);
      assert.deepEqual(f.errors, []);
    };
    stage = "live price appears without editing the saved cart until the shopper continues";
    let { p, f } = await setup();
    await expect(next(p)).toBeEnabled();
    await expect(p.getByText(/Precio actualizado:/)).toBeVisible();
    assert.deepEqual(await cart(p), old);
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.requests[0], { items: [{ varianteId: "qa1", cantidad: 2 }] });
    safe(f);
    pass();
    stage = "continue stores the checked price and does not double navigate on a double click";
    await next(p).evaluate((el) => {
      el.click();
      el.click();
    });
    if (published) await p.waitForURL("**/checkout");
    else assert.deepEqual(await p.evaluate(() => window.qaPushes), ["/checkout"]);
    assert.equal((await cart(p))[0].precio, "25.50");
    assert.equal((await cart(p))[0].cantidad, 2);
    safe(f);
    pass();
    for (const mode of [
      "network",
      "timeout",
      "json",
      "quantity",
      "variant",
      "malformed",
      "503",
      "429",
    ]) {
      stage = `${mode} blocks continuation, preserves selection and supports explicit retry`;
      ({ p, f } = await setup(mode));
      await expect(
        p.getByRole("button", { name: "Volver a consultar", exact: true }),
      ).toBeVisible();
      await expect(next(p)).toBeDisabled();
      assert.deepEqual(await cart(p), old);
      assert.equal(await p.getByText("PRIVATE", { exact: true }).count(), 0);
      f.mode = "ok";
      await p.getByRole("button", { name: "Volver a consultar", exact: true }).click();
      await expect(next(p)).toBeEnabled();
      assert.deepEqual(await cart(p), old);
      safe(f);
      pass();
    }
    for (const mode of ["no_publicado", "insuficiente"]) {
      stage = `${mode} is clearly explained and remains in the cart for correction`;
      ({ p, f } = await setup(mode));
      await expect(
        p.getByRole("button", { name: "Volver a consultar", exact: true }),
      ).toBeVisible();
      await expect(next(p)).toBeDisabled();
      await expect(
        p.getByText(
          mode === "no_publicado" ? /ya no está disponible/ : /supera el inventario público/,
        ),
      ).toBeVisible();
      assert.deepEqual(await cart(p), old);
      safe(f);
      pass();
    }
    stage =
      "quantity edits invalidate the old check and rapid edits debounce to the latest quantity";
    ({ p, f } = await setup());
    await expect(next(p)).toBeEnabled();
    await p
      .getByRole("button", { name: "Aumentar cantidad de Producto QA", exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await expect.poll(() => f.requests.at(-1)?.items[0]?.cantidad).toBe(4);
    await expect(next(p)).toBeEnabled();
    assert.equal(f.requests.length, 2);
    assert.equal((await cart(p))[0].cantidad, 4);
    safe(f);
    pass();
    stage = "same-tick selection change cannot reuse the old enabled check";
    await next(p).evaluate((el) => {
      localStorage.setItem(
        "gaespos_carrito",
        JSON.stringify([
          { varianteId: "qa1", titulo: "Producto QA", precio: "12.00", cantidad: 5 },
        ]),
      );
      el.click();
    });
    await expect.poll(() => f.requests.at(-1)?.items[0]?.cantidad).toBe(5);
    assert.equal((await cart(p))[0].precio, "12.00");
    if (!published) assert.equal(await p.evaluate(() => window.qaPushes?.length || 0), 0);
    safe(f);
    pass();
    stage = "account context changes invalidate consent before another request completes";
    ({ p, f } = await setup());
    await expect(next(p)).toBeEnabled();
    f.mode = "hold";
    await p.evaluate(() => window.dispatchEvent(new Event("carrito-contexto-cambiado")));
    await expect(next(p)).toBeDisabled();
    await expect.poll(() => typeof f.release).toBe("function");
    f.mode = "ok";
    f.release();
    await expect(next(p)).toBeEnabled();
    safe(f);
    pass();
    if (!published) {
      stage = "late response to an old quantity cannot validate the new selection";
      ({ p, f } = await setup("hold"));
      await expect.poll(() => typeof f.release).toBe("function");
      const release = f.release;
      f.mode = "ok";
      await p
        .getByRole("button", { name: "Aumentar cantidad de Producto QA", exact: true })
        .click();
      await expect(next(p)).toBeEnabled();
      release();
      await p.waitForTimeout(100);
      await expect(next(p)).toBeEnabled();
      assert.equal(f.requests.at(-1).items[0].cantidad, 3);
      safe(f);
      pass();
      stage = "unmount aborts delayed verification without saving a new cart";
      ({ p, f } = await setup("hold"));
      await expect.poll(() => typeof f.release).toBe("function");
      await p.evaluate(() => window.unmountCart());
      f.release();
      await p.waitForTimeout(100);
      assert.deepEqual(await cart(p), old);
      safe(f);
      pass();
    }
    stage = "an expired check is refreshed before allowing checkout";
    ({ p, f } = await setup());
    await expect(next(p)).toBeEnabled();
    await p.evaluate(() => {
      const now = Date.now.bind(Date);
      Date.now = () => now() + 61000;
    });
    await next(p).click();
    await expect.poll(() => f.requests.length).toBe(2);
    assert.equal((await cart(p))[0].precio, "12.00");
    if (!published) assert.equal(await p.evaluate(() => window.qaPushes?.length || 0), 0);
    safe(f);
    pass();
    stage = "storage failure does not navigate or advertise a successful price update";
    ({ p, f } = await setup());
    await expect(next(p)).toBeEnabled();
    await p.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, v) {
        if (key === "gaespos_carrito") throw Error("Storage unavailable");
        return set.call(this, key, v);
      };
    });
    await next(p).click();
    await expect(p.getByText(/No pudimos guardar los precios/)).toBeVisible();
    await expect(next(p)).toBeDisabled();
    assert.deepEqual(await cart(p), old);
    safe(f);
    pass();
    stage = "320px cart has no horizontal overflow and quantity actions have 44px targets";
    ({ p, f } = await setup());
    await expect(next(p)).toBeEnabled();
    await p.setViewportSize({ width: 320, height: 740 });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const name of [
      "Aumentar cantidad de Producto QA",
      "Disminuir cantidad de Producto QA",
      "Quitar Producto QA",
    ])
      assert.ok((await p.getByRole("button", { name, exact: true }).boundingBox()).height >= 44);
    await p.screenshot({
      path: `/tmp/gaes-cart-verification-${published ? "published" : "local"}.png`,
      fullPage: true,
    });
    safe(f);
    pass();
    if (published) {
      stage = "real read-only BFF checks a public variant and rejects unsafe calls";
      const catalog = await context.request.get(`${base}/api/catalogo?pageSize=1`);
      assert.equal(catalog.status(), 200);
      const product = (await catalog.json()).items[0];
      assert.ok(product?.producto?.variantes[0]);
      const id = product.producto.variantes[0].id;
      const real = await context.request.post(`${base}/api/carrito/verificar`, {
        headers: { Origin: base },
        data: { items: [{ varianteId: id, cantidad: 1 }] },
      });
      assert.equal(real.status(), 200);
      const data = await real.json();
      assert.equal(data.items[0].varianteId, id);
      assert.ok(["publicado", "insuficiente"].includes(data.items[0].estado));
      assert.ok(Number.isFinite(Number(data.items[0].precio)));
      assert.equal(real.headers()["cache-control"], "private, no-store");
      const missing = await context.request.post(`${base}/api/carrito/verificar`, {
        headers: { Origin: base },
        data: {
          items: [{ varianteId: `qa-missing-${require("node:crypto").randomUUID()}`, cantidad: 1 }],
        },
      });
      assert.equal(missing.status(), 200);
      assert.equal((await missing.json()).items[0].estado, "no_publicado");
      const invalid = await context.request.post(`${base}/api/carrito/verificar`, {
        headers: { Origin: base },
        data: { items: [] },
      });
      assert.equal(invalid.status(), 400);
      const foreign = await context.request.post(`${base}/api/carrito/verificar`, {
        headers: { Origin: "https://evil.test" },
        data: { items: [{ varianteId: id, cantidad: 1 }] },
      });
      assert.equal(foreign.status(), 403);
      pass();
    }
    console.log(
      `PASS ${groups} ${published ? "published" : "local"} cart verification groups; no orders, stock reservations or email`,
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
