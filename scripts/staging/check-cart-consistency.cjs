/** Local QA of real cart components with synthetic API responses and accounts.
 * All API calls are intercepted; no business writes or external services. */
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const app = path.join(process.cwd(), "apps/web-tienda");
const esbuild = require(
  require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
);
const ownerA = JSON.stringify(["qa-shop", "qa-a"]);
const ownerB = JSON.stringify(["qa-shop", "qa-b"]);
const localLine = { varianteId: "qa-v", titulo: "Producto QA", precio: "10.00", cantidad: 1 };
const remote = (qty) => ({
  version: `qa-v${qty}`,
  cuponCodigo: null,
  items: [
    { varianteId: "qa-v", cantidad: String(qty), nombre: "Producto QA", precioUnitario: "10.00" },
  ],
});
(async () => {
  const bundle = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      resolveDir: app,
      loader: "tsx",
      contents: `
    import {useState} from 'react';import {createRoot} from 'react-dom/client';
    import {CarritoSincronizado} from './src/components/carrito-sincronizado';
    import {HeaderAcciones} from './src/components/header-acciones';
    import {CarritoFlotante} from './src/components/carrito-flotante';
    import CarritoPage from './src/app/carrito/page';
    import {agregar,guardarCarrito,leerCarrito} from './src/lib/carrito-store';
    function QA(){const [owner,setOwner]=useState(new URLSearchParams(location.search).get('owner'));window.__owner=owner;window.__switchOwner=setOwner;window.__read=leerCarrito;window.__edit=guardarCarrito;window.__add=()=>agregar(${JSON.stringify(localLine)});return <><HeaderAcciones/><CarritoSincronizado owner={owner}/><CarritoPage/><CarritoFlotante/></>};createRoot(document.getElementById('root')).render(<QA/>);`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "qa-navigation",
        setup(build) {
          build.onResolve({ filter: /^next\/(navigation|link)$/ }, (args) => ({
            path: args.path,
            namespace: "qa-next",
          }));
          build.onLoad({ filter: /.*/, namespace: "qa-next" }, (args) => ({
            loader: "js",
            resolveDir: app,
            contents:
              args.path === "next/link"
                ? `import {createElement} from 'react';export default function Link(p){return createElement('a',p)}`
                : `export function usePathname(){return '/'};export function useSearchParams(){return new URLSearchParams()};export function useRouter(){return {push(){},refresh(){}}}`,
          }));
        },
      },
    ],
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("content-type", "application/javascript");
      res.end(bundle.outputFiles[0].contents);
    } else
      res.end(
        '<!doctype html><html lang="es"><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
      );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  let failed = 0;
  async function test(name, run) {
    const context = await browser.newContext();
    try {
      await run(context);
      console.log(`PASS ${name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${name}: ${e.stack}`);
    } finally {
      await context.close();
    }
  }
  async function pageFor(context, owner = null, mode = { get: "valid", post: "valid" }) {
    const page = await context.newPage();
    page.setDefaultTimeout(4500);
    const posts = [];
    await page.route("**/api/**", async (r) => {
      assert(new URL(r.request().url()).origin === base);
      if (!r.request().url().endsWith("/api/cuenta/carrito"))
        return r.fulfill({
          json: r.request().url().includes("tienda-config") ? { envioGratisDesde: null } : [],
        });
      const current = await page.evaluate(() => window.__owner);
      if (r.request().method() === "POST") {
        const body = r.request().postDataJSON();
        posts.push(body);
        if (mode.post === "invalid") return r.fulfill({ json: { owner: current } });
        if (mode.post === "network") return r.abort();
        return r.fulfill({
          json: { owner: current, cart: body.items.length ? remote(body.items[0].cantidad) : null },
        });
      }
      return r.fulfill({
        json:
          mode.get === "invalid"
            ? { owner: current }
            : { owner: current, cart: remote(current === ownerB ? 7 : 1) },
      });
    });
    await page.goto(`${base}/${owner ? `?owner=${encodeURIComponent(owner)}` : ""}`);
    return { page, posts };
  }
  try {
    await test("guest cross-tab quantities update header and cart, including removal", async (context) => {
      const { page: a } = await pageFor(context);
      const { page: b } = await pageFor(context);
      await a.evaluate(() => window.__add());
      await expect(
        b.getByRole("link", { name: "Carrito, 1 productos", exact: true }),
      ).toBeVisible();
      await expect(b.getByRole("heading", { name: "Tu carrito", exact: true })).toBeVisible();
      await a.evaluate(() => window.__edit([]));
      await expect(
        b.getByRole("link", { name: "Carrito, 0 productos", exact: true }),
      ).toBeVisible();
      await expect(
        b.getByRole("heading", { name: "Tu carrito está vacío", exact: true }),
      ).toBeVisible();
      await a.evaluate(() => window.__add());
      await expect(
        b.getByRole("link", { name: "Carrito, 1 productos", exact: true }),
      ).toBeVisible();
      await b.evaluate(() => localStorage.clear());
      await expect(
        a.getByRole("link", { name: "Carrito, 0 productos", exact: true }),
      ).toBeVisible();
      await expect(
        a.getByRole("heading", { name: "Tu carrito está vacío", exact: true }),
      ).toBeVisible();
    });
    await test("account switch clears old undo and leaves new account quantities intact", async (context) => {
      const { page } = await pageFor(context, ownerA);
      await expect(
        page.getByRole("link", { name: "Carrito, 1 productos", exact: true }),
      ).toBeVisible();
      await page.evaluate(() => window.__add());
      await expect(page.getByRole("button", { name: "Deshacer", exact: true })).toBeVisible();
      await page.evaluate((owner) => window.__switchOwner(owner), ownerB);
      await expect(
        page.getByRole("link", { name: "Carrito, 7 productos", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Deshacer", exact: true })).toHaveCount(0);
      assert.equal((await page.evaluate(() => window.__read()))[0].cantidad, 7);
    });
    await test("malformed successful GET preserves local selection and reports recoverable error", async (context) => {
      const mode = { get: "invalid", post: "valid" };
      await context.addInitScript(
        ({ owner, line }) =>
          localStorage.setItem(`gaespos_carrito_cuenta:${owner}`, JSON.stringify([line])),
        { owner: ownerA, line: localLine },
      );
      const { page, posts } = await pageFor(context, ownerA, mode);
      await expect(page.getByText(/No pudimos sincronizar/)).toBeVisible();
      assert.equal((await page.evaluate(() => window.__read()))[0].cantidad, 1);
      assert.equal(posts.length, 0);
      mode.get = "valid";
      await page.getByRole("button", { name: "Actualizar", exact: true }).click();
      await expect(
        page.getByRole("link", { name: "Carrito, 1 productos", exact: true }),
      ).toBeVisible();
    });
    await test("malformed POST retains durable pending edits for a safe retry", async (context) => {
      const mode = { get: "valid", post: "invalid" };
      const { page, posts } = await pageFor(context, ownerA, mode);
      await expect(
        page.getByRole("link", { name: "Carrito, 1 productos", exact: true }),
      ).toBeVisible();
      await page.evaluate(() => window.__add());
      await expect(page.getByText(/No pudimos sincronizar/)).toBeVisible();
      assert.equal((await page.evaluate(() => window.__read()))[0].cantidad, 2);
      const saved = await page.evaluate(
        (owner) => JSON.parse(localStorage.getItem(`gaespos_carrito_pendiente:${owner}`)),
        ownerA,
      );
      assert.equal(saved.items[0].cantidad, 2);
      assert.equal(posts.length, 1);
      mode.post = "valid";
      await page.getByRole("button", { name: "Actualizar", exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(
            (owner) => localStorage.getItem(`gaespos_carrito_pendiente:${owner}`),
            ownerA,
          ),
        )
        .toBeNull();
      assert.equal((await page.evaluate(() => window.__read()))[0].cantidad, 2);
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  if (failed) process.exitCode = 1;
  else console.log("PASS 4 cart consistency groups; no external API calls or business writes");
})().catch((e) => {
  console.error(`Cart QA setup failed: ${e.name}`);
  process.exitCode = 1;
});
