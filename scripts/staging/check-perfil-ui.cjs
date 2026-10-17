/** Actual profile component; all writes use local synthetic fixtures. */
const assert = require("node:assert/strict");
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
      contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {PerfilCuenta} from './src/components/perfil-cuenta';function QA(){const [id,setId]=useState('A');window.switchOwner=setId;return <PerfilCuenta key={id} me={{nombre:'Cuenta '+id,apellidos:null,email:null,telefono:null}}/>}createRoot(document.getElementById('root')).render(<QA/>);`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "router",
        setup(build) {
          build.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: "router",
            namespace: "fixture",
          }));
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents:
              'export const useRouter=()=>({refresh(){window.refreshes=(window.refreshes||0)+1;if(window.refreshThrows)throw Error("fixture")}})',
          }));
        },
      },
    ],
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("content-type", "application/javascript");
      res.end(bundle.outputFiles[0].contents);
    } else
      res.end(
        '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main id="root"></main><script src="/bundle.js"></script></body></html>',
      );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let groups = 0;
  let stage = "setup";
  try {
    await context.addInitScript(() => {
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = (ms) => timeout(Math.min(ms, 1000));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let mode = "ok";
    let writes = 0;
    let delay = 0;
    let lastBody;
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.route("**/api/**", async (route) => {
      assert.equal(new URL(route.request().url()).origin, base);
      writes++;
      lastBody = route.request().postDataJSON();
      const currentMode = mode;
      const currentDelay = delay;
      if (currentDelay) await new Promise((r) => setTimeout(r, currentDelay));
      if (currentMode === "network") return route.abort().catch(() => {});
      const status = currentMode === "400" ? 400 : currentMode === "401" ? 401 : 200;
      return route
        .fulfill({
          status,
          json:
            currentMode === "malformed"
              ? {}
              : { ok: status === 200, message: "PRIVATE INTERNAL MESSAGE" },
        })
        .catch(() => {});
    });
    const form = () => page.locator("form").nth(0);
    const pw = () => page.locator("form").nth(1);
    const fill = async (confirm = "new-password") => {
      await pw().getByLabel("Contraseña actual", { exact: true }).fill("old-password");
      await pw().getByLabel("Nueva (mín. 8)", { exact: true }).fill("new-password");
      await pw().getByLabel("Confirma la nueva contraseña", { exact: true }).fill(confirm);
    };
    const reset = async () => {
      mode = "ok";
      delay = 0;
      await page.goto(base);
      await expect(form().getByLabel("Nombre", { exact: true })).toHaveValue("Cuenta A");
    };
    const pass = (label) => {
      groups++;
      console.log(`PASS ${label}`);
    };
    await reset();
    stage = "confirmation mismatch";
    await fill("different-password");
    let before = writes;
    await pw().getByRole("button").click();
    assert.equal(writes, before);
    pass(stage);
    stage = "valid password receipt and duplicate guard";
    await fill();
    delay = 250;
    before = writes;
    await pw().evaluate((el) => {
      el.requestSubmit();
      el.requestSubmit();
    });
    await expect(pw().getByRole("status")).toHaveText("Contraseña actualizada");
    assert.equal(writes, before + 1);
    await expect(pw().getByLabel("Contraseña actual", { exact: true })).toHaveValue("");
    assert.equal(lastBody.nueva, "new-password");
    pass(stage);
    stage = "malformed password response is uncertain";
    await reset();
    await fill();
    mode = "malformed";
    before = writes;
    await pw().getByRole("button").click();
    await expect(pw().getByRole("alert")).toContainText("No pudimos confirmar");
    await expect(pw().getByRole("button")).toBeDisabled();
    await expect(pw().getByRole("link", { name: "Verificar mi acceso" })).toHaveAttribute(
      "href",
      "/cuenta/login?next=%2Fcuenta",
    );
    await pw().evaluate((el) => el.requestSubmit());
    assert.equal(writes, before + 1);
    await expect(pw().getByLabel("Nueva (mín. 8)", { exact: true })).toHaveValue("new-password");
    pass(stage);
    for (const failure of ["network", "timeout"]) {
      stage = `password ${failure}`;
      await reset();
      await fill();
      mode = failure === "network" ? "network" : "ok";
      delay = failure === "timeout" ? 1500 : 0;
      await pw().getByRole("button").click();
      await expect(pw().getByRole("alert")).toContainText("contraseña nueva");
      await expect(pw().getByRole("button")).toBeDisabled();
      pass(stage);
    }
    stage = "incorrect password keeps fields and permits correction";
    await reset();
    await fill();
    mode = "400";
    await pw().getByRole("button").click();
    await expect(pw().getByRole("alert")).toContainText("Verifica tu contraseña actual");
    await expect(pw().getByRole("button")).toBeEnabled();
    assert(!(await pw().innerText()).includes("PRIVATE"));
    await expect(pw().getByLabel("Nueva (mín. 8)", { exact: true })).toHaveValue("new-password");
    mode = "ok";
    await pw().getByRole("button").click();
    await expect(pw().getByRole("status")).toHaveText("Contraseña actualizada");
    pass(stage);
    stage = "expired session";
    await reset();
    await fill();
    mode = "401";
    await pw().getByRole("button").click();
    await expect(pw().getByRole("alert")).toContainText("Tu sesión venció");
    await expect(pw().getByRole("status")).toHaveCount(0);
    pass(stage);
    stage = "profile malformed success preserves draft";
    await reset();
    mode = "malformed";
    await form().getByLabel("Nombre", { exact: true }).fill("Nuevo nombre");
    await form().getByRole("button").click();
    await expect(form().getByRole("alert")).toContainText("No pudimos confirmar");
    await expect(form().getByLabel("Nombre", { exact: true })).toHaveValue("Nuevo nombre");
    assert.equal(await page.evaluate(() => window.refreshes || 0), 0);
    pass(stage);
    stage = "profile single save and refresh failure";
    await reset();
    await page.evaluate(() => {
      window.refreshThrows = true;
    });
    delay = 250;
    before = writes;
    await form().evaluate((el) => {
      el.requestSubmit();
      el.requestSubmit();
    });
    await expect(form().getByRole("status")).toHaveText("Datos guardados");
    assert.equal(writes, before + 1);
    pass(stage);
    stage = "whitespace name does not write";
    await reset();
    await form().getByLabel("Nombre", { exact: true }).fill("   ");
    before = writes;
    await form().getByRole("button").click();
    assert.equal(writes, before);
    pass(stage);
    stage = "account switch aborts stale work and clears secrets";
    await reset();
    await fill();
    delay = 600;
    before = writes;
    await pw().getByRole("button").click();
    await expect.poll(() => writes).toBe(before + 1);
    await page.evaluate(() => window.switchOwner("B"));
    await expect(form().getByLabel("Nombre", { exact: true })).toHaveValue("Cuenta B");
    await expect(pw().getByLabel("Contraseña actual", { exact: true })).toHaveValue("");
    await page.waitForTimeout(800);
    await expect(pw().getByRole("status")).toHaveCount(0);
    await expect(pw().getByRole("button")).toBeEnabled();
    pass(stage);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({ groups, errors: errors.length, scope: "local synthetic writes only" }),
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
