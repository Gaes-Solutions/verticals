/** Real React component, synthetic HTTP only: never sends a message to staff. */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const app = path.join(process.cwd(), "apps/web-tienda");
const esbuild = require(
  require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
);
(async () => {
  const bundle = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      contents:
        'import {useState} from "react";import {createRoot} from "react-dom/client";import {ChatPedidoCliente} from "./src/components/chat-pedido-cliente";function App(){const [folio,setFolio]=useState("QA-A");window.switchOrder=setFolio;return <ChatPedidoCliente folio={folio}/>};createRoot(document.getElementById("root")).render(<App/>);',
      resolveDir: app,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("content-type", "application/javascript");
      res.end(bundle.outputFiles[0].contents);
    } else if (req.url === "/styles.css") {
      res.setHeader("content-type", "text/css");
      res.end(process.env.CHAT_QA_CSS ? fs.readFileSync(process.env.CHAT_QA_CSS) : "");
    } else if (req.url.startsWith("/api/")) {
      res.statusCode = 500;
      res.end("Unmocked request");
    } else
      res.end(
        '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="max-width:800px;margin:auto"></main><script src="/bundle.js"></script></body></html>',
      );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
  let stage = "setup";
  try {
    await context.addInitScript(() => {
      const deadline = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = (ms) => deadline(Math.min(ms, 1000));
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
        if (ms === 30000) window.chatPoll = fn;
        return interval(fn, ms, ...args);
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    if (process.env.CHAT_QA_DEBUG) {
      page.on("response", (r) => console.log("response", r.status(), new URL(r.url()).pathname));
      page.on("requestfailed", (r) => console.log("requestfailed", r.failure()));
    }
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let history = [];
    let read = "ok";
    let write = "network";
    let posts = 0;
    let gets = 0;
    const row = (id, cuerpo) => ({
      id,
      autorTipo: "cliente",
      cuerpo,
      createdAt: "2026-10-17T12:00:00Z",
      usuario: null,
    });
    await page.route("**/api/**", async (route) => {
      assert.equal(new URL(route.request().url()).origin, base);
      if (route.request().method() === "GET") {
        gets++;
        const mode = read;
        const snapshot = history;
        if (mode === "network") return route.abort();
        if (mode === "malformed") return route.fulfill({ json: {} });
        if (mode === "delayed") await new Promise((r) => setTimeout(r, 500));
        if (mode === "unauthorized") return route.fulfill({ status: 401, json: {} });
        return route.fulfill({ json: snapshot }).catch(() => {});
      }
      posts++;
      const mode = write;
      if (process.env.CHAT_QA_DEBUG) console.log("mock POST", mode);
      if (mode === "network") return route.abort();
      if (mode === "timeout") {
        await new Promise((r) => setTimeout(r, 1500));
        return route.fulfill({ json: {} }).catch(() => {});
      }
      if (mode === "malformed") return route.fulfill({ json: {} });
      if (mode === "unauthorized") return route.fulfill({ status: 401, json: {} });
      if (mode === "delayed") await new Promise((r) => setTimeout(r, 500));
      const message = row(`m${posts}`, route.request().postDataJSON().cuerpo);
      history = [...history, message];
      return route.fulfill({ status: 201, json: message }).catch(() => {});
    });
    const send = () => page.getByRole("button", { name: "Enviar", exact: true });
    const refresh = () => page.getByRole("button", { name: "Actualizar mensajes", exact: true });
    const input = () => page.getByRole("textbox", { name: "Mensaje", exact: true });
    const recover = async () => {
      read = "ok";
      await refresh().click();
      await expect(send()).toBeEnabled();
      await expect(page.getByRole("alert")).toHaveCount(0);
    };
    stage = "failed initial history";
    read = "network";
    await page.goto(base);
    await expect(page.getByRole("alert")).toContainText("cargar");
    assert.equal(await page.getByText(/¿Dudas sobre/).count(), 0);
    await input().fill("Mi borrador");
    await expect(send()).toBeDisabled();
    await recover();
    console.log(
      "PASS failed initial history: explicit error, no false empty thread, manual recovery",
    );
    for (const mode of ["network", "timeout", "malformed", "unauthorized"]) {
      stage = `send ${mode}`;
      write = mode;
      await send().click();
      await expect(page.getByRole("alert")).toContainText(
        mode === "unauthorized" ? "sesión" : "confirmar",
      );
      assert.equal(await input().inputValue(), "Mi borrador");
      await expect(send()).toBeDisabled();
      assert.equal(await page.getByText("Mensaje enviado.", { exact: true }).count(), 0);
      await recover();
      console.log(`PASS ${mode}: draft retained, no false success, history check before retry`);
    }
    stage = "single write and newer draft";
    write = "delayed";
    const before = posts;
    await send().click();
    await input().fill("Siguiente pregunta");
    await page.locator("form").evaluate((f) => {
      for (let i = 0; i < 3; i++)
        f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await page.getByText("Mensaje enviado.", { exact: true }).waitFor();
    assert.equal(posts - before, 1);
    assert.equal(await input().inputValue(), "Siguiente pregunta");
    await expect(page.getByText("Mi borrador", { exact: true })).toBeVisible();
    console.log(
      "PASS one POST despite repeated submit; confirmed bubble appears; newer draft preserved",
    );
    stage = "SSE and fallback";
    history = [...history, row("incoming", "Respuesta de prueba")];
    await page.evaluate(() => window.sources.at(-1).onmessage());
    await page.getByText("Respuesta de prueba", { exact: true }).waitFor();
    history = [...history, row("poll", "Actualización alternativa")];
    await page.evaluate(() => window.chatPoll());
    await page.getByText("Actualización alternativa", { exact: true }).waitFor();
    console.log(
      "PASS SSE refresh and fallback callback load synthetic new history without posting",
    );
    stage = "history failure retains conversation";
    read = "malformed";
    await refresh().click();
    await expect(page.getByRole("alert")).toContainText("cargar");
    await expect(page.getByText("Mi borrador", { exact: true })).toBeVisible();
    await expect(send()).toBeDisabled();
    await recover();
    console.log(
      "PASS malformed refresh preserves existing bubbles and blocks sending until recovered",
    );
    stage = "order navigation race";
    read = "delayed";
    history = [row("old", "PRIVATE OLD ORDER")];
    const oldRequest = page.waitForRequest((r) => r.url().includes("QA-A/mensajes"));
    await refresh().click();
    await oldRequest;
    read = "ok";
    history = [];
    await page.evaluate(() => window.switchOrder("QA-B"));
    await expect(input()).toHaveValue("");
    await expect(page.getByText(/¿Dudas sobre/)).toBeVisible();
    await page.waitForTimeout(700);
    assert.equal(await page.getByText("PRIVATE OLD ORDER", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.sources[0].closed), true);
    console.log(
      "PASS order switch resets draft/history, closes SSE and ignores old in-flight history",
    );
    stage = "mobile layout";
    history = [row("long", "a".repeat(2000))];
    await refresh().click();
    await page.getByText("a".repeat(2000), { exact: true }).waitFor();
    if (process.env.CHAT_QA_CSS) {
      fs.mkdirSync("/tmp/gaes-chat-qa", { recursive: true, mode: 0o700 });
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        for (const button of [send(), refresh()]) assert((await button.boundingBox()).height >= 44);
        await page.screenshot({ path: `/tmp/gaes-chat-qa/chat-${width}.png` });
      }
    }
    assert.equal(await input().getAttribute("maxlength"), "2000");
    assert.deepEqual(errors, []);
    assert(gets >= 10);
    console.log(
      "PASS long messages/2000-character limit; styled 320/390/1280px layout with 44px controls when CSS supplied",
    );
    console.log("PASS 10 browser groups: synthetic responses only; no staff notified");
  } catch (e) {
    console.error(`FAIL ${stage}: ${e.stack}`);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
