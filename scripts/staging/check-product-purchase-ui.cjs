/** Real purchase, header, floating cart and storage; synthetic product, no remote writes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const product = {
  variantes: [
    { id: "qa-red", precioBase: "25.50", nombreVariante: "Rojo" },
    { id: "qa-blue", precioBase: "35.00", nombreVariante: "Azul" },
  ],
  precioOverride: null,
  titulo: "Producto QA",
  comprarAhora: true,
  msi: { habilitado: false, meses: [], montoMinimo: "0" },
  stockPorVariante: { "qa-red": 3, "qa-blue": 10 },
  stockPublico: 13,
  productoPublicadoId: "qa-product",
  slugSeo: "qa",
  tipoVenta: "unidad",
};
const owner = JSON.stringify(["qa-store", "qa-buyer"]);
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
        contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {ProductoCompra} from './src/components/producto-compra';import {CarritoFlotante} from './src/components/carrito-flotante';import {HeaderAcciones} from './src/components/header-acciones';import {CarritoSincronizado} from './src/components/carrito-sincronizado';import {WishlistCuenta} from './src/components/wishlist-cuenta';import {configurarCarrito,guardarCarrito,recibirCarrito,agregar} from './src/lib/carrito-store';const account=${JSON.stringify(owner)};window.edits=0;window.switchOwner=owner=>configurarCarrito(owner,()=>{window.edits++;if(window.failSync)throw Error('PRIVATE_SYNC')});window.switchOwner(null);window.editCart=guardarCarrito;window.receiveCart=recibirCarrito;window.addLine=agregar;function QA(){const[p,setP]=useState(${JSON.stringify(product)});window.changeProduct=patch=>setP(old=>({...old,...patch}));return <><HeaderAcciones/>{new URLSearchParams(location.search).has('sync')&&<CarritoSincronizado owner={account}/>}<section aria-label='Compra de producto'><ProductoCompra {...p}/></section>{new URLSearchParams(location.search).has('wishlist')&&<WishlistCuenta inicial={[{itemId:'qa-fav',productoPublicadoId:'qa-product',varianteId:'qa-new',tituloPublico:'Favorito QA',precio:'1.00',slugSeo:'qa-fav',foto:null}]}/>}<CarritoFlotante/></>};const root=createRoot(document.getElementById('root'));window.unmountPurchase=()=>root.unmount();root.render(<QA/>);`,
      },
      bundle: true,
      write: false,
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [
        {
          name: "next-fixtures",
          setup(b) {
            b.onResolve({ filter: /^next\/(link|navigation)$/ }, (a) => ({
              path: a.path,
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
              resolveDir: app,
              loader: "tsx",
              contents:
                a.path === "next/link"
                  ? "export default function Link({href,children,...p}){return <a href={href} {...p}>{children}</a>}"
                  : "export function useRouter(){return {push:url=>{window.pushes=(window.pushes||[]).concat(url)},refresh:()=>{}}};export function useSearchParams(){return new URLSearchParams()};export function usePathname(){return '/producto/qa'}",
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
        return res.end(fs.readFileSync("/tmp/gaes-purchase.css"));
      }
      res.end(
        '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>',
      );
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    const setup = async (items = [], options = {}) => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 320, height: 844 },
        serviceWorkers: "block",
      });
      await context.addInitScript(
        ({ items, options, owner }) => {
          localStorage.setItem("gaespos_carrito", JSON.stringify(items));
          if (options.sync)
            localStorage.setItem(`gaespos_carrito_cuenta:${owner}`, JSON.stringify(items));
          window.failRead = !!options.failRead;
          window.failWrite = !!options.failWrite;
          const get = Storage.prototype.getItem;
          const set = Storage.prototype.setItem;
          window.cartWrites = 0;
          Storage.prototype.getItem = function (k) {
            if (window.failRead) throw Error("PRIVATE_READ");
            return get.call(this, k);
          };
          Storage.prototype.setItem = function (k, v) {
            if (window.failWrite) throw Error("PRIVATE_WRITE");
            window.cartWrites++;
            return set.call(this, k, v);
          };
        },
        { items, options, owner },
      );
      const p = await context.newPage();
      p.setDefaultTimeout(7000);
      const f = { errors: [], writes: [], reads: 0 };
      p.on("pageerror", (e) => f.errors.push(e.message));
      await p.route("**/api/**", (r) => {
        const req = r.request();
        const u = new URL(req.url());
        if (u.pathname === "/api/cuenta/carrito" && req.method() === "GET") {
          f.reads++;
          return r.fulfill({
            json: {
              owner,
              cart: options.remote
                ? {
                    version: "qa-remote-v1",
                    cuponCodigo: null,
                    items: options.remote.map((i) => ({
                      varianteId: i.varianteId,
                      cantidad: String(i.cantidad),
                      nombre: i.titulo,
                      precioUnitario: i.precio,
                    })),
                  }
                : null,
            },
          });
        }
        if (req.method() !== "GET") f.writes.push(u.pathname);
        return r.abort();
      });
      await p.goto(
        `${base}/producto/qa?${options.sync ? "sync=1" : ""}${options.wishlist ? "&wishlist=1" : ""}`,
        { waitUntil: "domcontentloaded" },
      );
      const c = p.getByRole("region", { name: "Compra de producto" });
      await expect(
        c.getByRole("button", { name: "Agregar al carrito", exact: true }),
      ).toBeVisible();
      return { p, c, f };
    };
    const cart = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("gaespos_carrito")));
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
    const add = (c) => c.getByRole("button", { name: "Agregar al carrito", exact: true });
    const row = (id = "qa-red", cantidad = 1) => ({
      varianteId: id,
      titulo: "Nombre anterior",
      precio: "5.00",
      cantidad,
      slugSeo: "anterior",
      imagenUrl: "/previous.png",
    });
    stage = "two immediate add clicks produce one current-price addition and an undo receipt";
    let { p, c, f } = await setup();
    await add(c).evaluate((e) => {
      e.click();
      e.click();
    });
    await expect(c.getByText("Agregado al carrito", { exact: true })).toBeVisible();
    assert.equal((await cart(p))[0].cantidad, 1);
    assert.equal((await cart(p))[0].precio, "25.5");
    await expect(p.getByRole("button", { name: "Deshacer", exact: true })).toBeVisible();
    assert.equal(await p.evaluate(() => window.cartWrites), 1);
    await safe(p, f);
    await p.screenshot({ path: "/tmp/gaes-purchase-local-320.png", fullPage: true });
    pass();
    stage = "undo restores the whole earlier line including its price and metadata exactly once";
    ({ p, c, f } = await setup([row()]));
    await add(c).click();
    await expect(p.getByRole("button", { name: "Deshacer", exact: true })).toBeVisible();
    await p.getByRole("button", { name: "Deshacer", exact: true }).evaluate((e) => {
      e.click();
      e.click();
    });
    assert.deepEqual(await cart(p), [row()]);
    await expect(p.getByRole("button", { name: "Deshacer", exact: true })).toHaveCount(0);
    await safe(p, f);
    pass();
    stage = "stock cap is enforced against the latest storage even before React refreshes";
    ({ p, c, f } = await setup());
    await p.evaluate(
      (item) => localStorage.setItem("gaespos_carrito", JSON.stringify([item])),
      row("qa-red", 3),
    );
    await add(c).click();
    await expect(c.getByRole("alert")).toContainText("unidades disponibles");
    assert.equal((await cart(p))[0].cantidad, 3);
    await safe(p, f);
    pass();
    stage = "rapid quantity stepper clicks count from each latest draft";
    ({ p, c, f } = await setup());
    await c.getByRole("button", { name: "Aumentar cantidad" }).evaluate((e) => {
      e.click();
      e.click();
    });
    await expect(c.getByRole("spinbutton", { name: "Cantidad", exact: true })).toHaveValue("3");
    await add(c).click();
    assert.equal((await cart(p))[0].cantidad, 3);
    await safe(p, f);
    pass();
    stage = "a later edit cancels undo instead of removing someone else’s quantity";
    ({ p, c, f } = await setup());
    await add(c).click();
    await p.evaluate((item) => window.editCart([item]), row("qa-red", 1));
    await expect(p.getByRole("button", { name: "Deshacer", exact: true })).toHaveCount(0);
    assert.deepEqual(await cart(p), [row("qa-red", 1)]);
    await safe(p, f);
    pass();
    stage = "a silent storage change is rechecked by undo immediately before it writes";
    ({ p, c, f } = await setup());
    await add(c).click();
    await p.evaluate(
      (item) => localStorage.setItem("gaespos_carrito", JSON.stringify([item])),
      row("qa-red", 2),
    );
    await p.getByRole("button", { name: "Deshacer", exact: true }).click();
    await expect(p.getByRole("alert")).toContainText("Tu carrito cambió");
    assert.deepEqual(await cart(p), [row("qa-red", 2)]);
    await safe(p, f);
    pass();
    stage = "account switch clears both product success and undo without copying a guest cart";
    ({ p, c, f } = await setup());
    await add(c).click();
    await p.evaluate((owner) => window.switchOwner(owner), owner);
    await expect(c.getByText("Agregado al carrito", { exact: true })).toHaveCount(0);
    await expect(p.getByRole("button", { name: "Deshacer", exact: true })).toHaveCount(0);
    assert.equal(
      await p.evaluate((owner) => localStorage.getItem(`gaespos_carrito_cuenta:${owner}`), owner),
      null,
    );
    await safe(p, f);
    pass();
    stage = "a click from the previous account render cannot add to the newly selected account";
    ({ p, c, f } = await setup());
    await c.getByRole("spinbutton", { name: "Cantidad" }).fill("2");
    await add(c).evaluate((button, owner) => {
      window.switchOwner(owner);
      button.click();
    }, owner);
    assert.equal(
      await p.evaluate((owner) => localStorage.getItem(`gaespos_carrito_cuenta:${owner}`), owner),
      null,
    );
    await safe(p, f);
    pass();
    stage = "changing variant resets feedback and adds the selected variant price";
    ({ p, c, f } = await setup());
    await add(c).click();
    await c.getByRole("button", { name: "Azul", exact: true }).click();
    await expect(add(c)).toBeEnabled({ timeout: 500 });
    await c.getByRole("spinbutton", { name: "Cantidad" }).fill("2");
    await add(c).click();
    const both = await cart(p);
    assert.equal(both.find((i) => i.varianteId === "qa-blue").cantidad, 2);
    assert.equal(both.find((i) => i.varianteId === "qa-blue").precio, "35");
    await safe(p, f);
    pass();
    stage =
      "a reused component with a different product does not retain another product quantity or timer";
    ({ p, c, f } = await setup());
    await c.getByRole("spinbutton", { name: "Cantidad" }).fill("2");
    await add(c).click();
    await p.evaluate(() =>
      window.changeProduct({
        productoPublicadoId: "qa-other",
        variantes: [{ id: "qa-other-v", precioBase: "8.00", nombreVariante: null }],
        stockPorVariante: null,
        stockPublico: 100,
      }),
    );
    await expect(c.getByRole("spinbutton", { name: "Cantidad" })).toHaveValue("1");
    await expect(c.getByText("Agregado al carrito", { exact: true })).toHaveCount(0);
    await add(c).click();
    assert.equal((await cart(p)).find((i) => i.varianteId === "qa-other-v").cantidad, 1);
    await safe(p, f);
    pass();
    stage = "fractional stock and header counts remain exact at the public cap";
    ({ p, c, f } = await setup([row("qa-red", 0.1)]));
    await p.evaluate(() =>
      window.changeProduct({
        tipoVenta: "peso",
        stockPorVariante: { "qa-red": 0.3, "qa-blue": 10 },
      }),
    );
    await c.getByRole("spinbutton", { name: "Cantidad" }).fill("0.2");
    await add(c).click();
    assert.equal((await cart(p))[0].cantidad, 0.3);
    await expect(
      p.getByRole("link", { name: "Carrito, 0.3 productos", exact: true }),
    ).toBeVisible();
    assert(!(await p.locator("body").innerText()).includes("00000000000000004"));
    await safe(p, f);
    pass();
    for (const value of ["0", "-1", "1.5", "100001", "1e2"]) {
      stage = `unsafe unit quantity ${value} never writes`;
      ({ p, c, f } = await setup());
      await c.getByRole("spinbutton", { name: "Cantidad" }).fill(value);
      await add(c).click();
      await expect(c.getByRole("alert")).toContainText("Escribe una cantidad");
      assert.deepEqual(await cart(p), []);
      await safe(p, f);
      pass();
    }
    stage =
      "buy now is guarded against duplicate clicks and navigates only after a confirmed local save";
    ({ p, c, f } = await setup());
    await c.getByRole("button", { name: "Comprar ahora", exact: true }).evaluate((e) => {
      e.click();
      e.click();
    });
    assert.equal((await cart(p))[0].cantidad, 1);
    assert.deepEqual(await p.evaluate(() => window.pushes), ["/checkout"]);
    await safe(p, f);
    pass();
    stage = "storage write failure never navigates or announces an added product";
    ({ p, c, f } = await setup([], { failWrite: true }));
    await c.getByRole("button", { name: "Comprar ahora", exact: true }).click();
    await expect(c.getByRole("alert")).toContainText("No pudimos confirmar");
    assert.deepEqual(await cart(p), []);
    assert.deepEqual(await p.evaluate(() => window.pushes || []), []);
    await expect(c.getByText("Agregado al carrito", { exact: true })).toHaveCount(0);
    await safe(p, f);
    pass();
    stage = "sync callback failure after local persistence does not add again";
    ({ p, c, f } = await setup());
    await p.evaluate(() => {
      window.failSync = true;
    });
    await add(c).evaluate((e) => {
      e.click();
      e.click();
    });
    await expect(c.getByRole("alert")).toContainText("Selección guardada en este navegador");
    assert.equal((await cart(p))[0].cantidad, 1);
    assert.equal(await p.evaluate(() => window.cartWrites), 1);
    await safe(p, f);
    pass();
    stage = "read denial is visible and retryable while the header avoids claiming an empty cart";
    ({ p, c, f } = await setup([row()], { failRead: true }));
    await expect(c.getByRole("alert")).toContainText("No pudimos leer");
    await expect(add(c)).toBeDisabled();
    await expect(
      p.getByRole("link", { name: "Carrito, cantidad no disponible", exact: true }),
    ).toBeVisible();
    await p.evaluate(() => {
      window.failRead = false;
    });
    await c.getByRole("button", { name: "Volver a leer carrito", exact: true }).click();
    await expect(add(c)).toBeEnabled();
    await safe(p, f);
    pass();
    stage =
      "authenticated sync initialization handles blocked storage without exposing internal errors";
    ({ p, c, f } = await setup([], { failRead: true, sync: true }));
    await expect(
      p.getByText("No pudimos leer los datos del carrito en este navegador.", { exact: false }),
    ).toBeVisible();
    assert(!(await p.locator("body").innerText()).includes("PRIVATE_READ"));
    await safe(p, f);
    pass();
    stage = "100 unique products cannot silently swallow a new product from its detail or wishlist";
    const full = Array.from({ length: 100 }, (_, i) => row(`qa-item-${i}`));
    ({ p, c, f } = await setup(full, { wishlist: true }));
    await add(c).click();
    await expect(c.getByRole("alert")).toContainText("100 productos distintos");
    assert.deepEqual(await cart(p), full);
    await p.getByRole("button", { name: "Agregar al carrito", exact: true }).last().click();
    await expect(p.getByText("No pudimos confirmar el cambio.", { exact: false })).toBeVisible();
    assert.deepEqual(await cart(p), full);
    await safe(p, f);
    pass();
    stage = "an invalid price is never displayed as NaN or allowed into the cart";
    ({ p, c, f } = await setup());
    await p.evaluate(() => window.changeProduct({ precioOverride: "NaN" }));
    await expect(c.getByText("Precio no disponible", { exact: true })).toBeVisible();
    await expect(add(c)).toBeDisabled();
    assert.deepEqual(await cart(p), []);
    await safe(p, f);
    pass();
    stage =
      "merging a full guest selection into a nonempty account preserves both carts at the 100-line limit";
    ({ p, c, f } = await setup(full, { sync: true, remote: [row("qa-remote", 1)] }));
    await expect(
      p.getByRole("button", { name: "Agregar a este carrito", exact: true }),
    ).toBeVisible();
    await expect.poll(() => f.reads).toBeGreaterThan(0);
    await expect
      .poll(() =>
        p.evaluate(
          (owner) => JSON.parse(localStorage.getItem(`gaespos_carrito_cuenta:${owner}`)).length,
          owner,
        ),
      )
      .toBe(1);
    await p.getByRole("button", { name: "Agregar a este carrito", exact: true }).click();
    await expect(
      p.getByText("La selección combinada supera los límites del carrito.", { exact: false }),
    ).toBeVisible();
    assert.deepEqual(await cart(p), full);
    assert.equal(
      await p.evaluate(
        (owner) => JSON.parse(localStorage.getItem(`gaespos_carrito_cuenta:${owner}`)).length,
        owner,
      ),
      1,
    );
    await safe(p, f);
    pass();
    stage = "a missing price never advertises free financing or sends a shipping estimate";
    ({ p, c, f } = await setup());
    await p.evaluate(() =>
      window.changeProduct({
        precioOverride: " ",
        mostrarCotizacion: true,
        msi: { habilitado: true, meses: [12], montoMinimo: "0" },
      }),
    );
    await expect(c.getByText("Precio no disponible", { exact: true })).toBeVisible();
    await expect(c.getByText(/meses sin intereses/)).toHaveCount(0);
    const shipping = c.getByRole("region", { name: "¿Cuándo llega?", exact: true });
    await shipping.getByRole("button", { name: "Calcular", exact: true }).click();
    await expect(shipping.getByRole("alert")).toContainText(
      "Selecciona una cantidad y un precio válidos",
    );
    await safe(p, f);
    pass();
    stage = "failed undo keeps the added line and reports uncertainty without a second undo";
    ({ p, c, f } = await setup());
    await add(c).click();
    await p.evaluate(() => {
      window.failWrite = true;
    });
    await p.getByRole("button", { name: "Deshacer", exact: true }).click();
    await expect(p.getByRole("alert")).toContainText("No pudimos confirmar que se deshizo");
    assert.equal((await cart(p))[0].cantidad, 1);
    await expect(p.getByRole("button", { name: "Deshacer", exact: true })).toHaveCount(0);
    await safe(p, f);
    pass();
    stage = "large permitted quantities remain readable inside the mobile floating summary";
    ({ p, c, f } = await setup());
    await p.evaluate(() => window.changeProduct({ stockPorVariante: null, stockPublico: 100000 }));
    await c.getByRole("spinbutton", { name: "Cantidad" }).fill("100000");
    await add(c).click();
    assert.equal((await cart(p))[0].cantidad, 100000);
    const floating = p.getByRole("complementary", { name: "Tu compra" });
    assert(
      await floating.evaluate((el) => el.scrollWidth <= el.clientWidth),
      "floating summary overflow",
    );
    await safe(p, f);
    pass();
    console.log(
      JSON.stringify({
        groups,
        remoteWrites: 0,
        fixtures:
          "product/stock and read-only sync receipt; real purchase, store, header, wishlist and floating cart",
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
