/** Actual payment components, local synthetic SDKs, no provider requests or charges. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const app = path.join(process.cwd(), "apps/web-tienda");
const esbuild = require(
  require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
);
const stripeSdk = `window.qaStripe={forms:[],calls:[],mode:'ok'};window.Stripe=(key,opts)=>({elements(){return {create(){const f={key,account:opts.stripeAccount,handlers:{},dead:false};window.qaStripe.forms.push(f);return {on(e,cb){f.handlers[e]=cb},mount(el){f.el=el;el.textContent='Campo seguro sintético QA';if(!window.qaNoReady)setTimeout(()=>f.handlers.ready?.(),20)},unmount(){f.dead=true;f.el?.replaceChildren()}}}}},confirmCardPayment(secret){window.qaStripe.calls.push({secret});if(window.qaStripe.mode==='pending')return new Promise(r=>window.qaStripe.finish=r);if(window.qaStripe.mode==='reject')return Promise.reject(Error('PRIVATE SDK ERROR'));if(window.qaStripe.mode==='malformed')return Promise.resolve(null);if(window.qaStripe.mode==='processing')return Promise.resolve({paymentIntent:{status:'processing'}});return Promise.resolve({paymentIntent:{status:'succeeded'}})}});`;
const conektaSdk = `window.qaConekta={calls:[],keys:[],mode:'ok'};window.Conekta={setPublicKey(k){window.qaConekta.keys.push(k)},Token:{create(data,success,error){const c={success,error};window.qaConekta.calls.push(c);const mode=window.qaConekta.mode;if(mode==='throw')throw Error('PRIVATE SDK ERROR');if(mode==='pending')return;if(mode==='sync'){success({id:'tok_synthetic_qa'});return;}setTimeout(()=>mode==='malformed'?success({}):mode==='error'?error({message:'PRIVATE ERROR'}):success({id:'tok_synthetic_qa'}),30)}}};`;
(async () => {
  const bundle = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      resolveDir: app,
      loader: "tsx",
      contents: `import {useState,useRef} from 'react';import {createRoot} from 'react-dom/client';import {PagoTarjetaStripe} from './src/components/pago-tarjeta-stripe';import {PagoTarjetaConekta} from './src/components/pago-tarjeta-conekta';function QA(){const [view,setView]=useState('stripe');const [key,setKey]=useState('pk_test_QA1');const [account,setAccount]=useState('acct_QA1');const [total,setTotal]=useState(120);const [owner,setOwner]=useState('A');const [ready,setReady]=useState(false);const ref=useRef(null);window.switchView=setView;window.switchKey=setKey;window.switchAccount=setAccount;window.switchTotal=setTotal;window.switchOwner=setOwner;window.confirmStripe=async(secret='fixture-secret',account='acct_QA1')=>{try{await ref.current.confirmar(secret,account);return 'ok'}catch(e){return e.message}};return view==='stripe'?<><PagoTarjetaStripe key={owner} ref={ref} publicKey={key} accountId={account} onReadyChange={setReady}/><button disabled={!ready} onClick={()=>{}}>Pagar Stripe QA</button></>:<PagoTarjetaConekta key={owner} publicKey={key} montoTotal={total} msiMeses={[3,6]} procesando={false} onPagar={(token,meses)=>{window.paid=window.paid||[];window.paid.push({token,meses})}}/>}createRoot(document.getElementById('root')).render(<QA/>);`,
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
      res.end(process.env.PAYMENT_QA_CSS ? fs.readFileSync(process.env.PAYMENT_QA_CSS) : "");
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
      const later = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) =>
        later(fn, ms === 12000 || ms === 20000 ? 800 : ms, ...args);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let scriptMode = "ok";
    let downloads = 0;
    await page.route("https://js.stripe.com/**", async (route) => {
      downloads++;
      const mode = scriptMode;
      if (mode === "network") return route.abort();
      if (mode === "timeout") await new Promise((r) => setTimeout(r, 1500));
      return route
        .fulfill({
          contentType: "application/javascript",
          body:
            mode === "missing"
              ? "/* no SDK */"
              : `window.qaNoReady=${mode === "no-ready"};${stripeSdk}`,
        })
        .catch(() => {});
    });
    await page.route("https://cdn.conekta.io/**", async (route) => {
      downloads++;
      const mode = scriptMode;
      if (mode === "network") return route.abort();
      if (mode === "timeout") await new Promise((r) => setTimeout(r, 1500));
      return route
        .fulfill({
          contentType: "application/javascript",
          body: mode === "missing" ? "/* no SDK */" : conektaSdk,
        })
        .catch(() => {});
    });
    await page.route("**/api/**", () => {
      throw Error("Unexpected business API request");
    });
    const stripeButton = () => page.getByRole("button", { name: "Pagar Stripe QA", exact: true });
    const stripeRetry = () =>
      page.getByRole("button", { name: "Reintentar formulario seguro", exact: true });
    const conektaButton = () => page.getByRole("button", { name: /^Pagar \$/ });
    const reset = async (view = "stripe", mode = "ok") => {
      scriptMode = mode;
      await page.goto(base);
      if (view === "conekta") await page.evaluate(() => window.switchView("conekta"));
    };
    const readyConekta = () => expect(conektaButton()).toBeEnabled();
    const fill = async () => {
      await page.getByLabel("Número de tarjeta", { exact: true }).fill("4242424242424242");
      await page.getByLabel("Nombre en la tarjeta", { exact: true }).fill("QA Local");
      await page
        .getByLabel("Vence (MM/AA)", { exact: true })
        .fill(`12/${String(new Date().getFullYear() + 2).slice(-2)}`);
      await page.getByLabel("CVC", { exact: true }).fill("123");
    };
    const pass = (label) => {
      groups++;
      console.log(`PASS ${label}`);
    };
    for (const failure of ["network", "timeout", "missing"]) {
      stage = `Stripe SDK ${failure} and explicit recovery`;
      await reset("stripe", failure);
      await expect(page.getByRole("alert")).toContainText("No pudimos cargar");
      await expect(stripeButton()).toBeDisabled();
      scriptMode = "ok";
      await stripeRetry().click();
      await expect(stripeButton()).toBeEnabled();
      assert.equal(await page.evaluate(() => window.qaStripe.calls.length), 0);
      pass(stage);
    }
    stage = "Stripe waits for actual ready event and recovers a stalled iframe";
    await reset("stripe", "no-ready");
    await expect(stripeRetry()).toBeVisible();
    await expect(stripeButton()).toBeDisabled();
    assert((await page.evaluate(() => window.confirmStripe())).includes("Espera"));
    await page.evaluate(() => {
      window.qaNoReady = false;
    });
    await stripeRetry().click();
    await expect(stripeButton()).toBeEnabled();
    assert.equal(await page.evaluate(() => window.qaStripe.forms.length), 2);
    assert.equal(await page.evaluate(() => window.qaStripe.forms[0].dead), true);
    pass(stage);
    stage = "Stripe single in-flight confirmation";
    await reset();
    await expect(stripeButton()).toBeEnabled();
    const duplicate = await page.evaluate(async () => {
      window.qaStripe.mode = "pending";
      const first = window.confirmStripe();
      const second = await window.confirmStripe();
      window.qaStripe.finish({ paymentIntent: { status: "succeeded" } });
      return [await first, second, window.qaStripe.calls.length];
    });
    assert.equal(duplicate[0], "ok");
    assert(String(duplicate[1]).includes("Ya estamos verificando"));
    assert.equal(duplicate[2], 1);
    pass(stage);
    stage = "Stripe rejects another account without calling provider";
    await reset();
    await expect(stripeButton()).toBeEnabled();
    assert(
      (await page.evaluate(() => window.confirmStripe("fixture", "acct_other"))).includes(
        "cuenta de cobro cambió",
      ),
    );
    assert.equal(await page.evaluate(() => window.qaStripe.calls.length), 0);
    pass(stage);
    for (const mode of ["processing", "reject", "malformed"]) {
      stage = `Stripe ${mode} never becomes confirmed`;
      await reset();
      await expect(stripeButton()).toBeEnabled();
      const result = await page.evaluate(async (mode) => {
        window.qaStripe.mode = mode;
        return window.confirmStripe();
      }, mode);
      assert.notEqual(result, "ok");
      assert(!result.includes("PRIVATE"));
      pass(stage);
    }
    stage = "Stripe old callbacks and confirmation cannot affect a replacement";
    await reset();
    await expect(stripeButton()).toBeEnabled();
    await page.evaluate(() => {
      window.qaStripe.mode = "pending";
      window.oldResult = window.confirmStripe();
    });
    await page.evaluate(() => window.switchAccount("acct_QA2"));
    await expect(stripeButton()).toBeEnabled();
    const stale = await page.evaluate(async () => {
      window.qaStripe.forms[0].handlers.change({ error: { message: "STALE ERROR" } });
      window.qaStripe.finish({ paymentIntent: { status: "succeeded" } });
      return await window.oldResult;
    });
    assert.notEqual(stale, "ok");
    await expect(page.getByText("STALE ERROR", { exact: true })).toHaveCount(0);
    pass(stage);
    for (const failure of ["network", "timeout", "missing"]) {
      stage = `Conekta SDK ${failure} and explicit recovery`;
      await reset("conekta", failure);
      await expect(page.getByRole("alert")).toContainText("No se pudo cargar");
      scriptMode = "ok";
      await page.getByRole("button", { name: "Reintentar", exact: true }).click();
      await readyConekta();
      assert.equal(await page.evaluate(() => window.qaConekta.calls.length), 0);
      pass(stage);
    }
    stage = "Conekta duplicate submission and duplicate callback produce one delivery";
    await reset("conekta");
    await readyConekta();
    await fill();
    await page.evaluate(() => {
      window.qaConekta.mode = "pending";
    });
    await page.locator("form").evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    assert.equal(await page.evaluate(() => window.qaConekta.calls.length), 1);
    await page.evaluate(() => {
      const c = window.qaConekta.calls[0];
      c.success({ id: "tok_synthetic_qa" });
      c.success({ id: "tok_duplicate_qa" });
    });
    assert.equal(await page.evaluate(() => window.paid.length), 1);
    await expect(page.getByLabel("CVC", { exact: true })).toHaveValue("");
    pass(stage);
    stage = "Conekta synchronous SDK completion still rejects a same-tick double submit";
    await reset("conekta");
    await readyConekta();
    await fill();
    await page.evaluate(() => {
      window.qaConekta.mode = "sync";
    });
    await page.locator("form").evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    assert.equal(await page.evaluate(() => window.qaConekta.calls.length), 1);
    assert.equal(await page.evaluate(() => window.paid.length), 1);
    pass(stage);
    stage = "Conekta timeout never submits an order and ignores late callbacks";
    await reset("conekta");
    await readyConekta();
    await fill();
    await page.evaluate(() => {
      window.qaConekta.mode = "pending";
    });
    await conektaButton().click();
    await expect(page.getByRole("alert")).toContainText("No se envió el pedido");
    await page.evaluate(() => window.qaConekta.calls[0].success({ id: "tok_late_qa" }));
    assert.equal(await page.evaluate(() => window.paid?.length || 0), 0);
    await expect(page.getByLabel("CVC", { exact: true })).toHaveValue("");
    await page.evaluate(() => {
      window.qaConekta.mode = "ok";
    });
    await fill();
    await conektaButton().click();
    await expect.poll(() => page.evaluate(() => window.paid?.length || 0)).toBe(1);
    pass(stage);
    for (const mode of ["malformed", "throw", "error"]) {
      stage = `Conekta ${mode} fails safely`;
      await reset("conekta");
      await readyConekta();
      await fill();
      await page.evaluate((mode) => {
        window.qaConekta.mode = mode;
      }, mode);
      await conektaButton().click();
      await expect(page.getByRole("alert")).toBeVisible();
      assert.equal(await page.evaluate(() => window.paid?.length || 0), 0);
      assert(!(await page.locator("main").innerText()).includes("PRIVATE"));
      await expect(page.getByLabel("CVC", { exact: true })).toHaveValue("");
      pass(stage);
    }
    stage = "Conekta stale total and account callbacks cannot deliver tokens";
    await reset("conekta");
    await readyConekta();
    await fill();
    await page.evaluate(() => {
      window.qaConekta.mode = "pending";
    });
    await conektaButton().click();
    await page.evaluate(() => window.switchTotal(240));
    await expect(page.getByRole("button", { name: "Pagar $240.00", exact: true })).toBeEnabled();
    await page.evaluate(() => window.qaConekta.calls[0].success({ id: "tok_old_total" }));
    assert.equal(await page.evaluate(() => window.paid?.length || 0), 0);
    await fill();
    await conektaButton().click();
    await page.evaluate(() => window.switchOwner("B"));
    await readyConekta();
    await expect(page.getByLabel("Número de tarjeta", { exact: true })).toHaveValue("");
    await page.evaluate(() => window.qaConekta.calls[1].success({ id: "tok_old_owner" }));
    assert.equal(await page.evaluate(() => window.paid?.length || 0), 0);
    pass(stage);
    stage = "Conekta validates card expiry and short CVC without contacting SDK";
    await reset("conekta");
    await readyConekta();
    await fill();
    await page.getByLabel("Vence (MM/AA)", { exact: true }).fill("01/20");
    await conektaButton().click();
    await expect(page.getByRole("alert")).toContainText("vencimiento");
    assert.equal(await page.evaluate(() => window.qaConekta.calls.length), 0);
    await fill();
    await page.getByLabel("CVC", { exact: true }).fill("1");
    await conektaButton().click();
    await expect(page.getByRole("alert")).toContainText("CVC");
    assert.equal(await page.evaluate(() => window.qaConekta.calls.length), 0);
    pass(stage);
    stage = "Conekta masks CVC, formats long card numbers and clears invalid installments";
    await reset("conekta");
    await readyConekta();
    await fill();
    await expect(page.getByLabel("CVC", { exact: true })).toHaveAttribute("type", "password");
    await page.getByLabel("Número de tarjeta", { exact: true }).fill("1234567890123456789");
    await expect(page.getByLabel("Número de tarjeta", { exact: true })).toHaveValue(
      "1234 5678 9012 3456 789",
    );
    await page.getByLabel("Meses sin intereses", { exact: true }).selectOption("6");
    await page.evaluate(() => window.switchTotal(240));
    await expect(page.getByLabel("Meses sin intereses", { exact: true })).toHaveValue("0");
    pass(stage);
    stage = "mobile layout";
    await page.setViewportSize({ width: 320, height: 568 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert((await conektaButton().boundingBox()).height >= 44);
    if (process.env.PAYMENT_QA_SCREENSHOT)
      await page.screenshot({ path: process.env.PAYMENT_QA_SCREENSHOT });
    pass(stage);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        groups,
        downloads,
        errors: errors.length,
        scope: "local synthetic SDKs only, no real provider requests or orders",
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
