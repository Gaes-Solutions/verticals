/** Read-only price checks and a browser-local guest cart only. No orders or notifications. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
let stage = "setup";
(async () => {
  let server;
  let base = process.env.FILTER_QA_URL;
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
        contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {useSearchParams} from 'next/navigation';import {BarraFiltros,PanelFiltros} from './src/components/filtros';import {Paginacion} from './src/components/paginacion';function QA(){const sp=useSearchParams();const [total,setTotal]=useState(70);window.setFilterTotal=setTotal;const categorias=[{id:'qa-cat',nombre:'Decoración',slugSeo:'decoracion'}];return <><a href='/background'>Enlace de fondo</a><aside className='hidden lg:block'><PanelFiltros categorias={categorias}/></aside><BarraFiltros categorias={categorias} total={total}/><Paginacion page={Number(sp.get('page'))||1} pageSize={24} total={70} sp={Object.fromEntries(sp)}/></>};createRoot(document.getElementById('root')).render(<QA/>);`,
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
                  : "import {useSyncExternalStore} from 'react';const listen=cb=>{window.addEventListener('popstate',cb);return ()=>window.removeEventListener('popstate',cb)};export function useSearchParams(){return new URLSearchParams(useSyncExternalStore(listen,()=>window.location.search,()=>''))};export function usePathname(){return '/'};export function useRouter(){return {push:url=>{history.pushState(null,'',url);window.dispatchEvent(new PopStateEvent('popstate'))}}}",
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
        return res.end(process.env.FILTER_QA_CSS ? fs.readFileSync(process.env.FILTER_QA_CSS) : "");
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
    const setup = async (query = "q=lampara&orden=precio_asc&page=2") => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      const p = await context.newPage();
      p.setDefaultTimeout(10000);
      const f = { errors: [], writes: [] };
      p.on("pageerror", (e) => f.errors.push(e.message));
      await p.route("**/api/**", (r) => {
        if (r.request().method() !== "GET") {
          f.writes.push(new URL(r.request().url()).pathname);
          return r.abort();
        }
        return published ? r.continue() : r.fulfill({ status: 200, json: {} });
      });
      await p.goto(`${base}/?${query}`, { waitUntil: "domcontentloaded" });
      return { p, f };
    };
    const open = async (p) => {
      await p.getByRole("button", { name: /^Filtros/ }).click();
      const d = p.getByRole("dialog", { name: "Filtros", exact: true });
      await expect(d).toBeVisible();
      return d;
    };
    const query = (p) => new URL(p.url()).searchParams;
    const safe = (f) => {
      assert.deepEqual(f.errors, []);
      assert.deepEqual(f.writes, []);
    };
    stage = "mobile filter panel is a native modal, traps keyboard focus and restores it on Escape";
    let { p, f } = await setup();
    let d = await open(p);
    assert.equal(await d.evaluate((el) => el.matches(":modal")), true, "dialog must be modal");
    for (let i = 0; i < 18; i++) {
      await p.keyboard.press("Tab");
      const focus = await d.evaluate((el) => ({
        inside: el.contains(document.activeElement),
        tag: document.activeElement?.tagName,
        text: document.activeElement?.textContent?.slice(0, 60),
      }));
      assert.equal(
        focus.inside || focus.tag === "BODY",
        true,
        `tab ${i}: ${JSON.stringify(focus)}`,
      );
    }
    // Chromium may move Tab to browser chrome (BODY), but never to an inert page control.
    assert.equal(
      await d.evaluate((el) => {
        const outside = [...document.querySelectorAll("a,button,input,select")].find(
          (n) => !el.contains(n) && n.getClientRects().length,
        );
        if (!outside) return true;
        outside.focus();
        return document.activeElement !== outside;
      }),
      true,
    );
    await p.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
    await expect(p.getByRole("button", { name: /^Filtros/ })).toBeFocused();
    safe(f);
    pass();
    stage = "close button restores focus without navigating";
    const initial = p.url();
    d = await open(p);
    await d.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(d).toHaveCount(0);
    assert.equal(p.url(), initial);
    await expect(p.getByRole("button", { name: /^Filtros/ })).toBeFocused();
    safe(f);
    pass();
    for (const value of ["-1", "1e2", "1.001"]) {
      stage = `invalid price ${value} stays editable and never changes the URL`;
      ({ p, f } = await setup());
      d = await open(p);
      const before = p.url();
      await d.getByLabel("Precio mínimo", { exact: true }).fill(value);
      await d.getByRole("button", { name: "Aplicar rango de precio", exact: true }).click();
      await expect(d.getByRole("alert")).toContainText("dos decimales");
      await expect(d.getByLabel("Precio mínimo", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      assert.equal(p.url(), before);
      safe(f);
      pass();
    }
    stage = "inverted range is explained without closing the panel or losing input";
    ({ p, f } = await setup());
    d = await open(p);
    await d.getByLabel("Precio mínimo", { exact: true }).fill("100");
    await d.getByLabel("Precio máximo", { exact: true }).fill("50");
    await d.getByRole("button", { name: "Aplicar rango de precio", exact: true }).click();
    await expect(d.getByRole("alert")).toContainText("máximo");
    await expect(d.getByLabel("Precio mínimo", { exact: true })).toHaveValue("100");
    assert.equal(query(p).get("precioMin"), null);
    safe(f);
    pass();
    stage = "valid comma prices preserve search/sort and reset pagination";
    await d.getByLabel("Precio mínimo", { exact: true }).fill("10,50");
    await d.getByLabel("Precio máximo", { exact: true }).fill("20,75");
    await d.getByRole("button", { name: "Aplicar rango de precio", exact: true }).click();
    await expect.poll(() => query(p).get("precioMax")).toBe("20.75");
    assert.equal(query(p).get("precioMin"), "10.5");
    assert.equal(query(p).get("q"), "lampara");
    assert.equal(query(p).get("orden"), "precio_asc");
    assert.equal(query(p).get("page"), null);
    await expect(d).toHaveCount(0);
    safe(f);
    pass();
    stage = "zero is retained as a real upper-bound filter";
    ({ p, f } = await setup());
    d = await open(p);
    await d.getByLabel("Precio máximo", { exact: true }).fill("0");
    await d.getByRole("button", { name: "Aplicar rango de precio", exact: true }).click();
    await expect.poll(() => query(p).get("precioMax")).toBe("0");
    safe(f);
    pass();
    stage = "removing the price chip retains other filters and resets page";
    ({ p, f } = await setup("q=lampara&orden=precio_asc&precioMin=10&precioMax=1000&page=2"));
    await p.getByRole("button", { name: "Quitar filtro $10 – $1000", exact: true }).click();
    await expect.poll(() => query(p).get("precioMin")).toBe(null);
    assert.equal(query(p).get("precioMax"), null);
    assert.equal(query(p).get("q"), "lampara");
    assert.equal(query(p).get("orden"), "precio_asc");
    assert.equal(query(p).get("page"), null);
    safe(f);
    pass();
    stage = "false offer/stock flags produce no misleading active chip";
    ({ p, f } = await setup("q=lampara&soloOfertas=false&soloDisponibles=false"));
    assert.equal(
      await p.getByRole("button", { name: "Quitar filtro Ofertas", exact: true }).count(),
      0,
    );
    assert.equal(
      await p.getByRole("button", { name: "Quitar filtro En stock", exact: true }).count(),
      0,
    );
    safe(f);
    pass();
    stage = "clearing filters preserves sort order and resets pagination";
    ({ p, f } = await setup("q=lampara&orden=precio_desc&precioMin=10&soloOfertas=true&page=2"));
    d = await open(p);
    await d.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
    await expect.poll(() => query(p).get("q")).toBe(null);
    assert.equal(query(p).get("precioMin"), null);
    assert.equal(query(p).get("soloOfertas"), null);
    assert.equal(query(p).get("orden"), "precio_desc");
    assert.equal(query(p).get("page"), null);
    safe(f);
    pass();
    stage = "resizing to desktop closes the modal instead of leaving an invisible focus trap";
    ({ p, f } = await setup());
    d = await open(p);
    await p.setViewportSize({ width: 1280, height: 900 });
    await expect(d).toHaveCount(0);
    assert.equal(await p.evaluate(() => document.querySelector("dialog:modal") === null), true);
    safe(f);
    pass();
    stage =
      "a new sort navigation clears an unapplied price draft even when URL prices stay the same";
    ({ p, f } = await setup("q=lampara&precioMin=10&precioMax=1000&orden=precio_asc"));
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.getByLabel("Precio mínimo", { exact: true }).fill("900");
    await p
      .getByRole("combobox", { name: "Ordenar productos", exact: true })
      .selectOption("precio_desc");
    await expect.poll(() => query(p).get("orden")).toBe("precio_desc");
    await expect(p.getByLabel("Precio mínimo", { exact: true })).toHaveValue("10");
    assert.equal(query(p).get("q"), "lampara");
    safe(f);
    pass();
    stage = "back navigation restores applied price inputs rather than an abandoned draft";
    ({ p, f } = await setup("q=lampara&precioMin=10&precioMax=1000"));
    d = await open(p);
    await d.getByLabel("Precio mínimo", { exact: true }).fill("20");
    await d.getByLabel("Precio máximo", { exact: true }).fill("900");
    await d.getByRole("button", { name: "Aplicar rango de precio", exact: true }).click();
    await expect.poll(() => query(p).get("precioMin")).toBe("20");
    await p.goBack({ waitUntil: "domcontentloaded" });
    d = await open(p);
    await expect(d.getByLabel("Precio mínimo", { exact: true })).toHaveValue("10");
    await expect(d.getByLabel("Precio máximo", { exact: true })).toHaveValue("1000");
    safe(f);
    pass();
    stage = "320px dialog has no horizontal overflow and usable 44px apply/close targets";
    await p.setViewportSize({ width: 320, height: 740 });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      "mobile catalog must not overflow horizontally",
    );
    assert.equal(await d.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    for (const name of ["Aplicar rango de precio", "Cerrar"]) {
      const size = await d.getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(size.height >= 44 && size.width >= 44);
    }
    await p.screenshot({
      path: `/tmp/gaes-catalog-filters-${published ? "published" : "local"}.png`,
      fullPage: false,
    });
    safe(f);
    pass();
    if (!published) {
      stage = "failure-state filter panel stays operable without claiming zero results";
      ({ p, f } = await setup());
      await p.evaluate(() => window.setFilterTotal(null));
      d = await open(p);
      await expect(d.getByRole("button", { name: "Cerrar filtros", exact: true })).toBeVisible();
      await d.getByLabel("Precio mínimo", { exact: true }).fill("25");
      await d.getByRole("button", { name: "Aplicar rango de precio", exact: true }).click();
      await expect.poll(() => query(p).get("precioMin")).toBe("25");
      safe(f);
      pass();
      stage = "pagination keeps filter context, marks the active page and has 44px links";
      ({ p, f } = await setup("q=lampara&precioMin=10&orden=precio_asc&page=2"));
      const nav = p.getByRole("navigation", { name: "Páginas del catálogo", exact: true });
      await expect(nav.getByRole("link", { name: "2", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      const href = await nav
        .getByRole("link", { name: "Siguiente →", exact: true })
        .getAttribute("href");
      const sp = new URL(href, base).searchParams;
      assert.equal(sp.get("q"), "lampara");
      assert.equal(sp.get("precioMin"), "10");
      assert.equal(sp.get("orden"), "precio_asc");
      assert.equal(sp.get("page"), "3");
      for (const link of await nav.getByRole("link").all()) {
        const size = await link.boundingBox();
        assert.ok(size.height >= 44 && size.width >= 44);
      }
      safe(f);
      pass();
    } else {
      stage = "a real invalid catalog query retains mobile filters and can be repaired";
      ({ p, f } = await setup("q=lampara&precioMin=-1"));
      await expect(
        p.getByRole("heading", { name: "No se pudo cargar el catálogo", exact: true }),
      ).toBeVisible();
      d = await open(p);
      await expect(d.getByRole("button", { name: "Cerrar filtros", exact: true })).toBeVisible();
      await d.getByLabel("Precio mínimo", { exact: true }).fill("0");
      await d.getByRole("button", { name: "Aplicar rango de precio", exact: true }).click();
      await expect.poll(() => query(p).get("precioMin")).toBe("0");
      await expect(
        p.getByRole("heading", { name: "No se pudo cargar el catálogo", exact: true }),
      ).toHaveCount(0);
      safe(f);
      pass();
      stage = "unsafe manual page values are normalized without a catalog error";
      ({ p, f } = await setup("page=Infinity"));
      await expect(
        p.getByRole("heading", { name: "No se pudo cargar el catálogo", exact: true }),
      ).toHaveCount(0);
      await expect(p.getByRole("article").first()).toBeVisible();
      safe(f);
      pass();
    }
    console.log(
      `PASS ${groups} ${published ? "published" : "local"} filter groups; read-only browsing, no cart writes or orders`,
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
