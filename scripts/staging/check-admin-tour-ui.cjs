/** Actual Tour + product form with synthetic catalog responses; no remote or business writes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const esbuild = require("esbuild");
(async () => {
  const app = path.join(process.cwd(), "apps/web-admin");
  const bundle = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      resolveDir: app,
      loader: "tsx",
      contents: `import {useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {Tour} from './src/components/Tour';import {ProductosPage} from './src/pages/ProductosPage';function QA(){const[section,setSection]=useState('productos');useEffect(()=>{const h=e=>setSection(e.detail);window.addEventListener('gaes-nav',h);return()=>window.removeEventListener('gaes-nav',h)},[]);return <><nav><button data-tour="nav-productos" onClick={()=>setSection('productos')}>Productos</button><button data-tour="nav-inicio" onClick={()=>setSection('inicio')}>Inicio</button><button data-tour="nav-ayuda" onClick={()=>setSection('ayuda')}>Ayuda</button></nav>{section==='productos'?<ProductosPage/>:<p>{section}</p>}<Tour/></>};createRoot(document.getElementById('root')).render(<QA/>);`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const stylesDir = path.join(app, "dist/assets");
  const styles = fs.readFileSync(
    path.join(
      stylesDir,
      fs.readdirSync(stylesDir).find((name) => name.endsWith(".css")),
    ),
  );
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("content-type", "application/javascript");
      return res.end(bundle.outputFiles[0].contents);
    }
    if (req.url === "/style.css") {
      res.setHeader("content-type", "text/css");
      return res.end(styles);
    }
    res.end(
      '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  let groups = 0;
  const errors = [];
  const contexts = [];
  let unexpectedWrites = 0;
  let diagnosticPage;
  let diagnosticState;
  async function setup(seen = false) {
    const context = await browser.newContext();
    contexts.push(context);
    await context.addInitScript((seen) => {
      localStorage.setItem("gaespos_admin_permisos", JSON.stringify(["*"]));
      if (seen) localStorage.setItem("gaes_tour_seen_bienvenida", "1");
    }, seen);
    const state = { products: [], writes: [] };
    await context.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (request.method() !== "GET") {
        if (url.pathname !== "/api/t/productos" || request.method() !== "POST") {
          unexpectedWrites++;
          return route.abort();
        }
        const body = request.postDataJSON();
        state.writes.push(body);
        const product = {
          ...body,
          id: "synthetic-product",
          variantes: [{ id: "synthetic-variant", sku: body.skuPadre, precioBase: body.precioBase }],
        };
        state.products.push(product);
        return route.fulfill({ json: product });
      }
      if (url.pathname === "/api/t/productos")
        return route.fulfill({ json: { items: state.products, total: state.products.length } });
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    diagnosticPage = page;
    diagnosticState = state;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-10-18T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-18T00:00:00Z"));
    await page.goto(base);
    await page.getByRole("button", { name: /Nuevo producto/ }).waitFor();
    return { page, state };
  }
  const welcome = (page) => page.locator('[aria-label="Recorrido de bienvenida"]');
  const manual = (page) => page.locator('[aria-label="Crear tu primer producto"]');
  const launch = (page) =>
    page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("gaes-tour", { detail: "crear-producto" })),
    );
  async function check(name, run) {
    try {
      await run();
    } catch (error) {
      console.error(
        JSON.stringify({
          name,
          body: await diagnosticPage.locator("body").innerText(),
          state: diagnosticState,
        }),
      );
      throw error;
    }
    groups++;
    console.log(`PASS ${name}`);
  }
  try {
    await check("idle user receives welcome at the original 900ms deadline", async () => {
      const { page } = await setup();
      await page.clock.fastForward(899);
      assert.equal(await welcome(page).count(), 0);
      await page.clock.fastForward(1);
      await welcome(page).waitFor();
    });
    for (const event of ["pointerdown", "keydown"]) {
      await check(
        `${event} in capture cancels auto welcome without consuming the interaction`,
        async () => {
          const { page } = await setup();
          await page.clock.fastForward(400);
          await page.locator('[data-tour="prod-nuevo"]').evaluate((button, event) => {
            button.addEventListener(
              event,
              (e) => {
                e.stopPropagation();
                window.qaInteractionSeen = true;
              },
              { once: true },
            );
            button.dispatchEvent(
              event === "pointerdown"
                ? new PointerEvent(event, { bubbles: true })
                : new KeyboardEvent(event, { key: "Enter", bubbles: true }),
            );
          }, event);
          await page.clock.fastForward(1500);
          assert.equal(await welcome(page).count(), 0);
          assert.equal(await page.evaluate(() => window.qaInteractionSeen), true);
        },
      );
    }
    await check(
      "manual tour before deadline stays selected and is not replaced by welcome",
      async () => {
        const { page } = await setup();
        await launch(page);
        await manual(page).waitFor();
        await page.clock.fastForward(1500);
        await manual(page).waitFor();
        assert.equal(await welcome(page).count(), 0);
      },
    );
    await check("programmatic navigation cancels pending welcome", async () => {
      const { page } = await setup();
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent("gaes-nav", { detail: "productos" })),
      );
      await page.clock.fastForward(1500);
      assert.equal(await welcome(page).count(), 0);
    });
    await check("manual tour remains available after welcome was seen", async () => {
      const { page } = await setup(true);
      await page.clock.fastForward(1500);
      assert.equal(await welcome(page).count(), 0);
      await launch(page);
      await manual(page).waitFor();
    });
    await check(
      "closing a tour preserves an existing product form and its entered fields",
      async () => {
        const { page } = await setup();
        await page.locator('[data-tour="prod-nuevo"]').evaluate((button) => {
          button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          button.click();
        });
        await page.clock.resume();
        await page.getByLabel("Nombre *", { exact: true }).fill("Formulario del usuario");
        await page.getByLabel("SKU / código de barras *", { exact: true }).fill("SKU-EXISTENTE");
        await launch(page);
        await manual(page).waitFor();
        await page.getByRole("button", { name: "Salir ✕", exact: true }).click();
        assert.equal(
          await page.getByLabel("Nombre *", { exact: true }).inputValue(),
          "Formulario del usuario",
        );
        assert.equal(
          await page.getByLabel("SKU / código de barras *", { exact: true }).inputValue(),
          "SKU-EXISTENTE",
        );
      },
    );
    await check("closing a tour leaves the product form it opened available", async () => {
      const { page } = await setup();
      await launch(page);
      await page.clock.resume();
      await page.getByRole("button", { name: "Siguiente →", exact: true }).click();
      await page.getByRole("button", { name: "Siguiente →", exact: true }).click();
      await page.getByLabel("Nombre *", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Salir ✕", exact: true }).click();
      await page.getByLabel("Nombre *", { exact: true }).fill("Formulario conservado");
      assert.equal(
        await page.getByLabel("Nombre *", { exact: true }).inputValue(),
        "Formulario conservado",
      );
    });
    await check(
      "SKU/SAT product creation stays usable beyond welcome deadline and preserves submitted keys",
      async () => {
        const { page, state } = await setup();
        await page.clock.fastForward(400);
        await page.locator('[data-tour="prod-nuevo"]').evaluate((button) => {
          button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          button.click();
        });
        await page.clock.resume();
        await page.getByLabel("Nombre *", { exact: true }).fill("Producto SAT QA");
        await page.getByLabel("Precio de venta (IVA incluido) *", { exact: true }).fill("99.00");
        await page.getByLabel("SKU / código de barras *", { exact: true }).fill("QA-SAT-50181900");
        assert.equal(
          await page.getByRole("combobox", { name: "Unidad", exact: true }).inputValue(),
          "H87",
        );
        await page.getByLabel("Clave del producto").fill("50181900");
        await page.clock.fastForward(1500);
        assert.equal(await welcome(page).count(), 0);
        await page.getByRole("button", { name: "Guardar", exact: true }).click();
        await page.getByText("Producto SAT QA", { exact: true }).waitFor();
        assert.equal(state.writes.length, 1);
        assert.equal(state.writes[0].skuPadre, "QA-SAT-50181900");
        assert.equal(state.writes[0].claveSat, "50181900");
        assert.equal(state.writes[0].claveUnidadSat, "H87");
      },
    );
    assert.equal(unexpectedWrites, 0);
    assert.deepEqual(errors, []);
    console.log(
      `${groups} Tour browser groups passed; actual product form, controlled original deadline; synthetic catalog only, 0 remote writes and 0 JavaScript errors.`,
    );
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
