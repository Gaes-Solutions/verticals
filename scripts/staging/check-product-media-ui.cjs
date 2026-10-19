/** Local real-component checks. Synthetic history/photos; no external API writes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const app = path.join(process.cwd(), "apps/web-tienda");
const current = {
  slugSeo: "current",
  titulo: "Producto actual",
  precio: "509.00",
  imagen: "/photo-a.svg",
};
const prior = {
  slugSeo: "previous",
  titulo: "Producto anterior",
  precio: "25.50",
  imagen: "/broken.svg",
};
let stage = "setup";
(async () => {
  const esbuild = require(
    require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
  );
  const result = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      resolveDir: app,
      loader: "tsx",
      contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {GaleriaProducto} from './src/components/galeria-producto';import {RegistrarVisto,VistosRecientes} from './src/components/vistos-recientes';const root=createRoot(document.getElementById('root'));window.unmountQA=()=>root.unmount();function QA(){const [gallery,setGallery]=useState({fotos:['/photo-a.svg','/photo-b.svg','/photo-c.svg'],alt:'Producto actual',zoom:true});const [seen,setSeen]=useState(window.initialSeen);window.switchGallery=setGallery;window.switchSeen=setSeen;return <><h1>Ficha de producto</h1><button>Control antes de galería</button><GaleriaProducto {...gallery}/><RegistrarVisto visto={seen}/><VistosRecientes excluir={seen.slugSeo}/><button>Seguir comprando</button></>};root.render(<QA/>);`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "next-link",
        setup(b) {
          b.onResolve({ filter: /^next\/link$/ }, (a) => ({ path: a.path, namespace: "fixture" }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            resolveDir: app,
            loader: "tsx",
            contents:
              "export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}",
          }));
        },
      },
    ],
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("Content-Type", "application/javascript");
      return res.end(result.outputFiles[0].contents);
    }
    if (req.url === "/styles.css") {
      res.setHeader("Content-Type", "text/css");
      return res.end(fs.readFileSync("/tmp/gaes-media.css"));
    }
    if (req.url === "/broken.svg") {
      res.statusCode = 404;
      return res.end("");
    }
    if (req.url?.startsWith("/photo-")) {
      res.setHeader("Content-Type", "image/svg+xml");
      return res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#d6bb80"/><text x="40" y="400" font-size="80">FOTO</text></svg>',
      );
    }
    res.end(
      '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="padding:16px;max-width:650px;margin:auto"></main><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  let context;
  let groups = 0;
  try {
    const setup = async ({
      raw = JSON.stringify([prior]),
      failRead = false,
      failWrite = false,
      width = 320,
    } = {}) => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width, height: 844 },
        hasTouch: true,
        serviceWorkers: "block",
      });
      await context.addInitScript(
        ({ raw, failRead, failWrite, current }) => {
          localStorage.setItem("gaespos_vistos", raw);
          window.initialSeen = current;
          window.failRead = failRead;
          window.failWrite = failWrite;
          const get = Storage.prototype.getItem;
          const set = Storage.prototype.setItem;
          Storage.prototype.getItem = function (k) {
            if (window.failRead && k === "gaespos_vistos") throw Error("QA_HISTORY_READ");
            return get.call(this, k);
          };
          Storage.prototype.setItem = function (k, v) {
            if (window.failWrite && k === "gaespos_vistos") throw Error("QA_HISTORY_WRITE");
            return set.call(this, k, v);
          };
        },
        { raw, failRead, failWrite, current },
      );
      const p = await context.newPage();
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "networkidle" });
      return { p, errors };
    };
    const safe = async (p, errors) => {
      assert.deepEqual(errors, []);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await expect(p.getByRole("button", { name: "Seguir comprando", exact: true })).toBeVisible();
    };
    const pass = () => {
      groups++;
      console.log(`PASS ${stage}`);
    };
    stage = "malformed but valid JSON history cannot crash the product page";
    for (const raw of ["null", "{}", "42", '[null,7,{"slugSeo":"oops"}]']) {
      const { p, errors } = await setup({ raw });
      await safe(p, errors);
    }
    pass();
    stage = "unavailable history storage never blocks the product page";
    for (const option of [{ failRead: true }, { failWrite: true }]) {
      const { p, errors } = await setup(option);
      await safe(p, errors);
    }
    pass();
    stage = "recent prices are historical and broken thumbnails have an accessible fallback";
    let { p, errors } = await setup();
    await expect(p.getByRole("heading", { name: "Vistos recientemente" })).toBeVisible();
    await expect(
      p.getByRole("img", { name: "Imagen no disponible: Producto anterior", exact: true }),
    ).toBeVisible();
    await expect(p.getByText("Último precio visto", { exact: false })).toBeVisible();
    await safe(p, errors);
    pass();
    stage =
      "same-tab visits and other-tab history changes refresh without duplicate or invalid links";
    await p.evaluate((prior) => window.switchSeen(prior), prior);
    await expect(p.getByRole("link", { name: /Producto actual/ })).toBeVisible();
    await expect(p.getByRole("link", { name: /Producto anterior/ })).toHaveCount(0);
    await p.evaluate(() => {
      const raw = JSON.stringify([
        { slugSeo: "external", titulo: "Otra pestaña", precio: "3.00" },
        { slugSeo: "../checkout", titulo: "Inválido", precio: "0" },
      ]);
      localStorage.setItem("gaespos_vistos", raw);
      dispatchEvent(
        new StorageEvent("storage", {
          key: "gaespos_vistos",
          newValue: raw,
          storageArea: localStorage,
        }),
      );
    });
    await expect(p.getByRole("link", { name: /Otra pestaña/ })).toBeVisible();
    await expect(p.getByRole("link", { name: /Inválido/ })).toHaveCount(0);
    await safe(p, errors);
    pass();
    stage = "cleared history disappears immediately and remains optional";
    await p.evaluate(() => {
      localStorage.clear();
      dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));
    });
    await expect(p.getByRole("heading", { name: "Vistos recientemente" })).toHaveCount(0);
    await safe(p, errors);
    pass();
    stage = "gallery zoom, rotation, reset, photo cycling and Escape work at 320px";
    ({ p, errors } = await setup());
    await p.getByRole("button", { name: "Ampliar imagen de Producto actual", exact: true }).click();
    const dialog = p.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await p.getByRole("button", { name: "Acercar imagen", exact: true }).click();
    await expect(p.getByLabel("Nivel de zoom")).toHaveText("150%");
    await p.getByRole("button", { name: "Girar imagen 90 grados", exact: true }).click();
    assert(
      await dialog
        .locator("img")
        .evaluate((e) => e.parentElement.style.transform.includes("rotate(90deg)")),
    );
    await p.getByRole("button", { name: "Restablecer imagen", exact: true }).click();
    await expect(p.getByLabel("Nivel de zoom")).toHaveText("100%");
    await p.getByRole("button", { name: "Foto siguiente", exact: true }).click();
    await expect(dialog).toContainText("Foto 2 de 3");
    for (const b of await dialog.getByRole("button").all()) {
      const box = await b.boundingBox();
      assert(
        box.height >= 44 && box.width >= 44,
        `small touch target ${await b.getAttribute("aria-label")}`,
      );
    }
    await p.screenshot({ path: "/tmp/gaes-media-gallery-320.png" });
    await p.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      p.getByRole("button", { name: "Ampliar imagen de Producto actual", exact: true }),
    ).toBeFocused();
    await safe(p, errors);
    pass();
    stage = "keyboard photo navigation and a real two-finger pinch reset safely after cancellation";
    await p.getByRole("button", { name: "Ampliar imagen de Producto actual", exact: true }).click();
    await p.keyboard.press("ArrowRight");
    await expect(dialog).toContainText("Foto 3 de 3");
    await p.keyboard.press("ArrowLeft");
    await expect(dialog).toContainText("Foto 2 de 3");
    const area = dialog.locator(".touch-none");
    const rect = await area.boundingBox();
    const y = rect.y + rect.height / 2;
    const x = rect.x + rect.width / 2;
    const cdp = await context.newCDPSession(p);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: x - 40, y, id: 1 },
        { x: x + 40, y, id: 2 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: x - 80, y, id: 1 },
        { x: x + 80, y, id: 2 },
      ],
    });
    await expect(p.getByLabel("Nivel de zoom")).toHaveText("200%");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Ampliar imagen de Producto actual", exact: true }).click();
    await expect(p.getByLabel("Nivel de zoom")).toHaveText("100%");
    await p.keyboard.press("Escape");
    await cdp.detach();
    await safe(p, errors);
    pass();
    stage = "changing product closes the old gallery and resets photo index, zoom and scrolling";
    await p.getByRole("button", { name: "Ver foto 3", exact: true }).click();
    await p.getByRole("button", { name: "Ampliar imagen de Producto actual", exact: true }).click();
    await p.getByRole("button", { name: "Acercar imagen", exact: true }).click();
    await p.evaluate(() =>
      window.switchGallery({ fotos: ["/photo-new.svg"], alt: "Otro producto", zoom: true }),
    );
    await expect(p.getByRole("dialog")).not.toBeVisible();
    await expect(
      p.getByRole("button", { name: "Ampliar imagen de Otro producto", exact: true }),
    ).toBeVisible();
    await p.getByRole("button", { name: "Ampliar imagen de Otro producto", exact: true }).click();
    await expect(p.getByRole("dialog")).toContainText("Foto 1 de 1");
    await expect(p.getByLabel("Nivel de zoom")).toHaveText("100%");
    await p.keyboard.press("Escape");
    await safe(p, errors);
    pass();
    stage = "a failed thumbnail is retried when its source is replaced";
    await p.evaluate(() =>
      window.switchGallery({ fotos: ["/broken.svg"], alt: "Cambio foto", zoom: true }),
    );
    await expect(
      p
        .getByRole("button", { name: "Ampliar imagen de Cambio foto", exact: true })
        .getByLabel("Cambio foto no disponible", { exact: true }),
    ).toBeVisible();
    await p.evaluate(() =>
      window.switchGallery({ fotos: ["/photo-fixed.svg"], alt: "Cambio foto", zoom: true }),
    );
    await expect(p.getByRole("img", { name: "Cambio foto", exact: true }).first()).toBeVisible();
    await safe(p, errors);
    pass();
    stage = "gallery disabled and empty states do not leave a modal or a scroll lock";
    await p.getByRole("button", { name: "Ampliar imagen de Cambio foto", exact: true }).click();
    await p.evaluate(() => window.switchGallery({ fotos: [], alt: "Sin fotos", zoom: false }));
    await expect(p.getByRole("dialog")).toHaveCount(0);
    assert.equal(await p.evaluate(() => document.body.style.overflow), "");
    await safe(p, errors);
    pass();
    stage = "gallery maintains usable controls with a short landscape viewport and desktop";
    for (const viewport of [
      { width: 640, height: 360 },
      { width: 1280, height: 900 },
    ]) {
      await p.setViewportSize(viewport);
      await p.evaluate(() =>
        window.switchGallery({
          fotos: ["/photo-a.svg", "/photo-b.svg"],
          alt: "Prueba tamaño",
          zoom: true,
        }),
      );
      await p.getByRole("button", { name: "Ver foto 1", exact: true }).click();
      await p.getByRole("button", { name: "Ampliar imagen de Prueba tamaño", exact: true }).click();
      await expect(p.getByRole("button", { name: "Cerrar imágenes", exact: true })).toBeVisible();
      await p.getByRole("button", { name: "Foto siguiente", exact: true }).click();
      await expect(p.getByRole("dialog")).toContainText("Foto 2 de 2");
      for (const control of await p.getByRole("dialog").getByRole("button").all()) {
        const box = await control.boundingBox();
        assert(
          box.y >= 0 && box.y + box.height <= viewport.height,
          "gallery controls must remain inside the short viewport",
        );
      }
      if (viewport.height === 360)
        await p.screenshot({ path: "/tmp/gaes-media-gallery-landscape.png" });
      await p.keyboard.press("Escape");
      await safe(p, errors);
    }
    pass();
    stage = "unmounting an open gallery restores the previous page scroll style";
    await p.evaluate(() => {
      document.body.style.overflow = "auto";
    });
    await p.getByRole("button", { name: "Ampliar imagen de Prueba tamaño", exact: true }).click();
    await p.evaluate(() => window.unmountQA());
    assert.equal(await p.evaluate(() => document.body.style.overflow), "auto");
    assert.deepEqual(errors, []);
    pass();
    console.log(
      JSON.stringify({
        groups,
        remoteWrites: 0,
        fixtures: "history, gallery photos and local component navigation",
      }),
    );
  } catch (e) {
    console.error(`FAIL ${stage}`, e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})();
