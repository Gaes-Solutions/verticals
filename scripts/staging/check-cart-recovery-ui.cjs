/** Synthetic recovery links and a browser-local guest cart only. No orders or notifications. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const code = "rec_0123456789abcdef01234567";
const old = [{ varianteId: "qa-old", titulo: "Selección actual", precio: "12.00", cantidad: 3 }];
const receipt = {
  items: [
    { varianteId: "qa-new", nombre: "Producto recuperado", precioUnitario: "25.00", cantidad: "2" },
  ],
};
let stage = "setup";
(async () => {
  let server;
  let base = process.env.RECOVERY_QA_URL;
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
        contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {RecuperarCarrito} from './src/components/recuperar-carrito';const root=createRoot(document.getElementById('root'));window.unmountRecovery=()=>root.unmount();function QA(){const [code,setCode]=useState('${code}');window.changeCode=setCode;return <RecuperarCarrito key={code} codigo={code}/>};root.render(<QA/>);`,
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
          process.env.RECOVERY_QA_CSS ? fs.readFileSync(process.env.RECOVERY_QA_CSS) : "",
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
    const setup = async (mode = "ok", cart = old) => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      await context.addInitScript(
        ({ cart }) => {
          localStorage.setItem("gaespos_carrito", JSON.stringify(cart));
          const original = AbortSignal.timeout.bind(AbortSignal);
          AbortSignal.timeout = (ms) => original(ms === 20000 ? 600 : ms);
        },
        { cart },
      );
      const p = await context.newPage();
      p.setDefaultTimeout(8000);
      const f = { mode, gets: 0, posts: [], errors: [], release: null };
      p.on("pageerror", (e) => f.errors.push(e.message));
      await p.route("**/api/**", async (route) => {
        const req = route.request();
        if (req.method() !== "GET") {
          f.posts.push(new URL(req.url()).pathname);
          return route.abort();
        }
        if (!new URL(req.url()).pathname.startsWith("/api/recovery/")) return route.continue();
        f.gets++;
        if (f.mode === "network") return route.abort();
        if (f.mode === "timeout") {
          await new Promise((r) => setTimeout(r, 950));
          return route.fulfill({ status: 200, json: receipt }).catch(() => {});
        }
        if (f.mode === "hold")
          await new Promise((r) => {
            f.release = r;
          });
        if (/^\d+$/.test(f.mode))
          return route.fulfill({ status: Number(f.mode), json: { message: "PRIVATE" } });
        if (f.mode === "json") return route.fulfill({ status: 200, body: "{broken" });
        const json =
          f.mode === "malformed"
            ? { items: [{ ...receipt.items[0], cantidad: "NaN" }] }
            : f.mode === "duplicate"
              ? { items: [...receipt.items, ...receipt.items] }
              : f.mode === "empty"
                ? { items: [] }
                : receipt;
        await route.fulfill({ status: 200, json });
      });
      await p.goto(`${base}/recovery/${code}`, { waitUntil: "domcontentloaded" });
      return { p, f };
    };
    const cart = async (p) => p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito")));
    const preview = async (p) =>
      expect(p.getByText("Producto recuperado", { exact: true })).toBeVisible();
    const noWrites = (f) => {
      assert.deepEqual(f.posts, []);
      assert.deepEqual(f.errors, []);
    };
    stage = "preview preserves the current guest cart without automatic replacement";
    let { p, f } = await setup();
    await preview(p);
    assert.deepEqual(await cart(p), old);
    await expect(
      p.getByRole("button", { name: "Reemplazar mi carrito", exact: true }),
    ).toBeDisabled();
    assert.equal(f.gets, 1);
    noWrites(f);
    pass();
    stage = "explicit replacement requires consent and keeps exact recovered quantities";
    await p.getByRole("checkbox").check();
    await p.getByRole("button", { name: "Reemplazar mi carrito", exact: true }).click();
    await expect.poll(async () => (await cart(p))[0]?.varianteId).toBe("qa-new");
    assert.equal((await cart(p))[0].cantidad, 2);
    if (published) await p.waitForURL("**/carrito");
    else assert.deepEqual(await p.evaluate(() => window.qaPushes), ["/carrito"]);
    noWrites(f);
    pass();
    stage = "empty cart still needs a deliberate click; double click applies once";
    ({ p, f } = await setup("ok", []));
    await preview(p);
    assert.deepEqual(await cart(p), []);
    await p.getByRole("button", { name: "Llevar al carrito", exact: true }).evaluate((el) => {
      el.click();
      el.click();
    });
    await expect.poll(async () => (await cart(p))[0]?.varianteId).toBe("qa-new");
    if (published) await p.waitForURL("**/carrito");
    else assert.equal((await p.evaluate(() => window.qaPushes)).length, 1);
    noWrites(f);
    pass();
    for (const mode of ["network", "timeout", "json", "malformed", "duplicate", "503", "429"]) {
      stage = `${mode} failure preserves selection and allows an explicit retry`;
      ({ p, f } = await setup(mode));
      await expect(p.getByRole("button", { name: "Volver a intentar", exact: true })).toBeVisible();
      assert.deepEqual(await cart(p), old);
      assert.equal(await p.getByText("PRIVATE", { exact: true }).count(), 0);
      f.mode = "ok";
      await p.getByRole("button", { name: "Volver a intentar", exact: true }).click();
      await preview(p);
      assert.deepEqual(await cart(p), old);
      assert.equal(f.gets, 2);
      noWrites(f);
      pass();
    }
    for (const mode of ["404", "410"]) {
      stage = `${mode} unavailable link offers catalog and cart without overwriting`;
      ({ p, f } = await setup(mode));
      await expect(p.getByRole("alert")).toContainText("ya no está disponible");
      assert.deepEqual(await cart(p), old);
      assert.equal(
        await p.getByRole("button", { name: "Volver a intentar", exact: true }).count(),
        0,
      );
      await expect(p.getByRole("link", { name: "Ver mi carrito actual" })).toBeVisible();
      noWrites(f);
      pass();
    }
    stage = "empty recovery receipt cannot clear a populated cart";
    ({ p, f } = await setup("empty"));
    await expect(p.getByText(/no tiene productos para recuperar/)).toBeVisible();
    assert.deepEqual(await cart(p), old);
    assert.equal(await p.getByRole("button").filter({ hasText: "Reemplazar" }).count(), 0);
    noWrites(f);
    pass();
    stage = "changes from another tab invalidate previous consent";
    ({ p, f } = await setup());
    await preview(p);
    await p.getByRole("checkbox").check();
    await p.evaluate(() => {
      localStorage.setItem(
        "gaespos_carrito",
        JSON.stringify([
          { varianteId: "qa-other", titulo: "Otra selección", precio: "1", cantidad: 1 },
        ]),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: "gaespos_carrito", storageArea: localStorage }),
      );
    });
    await expect(p.getByRole("checkbox")).not.toBeChecked();
    await expect(
      p.getByRole("button", { name: "Reemplazar mi carrito", exact: true }),
    ).toBeDisabled();
    assert.equal((await cart(p))[0].varianteId, "qa-other");
    noWrites(f);
    pass();
    stage = "account context changes require fresh consent";
    await p.getByRole("checkbox").check();
    await p.evaluate(() => window.dispatchEvent(new Event("carrito-contexto-cambiado")));
    await expect(p.getByRole("checkbox")).not.toBeChecked();
    await expect(p.getByRole("alert")).toContainText("cuenta cambió");
    noWrites(f);
    pass();
    stage = "same-tick cart changes cannot slip through an already enabled button";
    await p.getByRole("checkbox").check();
    await p.getByRole("button", { name: "Reemplazar mi carrito", exact: true }).evaluate((el) => {
      localStorage.setItem("gaespos_carrito", "[]");
      el.click();
    });
    await expect(p.getByRole("alert")).toContainText("Tu carrito cambió");
    assert.deepEqual(await cart(p), []);
    noWrites(f);
    pass();
    if (!published) {
      stage = "unmount aborts a delayed response without editing the cart";
      ({ p, f } = await setup("hold"));
      await expect.poll(() => typeof f.release).toBe("function");
      await p.evaluate(() => window.unmountRecovery());
      f.release();
      await p.waitForTimeout(100);
      assert.deepEqual(await cart(p), old);
      noWrites(f);
      pass();
      stage = "switching link discards the old response and keeps the latest preview";
      ({ p, f } = await setup("hold"));
      await expect.poll(() => typeof f.release).toBe("function");
      const release = f.release;
      f.mode = "empty";
      await p.evaluate(() => window.changeCode("rec_abcdef0123456789abcdef01"));
      await expect(p.getByText(/no tiene productos para recuperar/)).toBeVisible();
      release();
      await p.waitForTimeout(100);
      assert.equal(await p.getByText("Producto recuperado", { exact: true }).count(), 0);
      assert.deepEqual(await cart(p), old);
      noWrites(f);
      pass();
    }
    stage = "storage failure never reports recovery success or clears the original selection";
    ({ p, f } = await setup());
    await preview(p);
    await p.getByRole("checkbox").check();
    await p.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "gaespos_carrito") throw new Error("Storage unavailable");
        return set.call(this, key, value);
      };
    });
    await p.getByRole("button", { name: "Reemplazar mi carrito", exact: true }).click();
    await expect(p.getByRole("alert")).toContainText("No pudimos confirmar");
    assert.deepEqual(await cart(p), old);
    noWrites(f);
    pass();
    stage = "320px view has no horizontal overflow and controls have 44px targets";
    ({ p, f } = await setup());
    await preview(p);
    await p.setViewportSize({ width: 320, height: 740 });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    if (process.env.RECOVERY_QA_CSS || published) {
      for (const el of await p
        .locator(
          'section[aria-labelledby="recovery-titulo"] button, section[aria-labelledby="recovery-titulo"] nav a',
        )
        .all())
        assert.ok((await el.boundingBox()).height >= 44);
    }
    await p.screenshot({
      path: `/tmp/gaes-cart-recovery-${published ? "published" : "local"}.png`,
      fullPage: true,
    });
    noWrites(f);
    pass();
    if (published) {
      stage = "published page blocks indexing and sending link codes as referrers";
      assert.equal(await p.locator('meta[name="referrer"]').getAttribute("content"), "no-referrer");
      assert.match(await p.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
      pass();
      stage = "real BFF rejects invalid and nonexistent codes privately without mutations";
      const invalid = await context.request.get(`${base}/api/recovery/short`);
      assert.equal(invalid.status(), 400);
      assert.equal(invalid.headers()["cache-control"], "private, no-store");
      const missing = await context.request.get(
        `${base}/api/recovery/rec_${require("node:crypto").randomBytes(12).toString("hex")}`,
      );
      assert.equal(missing.status(), 404);
      assert.equal(missing.headers()["cache-control"], "private, no-store");
      assert.equal(missing.headers()["referrer-policy"], "no-referrer");
      pass();
    }
    console.log(
      `PASS ${groups} ${published ? "published" : "local"} cart recovery groups; synthetic receipts, no orders or notifications`,
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
