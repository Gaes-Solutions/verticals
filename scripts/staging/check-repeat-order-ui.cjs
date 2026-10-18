/** Real repeat components, synthetic account/order/quote reads; no remote mutations. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const owner = JSON.stringify(["qa-store", "qa-buyer"]);
const otherOwner = JSON.stringify(["qa-store", "qa-other"]);
const key = `gaespos_carrito_cuenta:${owner}`;
const baseCart = [
  {
    varianteId: "qa-shared",
    titulo: "Producto actual",
    cantidad: 0.1,
    precio: "99",
    slugSeo: "actual",
    imagenUrl: "/qa-image",
  },
];
const pedido = {
  folioPublico: "PED-QA",
  items: [
    { varianteId: "qa-shared", nombre: "Producto anterior", cantidad: 0.2 },
    { varianteId: "qa-new", nombre: "Producto nuevo", cantidad: 1 },
    { varianteId: "qa-gone", nombre: "Producto retirado", cantidad: 2 },
  ],
};
let stage = "setup";
(async () => {
  let server;
  let browser;
  let context;
  let groups = 0;
  try {
    const app = path.join(process.cwd(), "apps/web-tienda");
    const esbuild = require(
      require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
    );
    const bundle = await esbuild.build({
      absWorkingDir: app,
      stdin: {
        resolveDir: app,
        loader: "tsx",
        contents: `import {createRoot} from 'react-dom/client';import {RepetirDespensa} from './src/components/repetir-despensa';import {configurarCarrito,guardarCarrito} from './src/lib/carrito-store';window.editCalls=0;window.switchOwner=owner=>configurarCarrito(owner,()=>{window.editCalls++;if(window.failSync)throw Error('PRIVATE_SYNC')});window.switchOwner(${JSON.stringify(owner)});window.editCart=guardarCarrito;const root=createRoot(document.getElementById('root'));window.unmountRepeat=()=>root.unmount();root.render(<><a href='/background'>Fondo</a><RepetirDespensa/></>);`,
      },
      bundle: true,
      write: false,
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [
        {
          name: "next-link",
          setup(b) {
            b.onResolve({ filter: /^next\/link$/ }, (a) => ({
              path: a.path,
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              resolveDir: app,
              loader: "tsx",
              contents:
                "export default function Link({href,children,...p}){return <a href={href} {...p}>{children}</a>}",
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
        return res.end(fs.readFileSync("/tmp/gaes-repeat.css"));
      }
      res.end(
        '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>',
      );
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    const setup = async (patch = {}, cart = baseCart) => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 320, height: 844 },
        serviceWorkers: "block",
      });
      await context.addInitScript(
        ({ key, cart }) => {
          localStorage.setItem(key, JSON.stringify(cart));
          const set = Storage.prototype.setItem;
          window.cartWrites = 0;
          Storage.prototype.setItem = function (k, v) {
            if (k.startsWith("gaespos_carrito_cuenta:")) {
              if (window.failStorage) throw Error("PRIVATE_STORAGE");
              window.cartWrites++;
            }
            return set.call(this, k, v);
          };
          const timeout = AbortSignal.timeout.bind(AbortSignal);
          AbortSignal.timeout = (ms) => timeout(ms === 20000 ? 750 : ms);
        },
        { key, cart },
      );
      const f = {
        owner,
        pedido,
        readStatus: 200,
        sessionStatus: 200,
        quoteStatus: 200,
        price: "25.50",
        gone: new Set(["qa-gone"]),
        insufficient: new Set(),
        errors: [],
        writes: [],
        quotes: [],
        sessionReads: 0,
        quoteDelay: 0,
        initialDelay: 0,
        ...patch,
      };
      const p = await context.newPage();
      p.setDefaultTimeout(6000);
      p.on("pageerror", (e) => f.errors.push(e.message));
      await p.route("**/api/**", async (r) => {
        const req = r.request();
        const path = new URL(req.url()).pathname;
        const sp = new URL(req.url()).searchParams;
        if (path === "/api/cuenta/repetir-pedido") {
          const snapshot = { owner: f.owner, pedido: f.pedido };
          if (sp.get("sesion") === "1") {
            f.sessionReads++;
            return r.fulfill({ status: f.sessionStatus, json: { owner: f.owner } });
          }
          if (f.initialDelay) await new Promise((r) => setTimeout(r, f.initialDelay));
          return r
            .fulfill({
              status: f.readStatus,
              json: f.badReceipt ? { ...snapshot, pedido: { items: [] } } : snapshot,
            })
            .catch(() => {});
        }
        if (path === "/api/carrito/verificar") {
          const items = req.postDataJSON().items;
          f.quotes.push(items);
          const price = f.price;
          const gone = new Set(f.gone);
          const insufficient = new Set(f.insufficient);
          if (f.quoteDelay) await new Promise((r) => setTimeout(r, f.quoteDelay));
          if (f.quoteStatus !== 200)
            return r
              .fulfill({ status: f.quoteStatus, json: { message: "PRIVATE" } })
              .catch(() => {});
          return r
            .fulfill({
              json: f.badQuote
                ? { items: [] }
                : {
                    items: items.map((i) => ({
                      ...i,
                      precio: gone.has(i.varianteId) ? null : price,
                      estado: gone.has(i.varianteId)
                        ? "no_publicado"
                        : insufficient.has(i.varianteId)
                          ? "insuficiente"
                          : "publicado",
                    })),
                  },
            })
            .catch(() => {});
        }
        if (req.method() !== "GET") f.writes.push(path);
        return r.abort();
      });
      await p.goto(url, { waitUntil: "domcontentloaded" });
      return { p, f };
    };
    const cart = (p) => p.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
    const review = async (p) => {
      await p.getByRole("button", { name: "Revisar productos", exact: true }).click();
      const d = p.getByRole("dialog", { name: "Revisa los productos para repetir" });
      await expect(d).toBeVisible();
      return d;
    };
    const unchanged = async (p) => assert.deepEqual(await cart(p), baseCart);
    const safe = async (p, f) => {
      assert.deepEqual(f.errors, []);
      assert.deepEqual(f.writes, []);
      assert(
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        "page overflow",
      );
    };
    const pass = () => {
      groups++;
      console.log(`PASS ${stage}`);
    };
    stage =
      "opening and reviewing never changes the cart; withdrawn products are explicit and unchecked";
    let { p, f } = await setup();
    let d = await review(p);
    await unchanged(p);
    await expect(d.getByText("Ya no está disponible", { exact: true })).toBeVisible();
    await expect(d.getByRole("checkbox", { name: /Producto retirado/ })).toBeDisabled();
    await expect(d.getByText("Subtotal a agregar: $30.60", { exact: true })).toBeVisible();
    assert.equal(await d.evaluate((e) => e.matches(":modal")), true);
    await safe(p, f);
    await p.screenshot({ path: "/tmp/gaes-repeat-preview-320.png", fullPage: true });
    pass();
    stage = "Escape closes the preview and restores focus without modifying the cart";
    await p.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await expect(p.getByRole("button", { name: "Revisar productos", exact: true })).toBeFocused();
    await unchanged(p);
    pass();
    stage =
      "confirmation merges fractional quantities once, preserves metadata and uses current prices";
    d = await review(p);
    await d.getByRole("button", { name: "Agregar selección", exact: true }).evaluate((e) => {
      e.click();
      e.click();
    });
    await expect(p.getByText("Selección agregada", { exact: false })).toBeVisible();
    assert.deepEqual(await cart(p), [
      { ...baseCart[0], cantidad: 0.3, precio: "25.50" },
      { varianteId: "qa-new", titulo: "Producto nuevo", cantidad: 1, precio: "25.50" },
    ]);
    assert.equal(await p.evaluate(() => window.cartWrites), 1);
    assert.equal(await p.evaluate(() => window.editCalls), 1);
    await expect(p.getByRole("link", { name: "Ver carrito", exact: true })).toBeFocused();
    await safe(p, f);
    pass();
    stage = "the shopper can exclude a product before confirming";
    ({ p, f } = await setup());
    d = await review(p);
    await d.getByRole("checkbox", { name: /Producto nuevo/ }).uncheck();
    await expect(d.getByText("Subtotal a agregar: $5.10", { exact: true })).toBeVisible();
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(p.getByText("Selección agregada", { exact: false })).toBeVisible();
    assert.deepEqual(await cart(p), [{ ...baseCart[0], cantidad: 0.3, precio: "25.50" }]);
    await safe(p, f);
    pass();
    stage = "all withdrawn products never produce a success or a write";
    ({ p, f } = await setup({ gone: new Set(pedido.items.map((i) => i.varianteId)) }));
    d = await review(p);
    await expect(d.getByRole("button", { name: "Agregar selección" })).toBeDisabled();
    await expect(
      d.getByText("No hay productos seleccionados para agregar.", { exact: true }),
    ).toBeVisible();
    await unchanged(p);
    await safe(p, f);
    pass();
    stage =
      "insufficient combined quantity is excluded even when the ordered quantity alone would fit";
    ({ p, f } = await setup({ insufficient: new Set(["qa-shared"]) }));
    d = await review(p);
    await expect(d.getByRole("checkbox", { name: /Producto anterior/ })).toBeDisabled();
    assert.equal(f.quotes[0].find((i) => i.varianteId === "qa-shared").cantidad, 0.3);
    await unchanged(p);
    await safe(p, f);
    pass();
    stage = "a changed current price requires a second explicit confirmation";
    ({ p, f } = await setup());
    d = await review(p);
    f.price = "30.00";
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(d.getByRole("alert")).toContainText("Cambió un precio");
    await expect(d.getByText("Subtotal a agregar: $36.00", { exact: true })).toBeVisible();
    await unchanged(p);
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(p.getByText("Selección agregada", { exact: false })).toBeVisible();
    assert.equal((await cart(p))[0].precio, "30.00");
    await safe(p, f);
    pass();
    stage = "a product removed during confirmation is shown and excluded for the next review";
    ({ p, f } = await setup());
    d = await review(p);
    f.gone.add("qa-new");
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(d.getByRole("alert")).toContainText("Cambió un precio");
    await expect(d.getByRole("checkbox", { name: /Producto nuevo/ })).toBeDisabled();
    await unchanged(p);
    await safe(p, f);
    pass();
    stage = "editing the cart invalidates consent and a late quote cannot overwrite it";
    ({ p, f } = await setup());
    f.quoteDelay = 450;
    await p.getByRole("button", { name: "Revisar productos" }).click();
    await expect.poll(() => f.quotes.length).toBe(1);
    const changed = [{ ...baseCart[0], cantidad: 5 }];
    await p.evaluate((items) => window.editCart(items), changed);
    await expect(p.getByRole("alert")).toContainText("Tu carrito cambió");
    await p.waitForTimeout(550);
    await expect(p.getByRole("dialog")).toHaveCount(0);
    assert.deepEqual(await cart(p), changed);
    await safe(p, f);
    pass();
    stage =
      "an account switch during a delayed quote hides old order details and cannot write either cart";
    ({ p, f } = await setup());
    f.quoteDelay = 450;
    await p.getByRole("button", { name: "Revisar productos" }).click();
    await expect.poll(() => f.quotes.length).toBe(1);
    f.owner = otherOwner;
    f.pedido = null;
    await p.evaluate((owner) => window.switchOwner(owner), otherOwner);
    await p.waitForTimeout(550);
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await expect(p.getByText(/PED-QA/)).toHaveCount(0);
    await unchanged(p);
    assert.equal(
      await p.evaluate(
        (owner) => localStorage.getItem(`gaespos_carrito_cuenta:${owner}`),
        otherOwner,
      ),
      null,
    );
    await safe(p, f);
    pass();
    stage = "a different verified session at confirmation never adds to the previous account";
    ({ p, f } = await setup());
    d = await review(p);
    f.owner = otherOwner;
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(p.getByRole("alert")).toContainText("La sesión cambió");
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await unchanged(p);
    await safe(p, f);
    pass();
    for (const mode of ["service", "malformed", "timeout"]) {
      stage = `${mode} quote failure preserves the cart and permits safe review`;
      ({ p, f } = await setup());
      if (mode === "service") f.quoteStatus = 503;
      if (mode === "malformed") f.badQuote = true;
      if (mode === "timeout") f.quoteDelay = 1100;
      await p.getByRole("button", { name: "Revisar productos" }).click();
      await expect(p.getByRole("alert")).toContainText("No pudimos revisar");
      await unchanged(p);
      assert(!(await p.getByText(/PRIVATE/).count()));
      f.quoteStatus = 200;
      f.badQuote = false;
      f.quoteDelay = 0;
      await review(p);
      await unchanged(p);
      await safe(p, f);
      pass();
    }
    stage = "a storage failure before the single write leaves quantities unchanged and can retry";
    ({ p, f } = await setup());
    d = await review(p);
    await p.evaluate(() => {
      window.failStorage = true;
    });
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(p.getByRole("alert")).toContainText("No pudimos confirmar el guardado");
    await unchanged(p);
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await p.evaluate(() => {
      window.failStorage = false;
    });
    d = await review(p);
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(p.getByText("Selección agregada", { exact: false })).toBeVisible();
    assert.equal((await cart(p))[0].cantidad, 0.3);
    await safe(p, f);
    pass();
    stage = "a sync callback error after the local write never offers a duplicate add";
    ({ p, f } = await setup());
    d = await review(p);
    await p.evaluate(() => {
      window.failSync = true;
    });
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(p.getByText("Selección agregada", { exact: false })).toBeVisible();
    await expect(p.getByRole("alert")).toContainText("Selección guardada en este navegador");
    assert.equal((await cart(p))[0].cantidad, 0.3);
    assert.equal(await p.evaluate(() => window.cartWrites), 1);
    await expect(p.getByRole("button", { name: "Agregar selección" })).toHaveCount(0);
    await safe(p, f);
    pass();
    stage = "overflowing the combined quantity is rejected before fetching a quote";
    ({ p, f } = await setup({}, [{ ...baseCart[0], cantidad: 100000 }]));
    await p.getByRole("button", { name: "Revisar productos" }).click();
    await expect(p.getByRole("alert")).toContainText("supera el límite");
    assert.equal(f.quotes.length, 0);
    assert.equal((await cart(p))[0].cantidad, 100000);
    await safe(p, f);
    pass();
    stage = "malformed initial receipt is retryable without rendering private details";
    ({ p, f } = await setup({ badReceipt: true }));
    await expect(p.getByRole("alert")).toContainText("No pudimos revisar");
    await expect(p.getByText(/PED-QA/)).toHaveCount(0);
    f.badReceipt = false;
    await p.getByRole("button", { name: "Volver a intentar" }).click();
    await review(p);
    await unchanged(p);
    await safe(p, f);
    pass();
    stage = "manual close returns focus after the asynchronous preview without changing the cart";
    ({ p, f } = await setup());
    d = await review(p);
    await d.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await expect(p.getByRole("button", { name: "Revisar productos", exact: true })).toBeFocused();
    await unchanged(p);
    await safe(p, f);
    pass();
    stage = "an undelivered or missing order never offers a repeat";
    ({ p, f } = await setup({ pedido: null }));
    await expect(p.getByRole("button", { name: "Revisar productos", exact: true })).toHaveCount(0);
    await unchanged(p);
    await safe(p, f);
    pass();
    stage = "an expired session at confirmation provides a clear refresh action without writing";
    ({ p, f } = await setup());
    d = await review(p);
    f.sessionStatus = 401;
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(p.getByRole("button", { name: "Actualizar página", exact: true })).toBeVisible();
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await unchanged(p);
    await safe(p, f);
    pass();
    stage = "a silent external storage edit is checked again before confirming";
    ({ p, f } = await setup());
    d = await review(p);
    const external = [{ ...baseCart[0], cantidad: 7 }];
    await p.evaluate(({ key, items }) => localStorage.setItem(key, JSON.stringify(items)), {
      key,
      items: external,
    });
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(p.getByRole("alert")).toContainText("Tu carrito o cuenta cambió");
    await expect(p.getByRole("dialog")).toHaveCount(0);
    assert.deepEqual(await cart(p), external);
    await safe(p, f);
    pass();
    stage = "a confirmation timeout can retry without adding twice";
    ({ p, f } = await setup());
    d = await review(p);
    f.quoteDelay = 1100;
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(d.getByRole("alert")).toContainText("No pudimos revisar");
    await unchanged(p);
    f.quoteDelay = 0;
    await d.getByRole("button", { name: "Agregar selección" }).click();
    await expect(p.getByText("Selección agregada", { exact: false })).toBeVisible();
    assert.equal((await cart(p))[0].cantidad, 0.3);
    assert.equal(await p.evaluate(() => window.cartWrites), 1);
    await safe(p, f);
    pass();
    stage = "backgrounding the page clears the account preview until the account is rechecked";
    ({ p, f } = await setup());
    d = await review(p);
    await p.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(p.getByRole("dialog")).toHaveCount(0);
    await expect(p.getByText(/PED-QA/)).toHaveCount(0);
    await unchanged(p);
    await safe(p, f);
    pass();
    stage = "unmount aborts a delayed quote without writing or surfacing errors";
    ({ p, f } = await setup());
    f.quoteDelay = 450;
    await p.getByRole("button", { name: "Revisar productos" }).click();
    await expect.poll(() => f.quotes.length).toBe(1);
    await p.evaluate(() => window.unmountRepeat());
    await p.waitForTimeout(550);
    await unchanged(p);
    await safe(p, f);
    pass();
    console.log(
      JSON.stringify({
        groups,
        remoteWrites: 0,
        fixtures: "account, delivered order and public price/stock receipts; real components/store",
      }),
    );
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    if (server) await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(stage, e);
  process.exitCode = 1;
});
