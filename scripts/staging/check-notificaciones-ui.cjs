/** Real notification bell/dialog, local synthetic responses only. No messages or email. */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const app = path.join(process.cwd(), "apps/web-tienda");
const esbuild = require(
  require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
);
const notice = {
  id: "QA /1",
  tipo: "pedido",
  titulo: "Pedido QA",
  cuerpo: "Estado actualizado",
  link: "/cuenta/pedidos/QA",
  leida: false,
  createdAt: "2026-10-17T12:00:00Z",
};
const snapshot = (count = 12) => ({ items: [notice], noLeidas: count });
(async () => {
  const bundle = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      resolveDir: app,
      loader: "tsx",
      contents:
        "import {useState} from 'react';import {createRoot} from 'react-dom/client';import {NotificacionesCliente} from './src/components/notificaciones-cliente';function QA(){const [owner,setOwner]=useState('qa-a');window.switchOwner=setOwner;return <NotificacionesCliente key={owner}/>};createRoot(document.getElementById('root')).render(<QA/>);",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "qa-next-link",
        setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, (args) => ({
            path: args.path,
            namespace: "qa-next",
          }));
          build.onLoad({ filter: /.*/, namespace: "qa-next" }, () => ({
            loader: "js",
            resolveDir: app,
            contents:
              "import {createElement} from 'react';export default function Link(p){return createElement('a',{...p,onClick(e){e.preventDefault();window.navigated=p.href;p.onClick?.(e)}})}",
          }));
        },
      },
    ],
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("content-type", "application/javascript");
      res.end(bundle.outputFiles[0].contents);
    } else if (req.url === "/styles.css") {
      res.setHeader("content-type", "text/css");
      res.end(
        process.env.NOTIFICACIONES_QA_CSS ? fs.readFileSync(process.env.NOTIFICACIONES_QA_CSS) : "",
      );
    } else if (req.url.startsWith("/api/")) {
      res.statusCode = 500;
      res.end("Unmocked request");
    } else
      res.end(
        '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>',
      );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "es-MX",
  });
  let stage = "setup";
  let groups = 0;
  try {
    await context.addInitScript(() => {
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = (ms) => timeout(Math.min(ms, 1000));
      window.sources = [];
      window.EventSource = class {
        constructor() {
          window.sources.push(this);
        }
        close() {
          this.closed = true;
        }
      };
      const interval = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...args) => {
        if (ms === 45000) window.pollNotifications = fn;
        return interval(fn, ms, ...args);
      };
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (window.qaHidden ? "hidden" : "visible"),
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let history = snapshot();
    let readMode = "ok";
    let writeMode = "network";
    let receipt = { ok: true };
    let afterWrite = null;
    let writes = 0;
    let reads = 0;
    let slowReads = 0;
    let epoch = 0;
    await page.route("**/api/**", async (route) => {
      assert.equal(new URL(route.request().url()).origin, base);
      if (route.request().method() === "GET") {
        reads++;
        const response = history;
        const mode = readMode;
        const slow = slowReads-- > 0;
        if (mode === "network") return route.abort();
        if (mode === "malformed") return route.fulfill({ json: {} });
        if (mode === "unauthorized") return route.fulfill({ status: 401, json: {} });
        if (slow) await new Promise((r) => setTimeout(r, 650));
        return route.fulfill({ json: response }).catch(() => {});
      }
      writes++;
      const mode = writeMode;
      const next = afterWrite;
      const owner = epoch;
      if (mode === "network") return route.abort();
      if (mode === "malformed") return route.fulfill({ json: {} });
      if (mode === "unauthorized") return route.fulfill({ status: 401, json: {} });
      if (mode === "timeout") {
        await new Promise((r) => setTimeout(r, 1500));
        return route.fulfill({ json: {} }).catch(() => {});
      }
      if (mode === "delayed") await new Promise((r) => setTimeout(r, 450));
      if (next && epoch === owner) history = next;
      return route
        .fulfill({ json: route.request().url().endsWith("leer-todas") ? { marcadas: 1 } : receipt })
        .catch(() => {});
    });
    const bell = () => page.getByRole("button", { name: /^Notificaciones/ });
    const dialog = () => page.getByRole("dialog", { name: "Notificaciones", exact: true });
    const refresh = () => page.getByRole("button", { name: "Actualizar avisos", exact: true });
    const one = () =>
      page.getByRole("button", { name: "Marcar como leída: Pedido QA", exact: true });
    const all = () => page.getByRole("button", { name: "Marcar todas como leídas", exact: true });
    const pass = (label) => {
      groups++;
      console.log(`PASS ${label}`);
    };
    const open = async () => {
      await page.goto(base);
      await bell().click();
    };
    stage = "failed initial read";
    readMode = "network";
    await open();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.getByText("Sin notificaciones", { exact: true }).count(), 0);
    assert.equal(await all().count(), 0);
    readMode = "ok";
    await refresh().click();
    await expect(one()).toBeEnabled();
    pass("failed initial read is an explicit error, never an empty inbox; manual recovery");
    stage = "paginated unread count";
    await expect(bell()).toHaveAccessibleName("Notificaciones, 12 sin leer");
    await expect(bell().locator("span")).toHaveText("9+");
    pass("badge uses server total even when only one recent unread row is shown");
    for (const failure of ["network", "malformed", "timeout", "unauthorized"]) {
      stage = `single-read ${failure}`;
      writeMode = failure;
      await one().click();
      await page.getByRole("alert").waitFor();
      if (failure === "unauthorized") {
        assert.equal(await page.getByText("Pedido QA", { exact: true }).count(), 0);
        await expect(page.getByRole("link", { name: "Iniciar sesión", exact: true })).toBeVisible();
        assert.equal(await page.evaluate(() => window.sources[0].closed), true);
      } else {
        await expect(bell()).toHaveAccessibleName("Notificaciones, 12 sin leer");
        await expect(one()).toBeDisabled();
        assert.equal(await page.getByText("Leída", { exact: true }).count(), 0);
      }
      readMode = "ok";
      history = snapshot();
      await refresh().click();
      await expect(one()).toBeEnabled();
      pass(
        `${failure}: no unconfirmed decrement; session loss clears private history; verified refresh recovers`,
      );
    }
    stage = "POST followed by failed read";
    writeMode = "ok";
    receipt = { ok: true };
    afterWrite = { items: [{ ...notice, leida: true }], noLeidas: 11 };
    readMode = "network";
    await one().click();
    await page.getByRole("alert").waitFor();
    await expect(bell()).toHaveAccessibleName("Notificaciones, 12 sin leer");
    await expect(one()).toBeDisabled();
    const beforeRetry = writes;
    readMode = "ok";
    await refresh().click();
    await expect(bell()).toHaveAccessibleName("Notificaciones, 11 sin leer");
    await page.getByText("Leída", { exact: true }).waitFor();
    assert.equal(writes, beforeRetry);
    pass(
      "successful write with failed reconciliation keeps stale count flagged; GET recovers without another POST",
    );
    stage = "explicit false result";
    history = snapshot();
    afterWrite = { items: [{ ...notice, leida: true }], noLeidas: 0 };
    receipt = { ok: false };
    await refresh().click();
    await one().click();
    await expect(bell()).toHaveAccessibleName("Notificaciones");
    await page.getByText("Leída", { exact: true }).waitFor();
    pass("ok:false is reconciled with actual state rather than blindly subtracting");
    stage = "mark all concurrency and incoming notification";
    history = snapshot();
    await refresh().click();
    writeMode = "delayed";
    afterWrite = { items: [{ ...notice, id: "new", titulo: "Nuevo aviso" }], noLeidas: 1 };
    const beforeAll = writes;
    await all().evaluate((b) => {
      b.click();
      b.click();
      b.click();
    });
    await expect(bell()).toHaveAccessibleName("Notificaciones, 1 sin leer");
    assert.equal(writes - beforeAll, 1);
    await page.getByText("Nuevo aviso", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      "Actualizar avisos",
    );
    pass(
      "one mark-all request despite repeated clicks; new unread notification survives and keyboard focus recovers",
    );
    stage = "delayed history cannot overwrite write";
    writeMode = "ok";
    receipt = { ok: true };
    history = snapshot();
    await refresh().click();
    await expect(one()).toBeEnabled();
    slowReads = 1;
    afterWrite = { items: [{ ...notice, leida: true }], noLeidas: 0 };
    await page.evaluate(() => {
      window.sources.at(-1).onmessage();
      document.querySelector('button[aria-label="Marcar como leída: Pedido QA"]').click();
    });
    await expect(bell()).toHaveAccessibleName("Notificaciones");
    await page.getByText("Leída", { exact: true }).waitFor();
    await page.waitForTimeout(750);
    assert.equal(await one().count(), 0);
    pass("old in-flight GET cannot resurrect unread state after a confirmed write");
    stage = "SSE/poll and hidden tab";
    history = { items: [{ ...notice, titulo: "SSE nuevo" }], noLeidas: 2 };
    await page.evaluate(() => window.sources.at(-1).onmessage());
    await page.getByText("SSE nuevo", { exact: true }).waitFor();
    history = { items: [{ ...notice, titulo: "Polling nuevo" }], noLeidas: 3 };
    await page.evaluate(() => window.pollNotifications());
    await page.getByText("Polling nuevo", { exact: true }).waitFor();
    await page.evaluate(() => {
      window.qaHidden = true;
    });
    const hiddenReads = reads;
    await page.evaluate(() => window.pollNotifications());
    await page.waitForTimeout(100);
    assert.equal(reads, hiddenReads);
    await page.evaluate(() => {
      window.qaHidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(refresh()).toBeEnabled();
    pass("SSE and fallback refresh; hidden tabs do not poll and visibility restores updates");
    stage = "navigation links";
    history = {
      items: [
        { ...notice, link: "javascript:alert(1)" },
        { ...notice, id: "external", link: "https://other.invalid/" },
        { ...notice, id: "valid", titulo: "Pedido seguro", link: "/cuenta/pedidos/QA?x=1#detalle" },
      ],
      noLeidas: 3,
    };
    await refresh().click();
    const links = dialog().getByRole("link");
    assert.equal(await links.count(), 1);
    await expect(links).toHaveAttribute("href", "/cuenta/pedidos/QA?x=1#detalle");
    const beforeNavigation = writes;
    await links.click();
    assert.equal(writes, beforeNavigation);
    pass(
      "unsafe/external links are not actionable; viewing a detail is separate from marking as read",
    );
    stage = "owner switch during write";
    history = snapshot();
    await refresh().click();
    await expect(one()).toHaveCount(1);
    await expect(one()).toBeEnabled();
    writeMode = "delayed";
    afterWrite = { items: [{ ...notice, titulo: "OLD PRIVATE NOTICE" }], noLeidas: 0 };
    const pending = page.waitForRequest((r) => r.method() === "POST");
    await one().click();
    await pending;
    epoch++;
    history = { items: [], noLeidas: 0 };
    await page.evaluate(() => window.switchOwner("qa-b"));
    await bell().click();
    await page.getByText("Sin notificaciones", { exact: true }).waitFor();
    await page.waitForTimeout(650);
    assert.equal(await page.getByText("OLD PRIVATE NOTICE", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.sources.at(-2).closed), true);
    pass("owner switch clears old history, aborts the write and closes the previous stream");
    stage = "responsive accessible dialog";
    history = {
      items: [{ ...notice, titulo: `Aviso${"largo".repeat(50)}`, cuerpo: "texto".repeat(200) }],
      noLeidas: 12,
    };
    await refresh().click();
    await page.getByText(`Aviso${"largo".repeat(50)}`, { exact: true }).waitFor();
    if (process.env.NOTIFICACIONES_QA_CSS) {
      fs.mkdirSync("/tmp/gaes-notificaciones", { recursive: true, mode: 0o700 });
      for (const [width, height] of [
        [320, 420],
        [390, 844],
        [1280, 800],
      ]) {
        await page.setViewportSize({ width, height });
        const layout = await dialog().evaluate((n) => ({
          width: n.getBoundingClientRect().width,
          scroll: n.scrollWidth,
          client: n.clientWidth,
        }));
        assert(layout.width <= width && layout.scroll <= layout.client);
        for (const target of [
          bell(),
          refresh(),
          all(),
          page.getByRole("button", { name: "Cerrar", exact: true }),
        ])
          assert((await target.boundingBox()).height >= 44);
        const recent = dialog().getByRole("list", { name: "Avisos recientes", exact: true });
        await recent.evaluate((n) => {
          n.scrollTop = n.scrollHeight;
        });
        for (const target of [
          refresh(),
          all(),
          page.getByRole("button", { name: "Cerrar", exact: true }),
        ]) {
          const box = await target.boundingBox();
          assert(box.y >= 0 && box.y + box.height <= height);
        }
        await recent.evaluate((n) => {
          n.scrollTop = 0;
        });
        await page.screenshot({ path: `/tmp/gaes-notificaciones/avisos-${width}.png` });
      }
    }
    await page.getByRole("button", { name: "Cerrar", exact: true }).focus();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const focus = await dialog().evaluate((n) => ({
        inside: n.contains(document.activeElement),
        tag: document.activeElement?.tagName,
      }));
      // Native dialogs permit moving to browser chrome; outside app controls must stay unreachable.
      assert(focus.inside || focus.tag === "BODY" || focus.tag === "HTML");
    }
    await page.getByRole("button", { name: "Cerrar", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(dialog()).toHaveCount(0);
    assert.equal(await bell().evaluate((n) => document.activeElement === n), true);
    assert.deepEqual(errors, []);
    pass("320/390/1280px layouts, 44px controls, keyboard navigation, Escape and return to bell");
    console.log(
      `PASS ${groups} browser groups; synthetic notification data, no real read markers changed`,
    );
  } catch (e) {
    console.error(`FAIL ${stage}: ${e.stack}`);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
