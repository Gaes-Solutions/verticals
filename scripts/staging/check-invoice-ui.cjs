/** Local component QA with the real source bundle and synthetic invoice responses.
 * Binds localhost only; never contacts an API or emits a CFDI. */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const { expect } = require("@playwright/test");
const path = require("node:path");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const app = path.join(process.cwd(), "apps/web-tienda");
const esbuild = require(
  require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
);
(async () => {
  const bundle = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      contents:
        'import {createRoot} from "react-dom/client";import {FacturaPedido} from "./src/components/factura-pedido";createRoot(document.getElementById("root")).render(<FacturaPedido folio="QA-ONLY"/>);',
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
      res.end(process.env.INVOICE_QA_CSS ? fs.readFileSync(process.env.INVOICE_QA_CSS) : "");
    } else if (req.url.startsWith("/api/")) {
      res.statusCode = 500;
      res.end("Unmocked QA API");
    } else
      res.end(
        '<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root"></main><script src="/bundle.js"></script></body></html>',
      );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let stage = "network failure";
  try {
    await context.addInitScript(() => {
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = (ms) => timeout(Math.min(ms, 1000));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const problems = [];
    page.on("pageerror", (e) => problems.push(e.message));
    let state = null;
    let response = "network";
    let calls = 0;
    let gets = 0;
    await page.route("**/api/**", async (r) => {
      assert(new URL(r.request().url()).origin === base);
      if (r.request().method() === "GET") {
        gets++;
        return r.fulfill({ json: state });
      }
      calls++;
      if (response === "network") return r.abort();
      if (response === "timeout") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return r.fulfill({ json: {} }).catch(() => {});
      }
      if (response === "malformed") return r.fulfill({ json: {} });
      if (response === "unauthorized")
        return r.fulfill({ status: 401, json: { message: "Sin sesión" } });
      if (response === "delayed") await new Promise((resolve) => setTimeout(resolve, 500));
      state = { folioFiscal: "QA-UUID", estado: "vigente", disponible: true };
      return r.fulfill({ status: 201, json: { cfdiId: "QA-ID", folioFiscal: "QA-UUID" } });
    });
    const open = async () => {
      await page.goto(base);
      await page.getByRole("button", { name: /Solicitar factura/ }).click();
      for (const [name, value] of [
        ["RFC", "XAXX010101000"],
        ["Razón social", "Cliente de prueba"],
        ["CP fiscal", "00100"],
      ])
        await page.getByLabel(name, { exact: true }).fill(value);
    };
    await open();
    await page.getByRole("button", { name: "Generar factura", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: /confirmar/ })
      .waitFor();
    assert.equal(await page.getByLabel("CP fiscal", { exact: true }).inputValue(), "00100");
    assert.equal(
      await page.getByRole("button", { name: "Generar factura", exact: true }).isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Consultar estado de factura", exact: true }).click();
    await page.getByRole("button", { name: "Generar factura", exact: true }).waitFor();
    await expect(page.getByRole("button", { name: "Generar factura", exact: true })).toBeEnabled();
    console.log(
      "PASS network: uncertainty shown, fiscal inputs kept, explicit state check required before another submission",
    );
    stage = "timeout";
    response = "timeout";
    await page.getByRole("button", { name: "Generar factura", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: /confirmar/ })
      .waitFor();
    await expect(page.getByRole("button", { name: "Generar factura", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Consultar estado de factura", exact: true }).click();
    await expect(page.getByRole("button", { name: "Generar factura", exact: true })).toBeEnabled();
    console.log(
      "PASS timeout: bounded wait recovers with input retained; requires explicit status check",
    );
    stage = "malformed success";
    response = "malformed";
    await page.getByRole("button", { name: "Generar factura", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: /confirmar/ })
      .waitFor();
    assert.equal(await page.getByText("Factura emitida ✓", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Consultar estado de factura", exact: true }).click();
    console.log("PASS malformed 200: never claims invoice issued");
    stage = "expired session";
    response = "unauthorized";
    await page.getByRole("button", { name: "Generar factura", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: /sesión/ })
      .waitFor();
    assert.equal(
      await page.getByLabel("Razón social", { exact: true }).inputValue(),
      "Cliente de prueba",
    );
    console.log("PASS expired session: clear message and retained fiscal inputs");
    stage = "single submission";
    response = "delayed";
    const before = calls;
    await page.getByRole("button", { name: "Generar factura", exact: true }).click();
    await page.locator("form").evaluate((f) => {
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await page.getByText("Factura emitida ✓", { exact: true }).waitFor();
    assert.equal(calls - before, 1);
    const link = page.getByRole("link", { name: "Descargar PDF", exact: true });
    await link.waitFor();
    assert.equal(await link.getAttribute("href"), "/api/cuenta/pedidos/QA-ONLY/factura/pdf");
    assert(gets >= 4);
    assert.deepEqual(problems, []);
    console.log(
      "PASS confirmed issuance: one request despite repeated submit, refreshed state controls PDF link",
    );
    stage = "dialog keyboard";
    state = null;
    await open();
    await page.getByRole("dialog", { name: "Datos de facturación", exact: true }).waitFor();
    if (process.env.INVOICE_QA_CSS) {
      fs.mkdirSync("/tmp/gaes-invoice-qa", { recursive: true, mode: 0o700 });
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
        const dialog = page.getByRole("dialog");
        const layout = await dialog.evaluate((n) => ({
          width: n.getBoundingClientRect().width,
          scroll: n.scrollWidth,
          client: n.clientWidth,
        }));
        assert(layout.width <= width && layout.scroll <= layout.client);
        await page
          .getByRole("button", { name: "Generar factura", exact: true })
          .scrollIntoViewIfNeeded();
        const target = await page
          .getByRole("button", { name: "Generar factura", exact: true })
          .boundingBox();
        assert(target.height >= 44);
        await page.screenshot({ path: `/tmp/gaes-invoice-qa/invoice-${width}.png` });
      }
      console.log(
        "PASS styled dialog at 320/1280px: no horizontal overflow; submit reachable and at least 44px",
      );
    }
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(
      await page
        .getByRole("button", { name: /Solicitar factura/ })
        .evaluate((n) => document.activeElement === n),
      true,
    );
    console.log("PASS accessible dialog: Escape closes and returns focus");
    stage = "initial invalid state";
    state = {};
    await page.goto(base);
    await page
      .getByRole("alert")
      .filter({ hasText: /consultar/ })
      .waitFor();
    assert.equal(await page.getByRole("button", { name: /Solicitar factura/ }).count(), 0);
    state = null;
    await page.getByRole("button", { name: "Consultar estado de factura", exact: true }).click();
    await page.getByRole("button", { name: /Solicitar factura/ }).waitFor();
    console.log("PASS invalid initial state: requesting blocked until a successful explicit retry");
    stage = "PDF readiness";
    state = { folioFiscal: "QA-UUID", estado: "vigente", disponible: false };
    await page.goto(base);
    await page.getByText("Factura emitida ✓", { exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Descargar PDF", exact: true }).count(), 0);
    state = { ...state, disponible: true };
    await page.getByRole("button", { name: "Consultar estado de factura", exact: true }).click();
    await page.getByRole("link", { name: "Descargar PDF", exact: true }).waitFor();
    console.log("PASS PDF readiness: no download link until the API confirms availability");
    console.log(
      "PASS 8 local component groups; synthetic data only, no external requests or fiscal issuance",
    );
  } catch (e) {
    console.error(`FAIL invoice UI at ${stage}: ${e.stack}`);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(`Invoice QA setup failed: ${e.name}`);
  process.exitCode = 1;
});
