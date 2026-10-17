/** Real React favorites/review UI with synthetic local API. Publishes no content. */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const app = path.join(process.cwd(), "apps/web-tienda");
const esbuild = require(
  require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
);
const favorite = {
  itemId: "w1",
  productoPublicadoId: "p1",
  varianteId: "v1",
  tituloPublico: "Producto QA",
  slugSeo: "producto-qa",
  precio: "10.00",
  foto: null,
};
const options = {
  ...favorite,
  itemId: "w2",
  productoPublicadoId: "p2",
  varianteId: null,
  tituloPublico: "Con opciones",
};
const purchase = {
  pedidoId: "order",
  productoPublicadoId: "p1",
  folioPublico: "QA-A",
  tituloPublico: "Producto QA",
  slugSeo: "producto-qa",
  yaResenado: false,
};

(async () => {
  const bundle = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      resolveDir: app,
      loader: "tsx",
      contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {GuardarWishlist} from './src/components/guardar-wishlist';import {WishlistCuenta} from './src/components/wishlist-cuenta';import {ResenasCuenta} from './src/components/resenas-cuenta';function QA(){const [identity,switchIdentity]=useState('p1');const [initial,setInitial]=useState(${JSON.stringify([favorite, options])});window.switchIdentity=switchIdentity;window.setInitial=setInitial;const tipo=new URLSearchParams(location.search).get('tipo');return tipo==='save'?<GuardarWishlist productoPublicadoId={identity}/>:tipo==='list'?<WishlistCuenta key={identity} inicial={initial}/>:<ResenasCuenta key={identity} inicial={[{...${JSON.stringify(purchase)},productoPublicadoId:identity}]}/>};createRoot(document.getElementById('root')).render(<QA/>);`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "qa-next",
        setup(build) {
          build.onResolve({ filter: /^next\/(navigation|link)$/ }, (args) => ({
            path: args.path,
            namespace: "qa-next",
          }));
          build.onLoad({ filter: /.*/, namespace: "qa-next" }, (args) => ({
            loader: "js",
            resolveDir: app,
            contents:
              args.path === "next/link"
                ? "import {createElement} from 'react';export default function Link(p){return createElement('a',p)}"
                : "export function useRouter(){return {refresh(){},push(url){window.pushed=url}}}",
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
        process.env.PREFERENCIAS_QA_CSS ? fs.readFileSync(process.env.PREFERENCIAS_QA_CSS) : "",
      );
    } else if (req.url.startsWith("/api/")) {
      res.statusCode = 500;
      res.end("Unmocked request");
    } else
      res.end(
        '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="max-width:900px;padding:16px;margin:auto"></main><script src="/bundle.js"></script></body></html>',
      );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let stage = "setup";
  let groups = 0;
  try {
    await context.addInitScript(() => {
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = (ms) => timeout(Math.min(ms, 1000));
      const decode = window.createImageBitmap.bind(window);
      window.createImageBitmap = (...args) =>
        window.slowPhotos ? new Promise(() => {}) : decode(...args);
      window.addEventListener("carrito-agregado", () => {
        window.cartAdds = (window.cartAdds || 0) + 1;
      });
    });
    const page = await context.newPage();
    const png = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 2, 2);
        return canvas.toDataURL("image/png").split(",")[1];
      }),
      "base64",
    );
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let rows = [];
    let readMode = "ok";
    let mode = "network";
    let reviewRows = [purchase];
    let writes = 0;
    let lastBody = null;
    await page.route("**/api/**", async (route) => {
      assert.equal(new URL(route.request().url()).origin, base);
      const isReview = route.request().url().includes("/resenas");
      if (route.request().method() === "GET") {
        if (readMode === "network") return route.abort();
        if (readMode === "malformed") return route.fulfill({ json: {} });
        if (readMode === "unauthorized") return route.fulfill({ status: 401, json: {} });
        return route.fulfill({ json: isReview ? reviewRows : rows });
      }
      writes++;
      lastBody = route.request().postDataJSON();
      const current = mode;
      if (current === "network") return route.abort();
      if (current === "malformed") return route.fulfill({ json: {} });
      if (current === "unauthorized") return route.fulfill({ status: 401, json: {} });
      if (current === "timeout") {
        await new Promise((r) => setTimeout(r, 1500));
        return route.fulfill({ json: {} }).catch(() => {});
      }
      if (current === "delayed") await new Promise((r) => setTimeout(r, 500));
      if (route.request().method() === "DELETE") {
        rows = [];
        return route.fulfill({ status: 204 }).catch(() => {});
      }
      if (isReview)
        return route
          .fulfill({ status: 201, json: { resenaId: "r1", estado: "pendiente" } })
          .catch(() => {});
      rows = [favorite];
      return route.fulfill({ status: 201, json: { itemId: "w1" } }).catch(() => {});
    });
    const pass = (label) => {
      groups++;
      console.log(`PASS ${label}`);
    };
    const open = (tipo) => page.goto(`${base}/?tipo=${tipo}`);
    const guardar = () => page.getByRole("button", { name: "Guardar", exact: true });
    const refreshSave = () =>
      page.getByRole("button", { name: "Actualizar favoritos", exact: true });
    stage = "existing saved product";
    rows = [favorite];
    await open("save");
    await expect(page.getByRole("button", { name: "Guardado", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    pass("saved product is recognized from verified history without another POST");
    stage = "initial history failure";
    rows = [];
    readMode = "malformed";
    await open("save");
    await page.getByRole("alert").waitFor();
    await expect(guardar()).toBeDisabled();
    readMode = "ok";
    await refreshSave().click();
    await expect(guardar()).toBeEnabled();
    pass("invalid initial history blocks save until explicit recovery");
    for (const failure of ["network", "malformed", "timeout", "unauthorized"]) {
      stage = `save ${failure}`;
      mode = failure;
      await guardar().click();
      if (failure === "unauthorized")
        await page
          .getByText("Inicia sesión para guardar tus favoritos.", { exact: true })
          .waitFor();
      else {
        await page.getByRole("alert").waitFor();
        await expect(guardar()).toBeDisabled();
      }
      assert.equal(await page.getByRole("button", { name: "Guardado", exact: true }).count(), 0);
      await refreshSave().click();
      await expect(guardar()).toBeEnabled();
      pass(`save ${failure}: no false saved state; manual GET recovers`);
    }
    stage = "one favorite write";
    mode = "delayed";
    const beforeSave = writes;
    await guardar().evaluate((b) => {
      b.click();
      b.click();
      b.click();
    });
    await page.getByRole("button", { name: "Guardado", exact: true }).waitFor();
    assert.equal(writes - beforeSave, 1);
    pass("repeated save clicks send one POST and only a valid receipt fills the heart");
    stage = "product navigation during save";
    rows = [];
    await open("save");
    await expect(guardar()).toBeEnabled();
    const pending = page.waitForRequest((r) => r.method() === "POST");
    await guardar().click();
    await pending;
    await page.evaluate(() => window.switchIdentity("p2"));
    await page.waitForTimeout(700);
    assert.equal(await page.getByRole("button", { name: "Guardado", exact: true }).count(), 0);
    pass("late save response cannot mark another product saved");
    stage = "list failed removal";
    await open("list");
    const remove = () =>
      page.getByRole("button", { name: "Quitar Producto QA de favoritos", exact: true });
    const refreshList = () =>
      page.getByRole("button", { name: "Actualizar lista de deseos", exact: true });
    for (const failure of ["network", "malformed", "timeout", "unauthorized"]) {
      mode = failure;
      await remove().click();
      await page.getByRole("alert").waitFor();
      await expect(remove()).toBeDisabled();
      await expect(page.getByText("Producto QA", { exact: true })).toBeVisible();
      rows = [favorite, options];
      await refreshList().click();
      await expect(remove()).toBeEnabled();
    }
    pass(
      "failed/invalid/timed-out/unauthorized deletion keeps the item and blocks repeat until verified refresh",
    );
    stage = "options and cart";
    await page.getByRole("button", { name: "Elegir opciones", exact: true }).click();
    assert.match(await page.evaluate(() => window.pushed), /^\/producto\//);
    assert.equal(await page.evaluate(() => window.cartAdds || 0), 0);
    await page.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
    assert.equal(await page.evaluate(() => window.cartAdds), 1);
    pass("ambiguous variants open product options; only one-variant products add directly to cart");
    stage = "deletion reconciliation";
    mode = "network";
    await remove().click();
    await page.getByRole("alert").waitFor();
    const beforeReconcile = writes;
    rows = [];
    await refreshList().click();
    await page.getByText("Tu lista de deseos está vacía.", { exact: true }).waitFor();
    assert.equal(writes, beforeReconcile);
    await page.evaluate((row) => window.setInitial([row]), options);
    await page.getByText("Con opciones", { exact: true }).waitFor();
    pass(
      "refresh reconciles uncertain deletion without repeating DELETE; new server props replace the list",
    );
    stage = "review validation";
    mode = "network";
    reviewRows = [purchase];
    await open("review");
    const send = () => page.getByRole("button", { name: "Enviar reseña", exact: true });
    const comment = () =>
      page.getByRole("textbox", { name: "Comentario de la reseña", exact: true });
    const check = () =>
      page.getByRole("button", { name: "Consultar estado de reseña", exact: true });
    const beforeReview = writes;
    await send().click();
    await expect(page.getByRole("alert")).toContainText("calificación");
    assert.equal(writes, beforeReview);
    await page.getByRole("button", { name: "4 estrellas", exact: true }).click();
    await comment().fill("Conservar mi comentario QA");
    assert.equal(await comment().getAttribute("maxlength"), "2000");
    pass("review requires stars, labels inputs and limits comment to server allowance");
    stage = "photo preparation";
    const choosing = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Adjuntar fotos (0/3)", exact: true }).focus();
    await page.keyboard.press("Enter");
    const chooser = await choosing;
    await chooser.setFiles({ name: "qa.png", mimeType: "image/png", buffer: png });
    await page.getByRole("img", { name: "Foto 1 de la reseña", exact: true }).waitFor();
    await expect(send()).toBeEnabled();
    await page.getByLabel("Añadir fotos", { exact: true }).setInputFiles({
      name: "bad.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });
    await expect(page.getByRole("alert")).toContainText("procesar");
    assert.equal(await comment().inputValue(), "Conservar mi comentario QA");
    pass(
      "real PNG is compressed and previewed; invalid file cannot erase the draft or existing photo",
    );
    stage = "photo timeout";
    await page.evaluate(() => {
      window.slowPhotos = true;
    });
    await page
      .getByLabel("Añadir fotos", { exact: true })
      .setInputFiles({ name: "slow.png", mimeType: "image/png", buffer: png });
    await expect(send()).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText("procesar");
    await expect(send()).toBeEnabled();
    await page.evaluate(() => {
      window.slowPhotos = false;
    });
    pass("stalled image processing times out, unlocks and retains existing photo");
    for (const failure of ["network", "malformed", "timeout", "unauthorized"]) {
      stage = `review ${failure}`;
      mode = failure;
      await send().click();
      await page.getByRole("alert").waitFor();
      await expect(send()).toBeDisabled();
      assert.equal(await comment().inputValue(), "Conservar mi comentario QA");
      await expect(page.getByRole("button", { name: "4 estrellas", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(
        page.getByRole("img", { name: "Foto 1 de la reseña", exact: true }),
      ).toBeVisible();
      readMode = "malformed";
      await check().click();
      await expect(check()).toBeEnabled();
      await expect(send()).toBeDisabled();
      readMode = "ok";
      await check().click();
      await expect(send()).toBeEnabled();
      pass(`review ${failure}: stars/text/photos kept; invalid status never unlocks resubmission`);
    }
    stage = "review single submission";
    mode = "delayed";
    const beforeSend = writes;
    await page.locator("form").evaluate((f) => {
      for (let n = 0; n < 3; n++)
        f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await page.getByText(/Tu reseña fue recibida y está pendiente de revisión/).waitFor();
    assert.equal(writes - beforeSend, 1);
    assert(lastBody.imagenes[0].startsWith("data:image/jpeg;base64,"));
    assert(lastBody.imagenes[0].length <= 250000);
    pass(
      "one verified review submission includes bounded JPEG; server moderation state controls confirmation",
    );
    stage = "lost review receipt";
    mode = "network";
    await open("review");
    await page.getByRole("button", { name: "5 estrellas", exact: true }).click();
    await send().click();
    await check().waitFor();
    reviewRows = [{ ...purchase, yaResenado: true }];
    const beforeStatus = writes;
    await check().click();
    await page.getByText(/Ya hay una reseña registrada/).waitFor();
    assert.equal(writes, beforeStatus);
    pass("existing review reconciles a lost receipt without publishing another review");
    stage = "review owner navigation";
    reviewRows = [purchase];
    mode = "delayed";
    await open("review");
    await page.getByRole("button", { name: "3 estrellas", exact: true }).click();
    await comment().fill("OLD PRIVATE COMMENT");
    const posting = page.waitForRequest((r) => r.method() === "POST");
    await send().click();
    await posting;
    await page.evaluate(() => window.switchIdentity("p2"));
    await expect(comment()).toHaveValue("");
    await page.waitForTimeout(700);
    assert.equal(await page.getByText(/Tu reseña fue recibida/).count(), 0);
    pass("owner/product switch clears draft and rejects late submission result");
    stage = "responsive layout";
    if (process.env.PREFERENCIAS_QA_CSS) {
      fs.mkdirSync("/tmp/gaes-preferencias", { recursive: true, mode: 0o700 });
      for (const tipo of ["review", "list"]) {
        await open(tipo);
        for (const width of [320, 390, 1280]) {
          await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          if (tipo === "review") {
            for (const button of [
              send(),
              page.getByRole("button", { name: "1 estrella", exact: true }),
            ])
              assert((await button.boundingBox()).height >= 44);
          }
          await page.screenshot({ path: `/tmp/gaes-preferencias/${tipo}-${width}.png` });
        }
      }
    }
    assert.deepEqual(errors, []);
    pass("320/390/1280px layouts do not overflow; stars and submit meet 44px touch target");
    console.log(
      `PASS ${groups} browser groups, synthetic API only; no reviews or favorites published`,
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
