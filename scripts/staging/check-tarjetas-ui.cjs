/** Real saved-card component. All reads/writes use synthetic local masks. No provider calls. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const app = path.join(process.cwd(), "apps/web-tienda");
const esbuild = require(
  require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
);
const card = { id: "cmp_qa1", marca: "visa", last4: "4242", expMes: 12, expAnio: 2028 };
const other = { ...card, id: "cmp_qa2", marca: "mastercard", last4: "5555" };
(async () => {
  const bundle = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      resolveDir: app,
      loader: "tsx",
      contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {MediosPagoCuenta} from './src/components/medios-pago-cuenta';function QA(){const [owner,setOwner]=useState('A');window.switchOwner=setOwner;return <MediosPagoCuenta key={owner}/>}createRoot(document.getElementById('root')).render(<QA/>);`,
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
      res.end(process.env.TARJETAS_QA_CSS ? fs.readFileSync(process.env.TARJETAS_QA_CSS) : "");
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
    });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let cards = [card, other];
    let getMode = "ok";
    let deleteMode = "ok";
    let reads = 0;
    let writes = 0;
    let readDelay = 0;
    let writeDelay = 0;
    let afterDelete = null;
    let epoch = 0;
    await page.route("**/api/**", async (route) => {
      assert.equal(new URL(route.request().url()).origin, base);
      if (route.request().method() === "GET") {
        reads++;
        const data = cards;
        const mode = getMode;
        const delay = readDelay;
        if (mode === "network") return route.abort();
        if (mode === "timeout") await new Promise((r) => setTimeout(r, 1600));
        else if (delay) await new Promise((r) => setTimeout(r, delay));
        return route
          .fulfill({ status: mode === "401" ? 401 : 200, json: mode === "malformed" ? {} : data })
          .catch(() => {});
      }
      assert.equal(route.request().method(), "DELETE");
      assert.equal(route.request().headers().origin, base);
      writes++;
      const mode = deleteMode;
      const delay = writeDelay;
      const owner = epoch;
      if (mode === "network") return route.abort();
      if (mode === "timeout") await new Promise((r) => setTimeout(r, 1600));
      else if (delay) await new Promise((r) => setTimeout(r, delay));
      if (mode === "malformed") return route.fulfill({ json: { ok: true } }).catch(() => {});
      if (mode === "401" || mode === "404")
        return route
          .fulfill({ status: Number(mode), json: { message: "PRIVATE" } })
          .catch(() => {});
      if (owner !== epoch) return route.fulfill({ status: 204, body: "" }).catch(() => {});
      if (mode !== "unchanged")
        cards = cards.filter((c) => !route.request().url().endsWith(`/${c.id}`));
      if (afterDelete) getMode = afterDelete;
      return route.fulfill({ status: 204, body: "" }).catch(() => {});
    });
    const region = () => page.getByRole("region", { name: "Mis tarjetas" });
    const refresh = () =>
      region().getByRole("button", { name: "Actualizar tarjetas", exact: true });
    const remove = (last = "4242") =>
      region().getByRole("button", {
        name: new RegExp(`Eliminar tarjeta .* terminada en ${last}`),
      });
    const dialog = () =>
      page.getByRole("dialog", { name: "Eliminar tarjeta guardada", exact: true });
    const confirm = () => dialog().getByRole("button", { name: "Eliminar tarjeta", exact: true });
    const reset = async (data = [card, other], mode = "ok") => {
      epoch++;
      cards = data;
      getMode = mode;
      deleteMode = "ok";
      readDelay = 0;
      writeDelay = 0;
      afterDelete = null;
      await page.goto(base);
      await expect(refresh()).toBeEnabled();
    };
    const pass = (label) => {
      groups++;
      console.log(`PASS ${label}`);
    };
    for (const failure of ["malformed", "network", "timeout"]) {
      stage = `failed initial list ${failure} is not empty`;
      await reset([card], failure);
      await expect(region().getByRole("alert")).toContainText("No pudimos confirmar");
      await expect(
        region().getByText("No tienes tarjetas guardadas.", { exact: false }),
      ).toHaveCount(0);
      getMode = "ok";
      await refresh().click();
      await expect(remove()).toBeEnabled();
      pass(stage);
    }
    stage = "explicit verified empty list";
    await reset([]);
    await expect(
      region().getByText("No tienes tarjetas guardadas.", { exact: false }),
    ).toBeVisible();
    pass(stage);
    stage = "accessible confirmation cancel performs no write";
    await reset();
    let before = writes;
    await remove().click();
    await expect(dialog()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog()).toHaveCount(0);
    assert.equal(writes, before);
    assert.equal(await remove().evaluate((el) => document.activeElement === el), true);
    pass(stage);
    stage = "single delete reconciles server list before success";
    await reset();
    writeDelay = 250;
    before = writes;
    await remove().click();
    await confirm().evaluate((el) => {
      el.click();
      el.click();
    });
    await expect(dialog()).toHaveCount(0);
    await expect(region().getByRole("status")).toHaveText("Tarjeta eliminada de tu cuenta.");
    assert.equal(writes, before + 1);
    await expect(remove()).toHaveCount(0);
    await expect(remove("5555")).toBeEnabled();
    assert.equal(await refresh().evaluate((el) => document.activeElement === el), true);
    pass(stage);
    for (const failure of ["malformed", "network", "timeout", "404"]) {
      stage = `uncertain delete ${failure} blocks another write`;
      await reset();
      deleteMode = failure;
      before = writes;
      await remove().click();
      await confirm().click();
      await expect(dialog()).toHaveCount(0);
      await expect(region().getByRole("alert")).toBeVisible();
      await expect(remove()).toBeDisabled();
      await expect(remove("5555")).toBeDisabled();
      await expect(region().getByRole("status")).toHaveCount(0);
      assert.equal(writes, before + 1);
      deleteMode = "ok";
      await refresh().click();
      await expect(remove()).toBeEnabled();
      assert.equal(writes, before + 1);
      pass(stage);
    }
    stage = "204 then list failure preserves unknown state";
    await reset();
    afterDelete = "network";
    await remove().click();
    await confirm().click();
    await expect(dialog()).toHaveCount(0);
    await expect(region().getByRole("alert")).toContainText("No pudimos confirmar");
    await expect(remove()).toBeDisabled();
    await expect(region().getByRole("status")).toHaveCount(0);
    getMode = "ok";
    await refresh().click();
    await expect(remove()).toHaveCount(0);
    await expect(remove("5555")).toBeEnabled();
    pass(stage);
    stage = "204 with unchanged server list is not false deletion";
    await reset();
    deleteMode = "unchanged";
    await remove().click();
    await confirm().click();
    await expect(dialog()).toHaveCount(0);
    await expect(region().getByRole("alert")).toContainText("sigue en la lista");
    await expect(remove()).toBeDisabled();
    pass(stage);
    stage = "last-card deletion still displays verified empty result and success";
    await reset([card]);
    await remove().click();
    await confirm().click();
    await expect(dialog()).toHaveCount(0);
    await expect(region().getByRole("status")).toHaveText("Tarjeta eliminada de tu cuenta.");
    await expect(
      region().getByText("No tienes tarjetas guardadas.", { exact: false }),
    ).toBeVisible();
    pass(stage);
    stage = "GET session expiry clears private masks";
    await reset();
    getMode = "401";
    await refresh().click();
    await expect(region().getByRole("alert")).toContainText("Tu sesión venció");
    await expect(remove()).toHaveCount(0);
    await expect(remove("5555")).toHaveCount(0);
    pass(stage);
    stage = "DELETE session expiry clears private masks";
    await reset();
    deleteMode = "401";
    await remove().click();
    await confirm().click();
    await expect(dialog()).toHaveCount(0);
    await expect(region().getByRole("alert")).toContainText("Tu sesión venció");
    await expect(remove()).toHaveCount(0);
    pass(stage);
    stage = "refresh lock blocks stale reads and writes";
    await reset();
    readDelay = 450;
    before = reads;
    await refresh().evaluate((el) => {
      el.click();
      el.click();
    });
    await expect(refresh()).toBeDisabled();
    await expect(remove()).toBeDisabled();
    await expect(refresh()).toBeEnabled();
    assert.equal(reads, before + 1);
    pass(stage);
    stage = "account switch aborts old response without leaking masks or success";
    await reset();
    writeDelay = 600;
    await remove().click();
    await confirm().click();
    await expect(dialog().getByRole("button", { name: "Eliminando…", exact: true })).toBeDisabled();
    epoch++;
    cards = [];
    await page.evaluate(() => window.switchOwner("B"));
    await expect(
      region().getByText("No tienes tarjetas guardadas.", { exact: false }),
    ).toBeVisible();
    await page.waitForTimeout(800);
    await expect(region().getByRole("status")).toHaveCount(0);
    await expect(region().getByRole("alert")).toHaveCount(0);
    pass(stage);
    stage = "mobile layout, targets, dialog and keyboard";
    await page.setViewportSize({ width: 320, height: 568 });
    await reset([{ ...card, marca: "Marca de tarjeta con nombre muy largo de prueba" }]);
    await expect(remove()).toBeEnabled();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    for (const b of [refresh(), remove()]) assert((await b.boundingBox()).height >= 44);
    await remove().click();
    await expect(dialog()).toBeVisible();
    assert((await confirm().boundingBox()).height >= 44);
    await page.keyboard.press("Tab");
    assert.equal(await dialog().evaluate((el) => el.contains(document.activeElement)), true);
    if (process.env.TARJETAS_QA_SCREENSHOT)
      await page.screenshot({ path: process.env.TARJETAS_QA_SCREENSHOT });
    await page.keyboard.press("Escape");
    await expect(dialog()).toHaveCount(0);
    pass(stage);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        groups,
        errors: errors.length,
        scope: "local synthetic masks and writes only; no provider calls",
      }),
    );
  } catch (e) {
    console.error(`FAIL ${stage}: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})();
