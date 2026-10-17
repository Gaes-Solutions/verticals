/** Real cancellation/return components, local synthetic API only. No order is altered. */
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
      resolveDir: app,
      loader: "tsx",
      contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {CancelarPedido} from './src/components/cancelar-pedido';import {SolicitarDevolucion} from './src/components/solicitar-devolucion';function QA(){const [folio,setFolio]=useState('QA-A');window.switchOrder=setFolio;return new URLSearchParams(location.search).get('tipo')==='cancelar'?<CancelarPedido folio={folio}/>:<SolicitarDevolucion folio={folio} devolible={true} solicitudExistente={null} items={[{varianteId:'v1',nombre:'Producto de prueba',cantidad:2},{varianteId:'v2',nombre:'Nombre'+ 'largo'.repeat(50),cantidad:1}]}/>};createRoot(document.getElementById('root')).render(<QA/>);`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "qa-router",
        setup(build) {
          build.onResolve({ filter: /^next\/navigation$/ }, (args) => ({
            path: args.path,
            namespace: "qa-next",
          }));
          build.onLoad({ filter: /.*/, namespace: "qa-next" }, () => ({
            loader: "js",
            contents:
              "export function useRouter(){return {refresh(){window.refreshCalls=(window.refreshCalls||0)+1}}}",
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
        process.env.ORDER_ACTION_QA_CSS ? fs.readFileSync(process.env.ORDER_ACTION_QA_CSS) : "",
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
  let stage = "setup";
  let groups = 0;
  try {
    for (const tipo of ["cancelar", "devoluciones"]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        await context.addInitScript(() => {
          const timeout = AbortSignal.timeout.bind(AbortSignal);
          AbortSignal.timeout = (ms) => timeout(Math.min(ms, 1000));
        });
        const page = await context.newPage();
        page.setDefaultTimeout(7000);
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        let mode = "network";
        let status = "permitida";
        let posts = 0;
        await page.route("**/api/**", async (route) => {
          assert.equal(new URL(route.request().url()).origin, base);
          if (route.request().method() === "GET") {
            if (status === "network") return route.abort();
            if (status === "malformed") return route.fulfill({ json: {} });
            if (status === "forbidden")
              return route.fulfill({ status: 404, json: { message: "Pedido no disponible" } });
            return route.fulfill({
              json: {
                folioPublico: "QA-A",
                confirmada: status === "confirmada",
                permitida: status === "permitida",
                detalle:
                  status === "confirmada"
                    ? tipo === "cancelar"
                      ? "Compra cancelada."
                      : "Devolución SD-QA: En revisión."
                    : null,
              },
            });
          }
          posts++;
          const current = mode;
          if (current === "network") return route.abort();
          if (current === "malformed") return route.fulfill({ json: {} });
          if (current === "unauthorized") return route.fulfill({ status: 401, json: {} });
          if (current === "timeout") {
            await new Promise((r) => setTimeout(r, 1500));
            return route.fulfill({ json: {} }).catch(() => {});
          }
          if (current === "delayed") await new Promise((r) => setTimeout(r, 500));
          return route
            .fulfill({
              json:
                tipo === "cancelar"
                  ? { folioPublico: "QA-A", reembolsado: false }
                  : { id: "s1", folio: "SD-QA", estado: "solicitada" },
            })
            .catch(() => {});
        });
        const trigger = () =>
          page.getByRole("button", {
            name: tipo === "cancelar" ? "Cancelar compra" : "↩️ Solicitar devolución",
            exact: true,
          });
        const submit = () =>
          page.getByRole("button", {
            name: tipo === "cancelar" ? "Sí, cancelar" : "Enviar solicitud",
            exact: true,
          });
        const consultar = () =>
          page.getByRole("button", {
            name:
              tipo === "cancelar"
                ? "Consultar estado de cancelación"
                : "Consultar estado de devolución",
            exact: true,
          });
        const field = () =>
          page.getByRole("textbox", {
            name: tipo === "cancelar" ? "Motivo de cancelación" : "Detalle de la devolución",
            exact: true,
          });
        const quantity = () =>
          page.getByRole("spinbutton", {
            name: "Cantidad a devolver de Producto de prueba",
            exact: true,
          });
        const open = async () => {
          await page.goto(`${base}/?tipo=${tipo}`);
          await trigger().click();
        };
        const fill = async () => {
          await field().fill("Conservar este detalle QA");
          if (tipo !== "cancelar") await quantity().fill("1");
        };
        const pass = (label) => {
          groups++;
          console.log(`PASS ${tipo}: ${label}`);
        };
        stage = `${tipo}: local validation`;
        await open();
        const initial = posts;
        await submit().click();
        await page.getByRole("alert").waitFor();
        assert.equal(posts, initial);
        await fill();
        pass("empty/invalid input does not submit");
        stage = `${tipo}: network and blocked retry`;
        mode = "network";
        await submit().click();
        await expect(page.getByRole("alert")).toContainText("confirmar");
        await expect(submit()).toBeDisabled();
        assert.equal(await field().inputValue(), "Conservar este detalle QA");
        await page.getByRole("button", { name: "Cerrar", exact: true }).click();
        await trigger().click();
        await expect(submit()).toBeDisabled();
        for (const failure of ["network", "malformed", "forbidden"]) {
          status = failure;
          await consultar().click();
          await page.getByRole("alert").waitFor();
          await expect(consultar()).toBeEnabled();
          await expect(submit()).toBeDisabled();
        }
        status = "permitida";
        await consultar().click();
        await expect(submit()).toBeEnabled();
        assert.equal(await field().inputValue(), "Conservar este detalle QA");
        pass(
          "draft survives network and reopening; failed/invalid/forbidden GET cannot unlock retry",
        );
        for (const failure of ["malformed", "timeout", "unauthorized"]) {
          stage = `${tipo}: ${failure}`;
          mode = failure;
          await submit().click();
          await expect(page.getByRole("alert")).toContainText(
            failure === "unauthorized" ? "sesión" : "confirmar",
          );
          await expect(submit()).toBeDisabled();
          assert.equal(await field().inputValue(), "Conservar este detalle QA");
          assert.equal(await page.evaluate(() => window.refreshCalls || 0), 0);
          status = "permitida";
          await consultar().click();
          await expect(submit()).toBeEnabled();
          pass(`${failure} never falsely confirms; draft kept; verified GET recovers`);
        }
        stage = `${tipo}: one write`;
        mode = "delayed";
        const before = posts;
        await submit().click();
        await page.locator("form").evaluate((form) => {
          for (let n = 0; n < 4; n++)
            form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        await expect(page.getByRole("dialog")).toHaveCount(0);
        assert.equal(posts - before, 1);
        assert.equal(await page.evaluate(() => window.refreshCalls), 1);
        assert.equal(await trigger().count(), 0);
        pass(
          "repeated submit produces one POST; confirmed state remains even if router refresh does nothing",
        );
        stage = `${tipo}: reconcile lost response`;
        mode = "network";
        await open();
        await fill();
        await submit().click();
        await expect(submit()).toBeDisabled();
        status = "confirmada";
        const previousPosts = posts;
        await consultar().click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        assert.equal(posts, previousPosts);
        assert.equal(await trigger().count(), 0);
        pass("GET finds already-applied operation without another POST");
        stage = `${tipo}: changed eligibility`;
        await open();
        await fill();
        await submit().click();
        await expect(submit()).toBeDisabled();
        status = "bloqueada";
        await consultar().click();
        await expect(page.getByRole("alert")).toContainText("estado actual");
        await expect(submit()).toBeDisabled();
        pass("changed order eligibility prevents resubmission");
        stage = `${tipo}: navigation during write`;
        await open();
        await fill();
        mode = "delayed";
        const pending = page.waitForRequest((r) => r.method() === "POST");
        await submit().click();
        await pending;
        await page.evaluate(() => window.switchOrder("QA-B"));
        await trigger().click();
        await expect(field()).toHaveValue("");
        await page.waitForTimeout(700);
        assert.equal(await page.evaluate(() => window.refreshCalls || 0), 0);
        await expect(page.getByRole("dialog")).toBeVisible();
        pass("order navigation discards draft and ignores old pending operation");
        stage = `${tipo}: mobile layout`;
        await open();
        await fill();
        if (process.env.ORDER_ACTION_QA_CSS) {
          fs.mkdirSync("/tmp/gaes-order-actions", { recursive: true, mode: 0o700 });
          for (const [width, height] of [
            [320, 420],
            [390, 844],
            [1280, 800],
          ]) {
            await page.setViewportSize({ width, height });
            const dialog = page.getByRole("dialog");
            const layout = await dialog.evaluate((n) => ({
              scroll: n.scrollWidth,
              client: n.clientWidth,
              width: n.getBoundingClientRect().width,
            }));
            assert(layout.width <= width && layout.scroll <= layout.client);
            await submit().scrollIntoViewIfNeeded();
            assert((await submit().boundingBox()).height >= 44);
            await page.screenshot({ path: `/tmp/gaes-order-actions/${tipo}-${width}.png` });
          }
        }
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        assert.equal(await trigger().evaluate((n) => document.activeElement === n), true);
        assert.deepEqual(errors, []);
        pass("320/390/1280px dialog, 44px submit, Escape and focus return");
      } finally {
        await context.close();
      }
    }
    console.log(`PASS ${groups} browser groups; no real order, return or refund performed`);
  } catch (e) {
    console.error(`FAIL ${stage}: ${e.stack}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
