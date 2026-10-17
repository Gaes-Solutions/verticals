/** Real forms, synthetic accounts/receipts and local HTTP fixtures only. No external writes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
let stage = "setup";
(async () => {
  const app = path.join(process.cwd(), "apps/web-tienda");
  const esbuild = require(
    require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
  );
  const bundle = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      resolveDir: app,
      loader: "tsx",
      contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {AvisoStock} from './src/components/aviso-stock';import {PreguntasProducto} from './src/components/preguntas-producto';function QA(){const [view,setView]=useState('stock');const [id,setId]=useState('qa-product');window.switchView=setView;window.switchProduct=setId;return view==='stock'?<AvisoStock productoPublicadoId={id}/>:<PreguntasProducto productoPublicadoId={id} preguntas={[{id:'qa-public',pregunta:'¿Tiene garantía?',respuesta:'Consulta la garantía publicada por la tienda.'}]}/>};const root=createRoot(document.getElementById('root'));window.unmountForm=()=>root.unmount();root.render(<QA/>);`,
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
                : "export function usePathname(){return '/producto/qa-product'}",
          }));
        },
      },
    ],
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("content-type", "application/javascript");
      return res.end(bundle.outputFiles[0].contents);
    }
    if (req.url === "/styles.css") {
      res.setHeader("content-type", "text/css");
      return res.end(
        process.env.PRODUCT_FORMS_QA_CSS ? fs.readFileSync(process.env.PRODUCT_FORMS_QA_CSS) : "",
      );
    }
    res.end(
      '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let activePage;
  let diagnostic;
  const browser = await chromium.launch();
  let context;
  let groups = 0;
  try {
    const pass = () => {
      groups++;
      console.log(`PASS ${stage}`);
    };
    const setup = async (view = "stock", ownerMode = "ok") => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      await context.addInitScript(() => {
        const timeout = AbortSignal.timeout.bind(AbortSignal);
        AbortSignal.timeout = (ms) => timeout(ms === 20000 && window.qaFastDeadline ? 500 : ms);
      });
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      activePage = page;
      const f = {
        mode: "ok",
        ownerMode,
        owner: "qa-owner-a",
        posts: [],
        rows: new Map(),
        release: null,
        errors: [],
      };
      diagnostic = f;
      page.on("pageerror", (e) => f.errors.push(e.message));
      await page.route("**/api/**", async (route) => {
        const req = route.request();
        const pathname = new URL(req.url()).pathname;
        if (req.method() === "GET") {
          assert(pathname.endsWith("/preguntas"));
          if (f.ownerMode === "guest") return route.fulfill({ status: 401, json: {} });
          if (f.ownerMode === "error") return route.fulfill({ status: 503, json: {} });
          return route.fulfill({ json: { clienteId: f.owner, tenantSlug: "qa-store" } });
        }
        assert.equal(req.method(), "POST");
        const body = req.postDataJSON();
        f.posts.push({ pathname, body });
        const mode = f.mode;
        const rowKey = pathname.endsWith("/preguntas")
          ? body.solicitudId
          : `${body.productoPublicadoId}:${body.email.toLowerCase()}`;
        if (!["rejected", "limited", "session"].includes(mode)) f.rows.set(rowKey, body);
        if (mode === "delayed")
          await new Promise((r) => {
            f.release = r;
          });
        if (mode === "timeout") await new Promise((r) => setTimeout(r, 1200));
        if (mode === "network") return route.abort().catch(() => {});
        const success = pathname.endsWith("/preguntas") ? { id: body.solicitudId } : { ok: true };
        const options =
          mode === "malformed"
            ? { contentType: "application/json", body: "broken" }
            : mode === "wrong"
              ? { json: pathname.endsWith("/preguntas") ? { id: "other-id" } : { ok: "true" } }
              : mode === "uncertain"
                ? { status: 503, json: { message: "PRIVATE" } }
                : mode === "limited"
                  ? { status: 429, json: {} }
                  : mode === "session"
                    ? { status: 401, json: {} }
                    : mode === "rejected"
                      ? { status: 422, json: { message: "PRIVATE" } }
                      : { json: success, status: 201 };
        return route.fulfill(options).catch(() => {});
      });
      await page.goto(base);
      if (view === "question") await page.evaluate(() => window.switchView("question"));
      const input = page.getByLabel(view === "stock" ? "Tu correo" : "Pregunta", { exact: true });
      if (ownerMode === "ok") await expect(input).toBeEditable();
      const initialText =
        view === "stock" ? "Qa@Example.invalid" : "¿Cuál es el material de este producto?";
      const fill = () => input.fill(initialText);
      const send = () =>
        page.getByRole("button", { name: view === "stock" ? "Avísame" : "Preguntar", exact: true });
      const retry = () =>
        page.getByRole("button", {
          name: view === "stock" ? "Reintentar aviso" : "Reintentar esta pregunta",
          exact: true,
        });
      return { page, f, input, fill, send, retry, initialText };
    };
    for (const view of ["stock", "question"]) {
      stage = `${view}: confirmed receipt, single synchronous submission and visible success`;
      let t = await setup(view);
      await t.fill();
      t.f.mode = "delayed";
      await t.send().evaluate((b) => {
        b.click();
        b.click();
      });
      await expect.poll(() => t.f.posts.length).toBe(1);
      await expect(t.input).toHaveAttribute("readonly", "");
      t.f.release();
      await expect(t.page.getByRole("status")).toContainText(
        view === "stock" ? "Aviso registrado" : "Tu pregunta quedó registrada",
      );
      assert.equal(t.f.rows.size, 1);
      assert.deepEqual(t.f.errors, []);
      pass();
      for (const mode of ["network", "timeout", "malformed", "wrong", "uncertain"]) {
        stage = `${view}: ${mode} retains data, explicit same-request retry and confirmed recovery`;
        t = await setup(view);
        await t.fill();
        t.f.mode = mode;
        if (mode === "timeout")
          await t.page.evaluate(() => {
            window.qaFastDeadline = true;
          });
        await t.send().click();
        await expect(t.page.getByRole("alert")).toBeVisible();
        await expect(t.input).toHaveValue(t.initialText);
        await expect(t.input).toHaveAttribute("readonly", "");
        await expect(t.page.getByRole("status")).toHaveCount(0);
        assert.equal(t.f.posts.length, 1);
        assert.equal(t.f.rows.size, 1);
        t.f.mode = "ok";
        await t.page.evaluate(() => {
          window.qaFastDeadline = false;
        });
        await t.retry().click();
        await expect(t.page.getByRole("status")).toContainText(
          view === "stock" ? "Aviso registrado" : "Tu pregunta quedó registrada",
        );
        assert.equal(t.f.posts.length, 2);
        assert.deepEqual(t.f.posts[1].body, t.f.posts[0].body);
        assert.equal(t.f.rows.size, 1);
        assert.deepEqual(t.f.errors, []);
        pass();
      }
      for (const mode of ["limited", "rejected"]) {
        stage = `${view}: ${mode} preserves editable input and redacts server details`;
        t = await setup(view);
        await t.fill();
        t.f.mode = mode;
        await t.send().click();
        await expect(t.page.getByRole("alert")).toBeVisible();
        await expect(t.input).toBeEditable();
        await expect(t.page.locator("body")).not.toContainText("PRIVATE");
        await expect(t.input).toHaveValue(t.initialText);
        assert.equal(t.f.rows.size, 0);
        pass();
      }
      stage = `${view}: changing product resets draft/success and ignores an old pending response`;
      t = await setup(view);
      await t.fill();
      t.f.mode = "delayed";
      await t.send().click();
      await expect.poll(() => t.f.posts.length).toBe(1);
      await t.page.evaluate(() => window.switchProduct("qa-other-product"));
      await expect(t.input).toBeEditable();
      await expect(t.input).toHaveValue("");
      t.f.release();
      await t.page.waitForTimeout(150);
      await expect(t.page.getByRole("status")).toHaveCount(0);
      assert.deepEqual(t.f.errors, []);
      pass();
      stage = `${view}: unmount aborts an in-flight form without an unhandled error`;
      t = await setup(view);
      await t.fill();
      t.f.mode = "delayed";
      await t.send().click();
      await expect.poll(() => t.f.posts.length).toBe(1);
      await t.page.evaluate(() => window.unmountForm());
      t.f.release();
      await t.page.waitForTimeout(150);
      assert.deepEqual(t.f.errors, []);
      pass();
      stage = `${view}: narrow layout and accessible 44px controls`;
      t = await setup(view);
      await t.page.setViewportSize({ width: 320, height: 700 });
      await t.fill();
      assert(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      for (const c of [t.input, t.send()]) assert((await c.boundingBox()).height >= 44);
      if (process.env.PRODUCT_FORMS_QA_CSS)
        await t.page.screenshot({ path: `/tmp/gaes-product-${view}.png`, fullPage: true });
      pass();
    }
    stage = "question: guest gets a return-to-product login link and can read public answers";
    let t = await setup("question", "guest");
    await expect(
      t.page.getByRole("link", { name: "Iniciar sesión para preguntar" }),
    ).toHaveAttribute("href", "/cuenta/login?next=%2Fproducto%2Fqa-product");
    await expect(t.input).toBeHidden();
    await expect(t.page.getByText("P: ¿Tiene garantía?", { exact: true })).toBeVisible();
    assert.equal(t.f.posts.length, 0);
    pass();
    stage = "question: identity failure keeps the form hidden until a verified account returns";
    t = await setup("question", "error");
    await expect(t.page.getByRole("button", { name: "Verificar sesión" })).toBeVisible();
    await expect(t.input).toBeHidden();
    t.f.ownerMode = "ok";
    await t.page.getByRole("button", { name: "Verificar sesión" }).click();
    await expect(t.input).toBeEditable();
    pass();
    stage = "question: same-account verification preserves a draft; another account clears it";
    t = await setup("question");
    await t.fill();
    t.f.ownerMode = "error";
    await t.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(t.page.getByRole("button", { name: "Verificar sesión" })).toBeVisible();
    await expect(t.input).toBeHidden();
    t.f.ownerMode = "ok";
    await t.page.getByRole("button", { name: "Verificar sesión" }).click();
    await expect(t.input).toHaveValue(t.initialText);
    t.f.owner = "qa-owner-b";
    await t.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(t.input).toHaveValue("");
    assert.equal(t.f.posts.length, 0);
    pass();
    stage =
      "question: invalid length sends no request and confirmation allows a deliberate new question";
    t = await setup("question");
    await t.input.fill("tiny");
    await t.send().click();
    await expect(t.page.getByRole("alert")).toContainText("5 a 500");
    assert.equal(t.f.posts.length, 0);
    await t.fill();
    await t.send().click();
    await expect(t.page.getByRole("status")).toContainText("registrada");
    const firstKey = t.f.posts[0].body.solicitudId;
    await t.page.getByRole("button", { name: "Hacer otra pregunta" }).click();
    await expect(t.input).toHaveValue("");
    await t.fill();
    await t.send().click();
    await expect(t.page.getByRole("status")).toContainText("registrada");
    assert.notEqual(t.f.posts[1].body.solicitudId, firstKey);
    pass();
    console.log(`PASS ${groups} local product-form groups; all mutations simulated`);
  } catch (e) {
    console.error(`FAIL ${stage}: ${e.message}`);
    console.error(await activePage.locator("body").innerText(), diagnostic.errors);
    process.exitCode = 1;
  } finally {
    if (context) await context.close();
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})();
