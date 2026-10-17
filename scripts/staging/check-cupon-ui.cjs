/** Actual coupon hook/control with synthetic GET responses and no business writes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
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
      contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {CuponCheckout} from './src/components/cupon-checkout';import {useCuponCheckout} from './src/lib/use-cupon-checkout';function QA(){const [owner,setOwner]=useState('A');const [cart,setCart]=useState('cart-A');const [sub,setSub]=useState('100.0000');const [enabled,setEnabled]=useState(true);window.switchOwner=setOwner;window.switchCart=setCart;window.switchSub=setSub;window.switchEnabled=setEnabled;const c=useCuponCheckout({owner,contexto:cart,subtotal:sub,habilitado:enabled});return <><CuponCheckout cupon={c}/><p data-testid='total'>{(Number(sub)-(c.info?.valido?Number(c.info.descuentoSubtotal):0)+(c.info?.valido&&c.info.envioGratis?0:20)).toFixed(2)}</p><p data-testid='applied'>{c.codigoAplicado||'none'}</p><button disabled={c.bloquea}>Continuar compra QA</button></>}createRoot(document.getElementById('root')).render(<QA/>);`,
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
      res.end(process.env.CUPON_QA_CSS ? fs.readFileSync(process.env.CUPON_QA_CSS) : "");
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
      AbortSignal.timeout = (ms) => timeout(Math.min(ms, 900));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let mode = "ok";
    let delay = 0;
    let reads = 0;
    await page.route("**/api/**", async (route) => {
      assert.equal(route.request().method(), "GET");
      const params = new URL(route.request().url()).searchParams;
      assert.equal(new URL(route.request().url()).origin, base);
      reads++;
      const current = mode;
      const wait = delay;
      if (current === "network") return route.abort();
      if (current === "timeout") await new Promise((r) => setTimeout(r, 1500));
      else if (wait) await new Promise((r) => setTimeout(r, wait));
      const data = {
        valido: current !== "invalid",
        codigo: current === "wrong-code" ? "OTHER10" : params.get("codigo"),
        mensaje: current === "invalid" ? "Cupón expirado" : "Cupón aplicado",
        descuentoSubtotal:
          current === "bad-amount"
            ? "NaN"
            : current === "too-large"
              ? "999.00"
              : current === "invalid" || current === "shipping"
                ? "0.00"
                : "10.00",
        envioGratis: current === "shipping",
      };
      return route
        .fulfill({
          status: current === "429" ? 429 : 200,
          json: current === "malformed" ? {} : data,
        })
        .catch(() => {});
    });
    const input = () => page.getByLabel("¿Tienes un cupón?", { exact: true });
    const apply = () => page.getByRole("button", { name: "Aplicar", exact: true });
    const remove = () => page.getByRole("button", { name: "Quitar cupón", exact: true });
    const next = () => page.getByRole("button", { name: "Continuar compra QA", exact: true });
    const total = () => page.getByTestId("total");
    const reset = async () => {
      mode = "ok";
      delay = 0;
      await page.goto(base);
      await expect(input()).toHaveValue("");
    };
    const fill = async (code = "PROMO10") => input().fill(code);
    const confirmed = () => expect(page.getByTestId("applied")).toHaveText("PROMO10");
    const pass = (label) => {
      groups++;
      console.log(`PASS ${label}`);
    };
    stage = "typed coupon is unapplied and blocks checkout";
    await reset();
    await fill();
    await expect(next()).toBeDisabled();
    await expect(page.getByTestId("applied")).toHaveText("none");
    await expect(total()).toHaveText("120.00");
    pass(stage);
    stage = "verified response applies exact code once";
    let before = reads;
    delay = 250;
    await apply().evaluate((el) => {
      el.click();
      el.click();
    });
    await confirmed();
    assert.equal(reads, before + 1);
    await expect(total()).toHaveText("110.00");
    await expect(next()).toBeEnabled();
    pass(stage);
    stage = "Enter submits and lowercase code is normalized";
    await reset();
    await fill(" promo10 ");
    await input().press("Enter");
    await confirmed();
    pass(stage);
    stage = "invalid offer remains distinct from request failure";
    await reset();
    await fill();
    mode = "invalid";
    await apply().click();
    await expect(page.getByRole("alert")).toHaveText("Cupón expirado");
    await expect(next()).toBeDisabled();
    await remove().click();
    await expect(next()).toBeEnabled();
    pass(stage);
    for (const failure of [
      "malformed",
      "wrong-code",
      "bad-amount",
      "too-large",
      "network",
      "timeout",
      "429",
    ]) {
      stage = `${failure} does not invent a discount`;
      await reset();
      await fill();
      mode = failure;
      await apply().click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(total()).toHaveText("120.00");
      await expect(next()).toBeDisabled();
      mode = "ok";
      await apply().click();
      await confirmed();
      await expect(next()).toBeEnabled();
      pass(stage);
    }
    stage = "old response cannot apply after the code changes";
    await reset();
    await fill("OLD10");
    delay = 500;
    await apply().click();
    await input().fill("PROMO10");
    delay = 0;
    await apply().click();
    await confirmed();
    await page.waitForTimeout(650);
    await confirmed();
    await expect(total()).toHaveText("110.00");
    pass(stage);
    stage = "remove cancels validation and ignores its response";
    await reset();
    await fill();
    delay = 500;
    await apply().click();
    await remove().click();
    await expect(next()).toBeEnabled();
    await page.waitForTimeout(650);
    await expect(page.getByTestId("applied")).toHaveText("none");
    await expect(page.getByRole("alert")).toHaveCount(0);
    pass(stage);
    stage = "same-subtotal cart changes invalidate cached discount";
    await reset();
    await fill();
    await apply().click();
    await confirmed();
    await page.evaluate(() => window.switchCart("cart-B-same-total"));
    await expect(page.getByTestId("applied")).toHaveText("none");
    await expect(total()).toHaveText("120.00");
    await expect(next()).toBeDisabled();
    await page.evaluate(() => window.switchCart("cart-A"));
    await expect(page.getByTestId("applied")).toHaveText("none");
    await apply().click();
    await confirmed();
    pass(stage);
    stage = "subtotal changes abort pending responses and require revalidation";
    await reset();
    await fill();
    delay = 500;
    await apply().click();
    await page.evaluate(() => window.switchSub("200.0000"));
    await expect(total()).toHaveText("220.00");
    await page.waitForTimeout(650);
    await expect(page.getByTestId("applied")).toHaveText("none");
    delay = 0;
    await apply().click();
    await confirmed();
    await expect(total()).toHaveText("210.00");
    pass(stage);
    stage = "free shipping is distinct from product discount";
    await reset();
    mode = "shipping";
    await fill();
    await apply().click();
    await confirmed();
    await expect(total()).toHaveText("100.00");
    await remove().click();
    await expect(total()).toHaveText("120.00");
    pass(stage);
    stage = "account change clears a verified code";
    await reset();
    await fill();
    await apply().click();
    await confirmed();
    await page.evaluate(() => window.switchOwner("B"));
    await expect(input()).toHaveValue("");
    await expect(page.getByTestId("applied")).toHaveText("none");
    await expect(next()).toBeEnabled();
    pass(stage);
    stage = "disabled coupon feature clears an in-flight code";
    await reset();
    await fill();
    delay = 500;
    await apply().click();
    await page.evaluate(() => window.switchEnabled(false));
    await expect(input()).toHaveValue("");
    await expect(next()).toBeEnabled();
    await page.waitForTimeout(650);
    await expect(page.getByTestId("applied")).toHaveText("none");
    pass(stage);
    stage = "local format validation sends no request";
    await reset();
    await fill("A B");
    before = reads;
    await apply().click();
    await expect(page.getByRole("alert")).toContainText("3 a 40");
    assert.equal(reads, before);
    pass(stage);
    stage = "mobile layout and accessible controls";
    await reset();
    await page.setViewportSize({ width: 320, height: 568 });
    await fill();
    mode = "network";
    await apply().click();
    await expect(page.getByRole("alert")).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    for (const b of [apply(), remove()]) assert((await b.boundingBox()).height >= 44);
    if (process.env.CUPON_QA_SCREENSHOT)
      await page.screenshot({ path: process.env.CUPON_QA_SCREENSHOT });
    pass(stage);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({ groups, errors: errors.length, scope: "local synthetic coupon GETs only" }),
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
