/** Local real-component address recovery QA. All account/map data is synthetic. */
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const app = path.join(process.cwd(), "apps/web-tienda");
const esbuild = require(
  require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
);
const address = {
  id: "qa-1",
  etiqueta: "Casa QA",
  calle: "Calle QA",
  numeroExterior: "1",
  colonia: null,
  municipio: "Ciudad QA",
  estado: "Estado QA",
  codigoPostal: "06060",
  referencias: null,
  isDefaultEnvio: true,
};
const mapResult = {
  lat: "19.4326",
  lon: "-99.1332",
  display_name: "Calle del mapa",
  address: {
    road: "Calle del mapa",
    house_number: "2",
    city: "Ciudad del mapa",
    state: "Estado del mapa",
    postcode: "06060",
  },
};
(async () => {
  const bundle = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      resolveDir: app,
      loader: "tsx",
      contents: `import {createRoot} from 'react-dom/client';import {DireccionesCuenta} from './src/components/direcciones-cuenta';createRoot(document.getElementById('root')).render(<DireccionesCuenta/>);`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("content-type", "application/javascript");
      return res.end(bundle.outputFiles[0].contents);
    }
    if (req.url === "/styles.css") {
      res.setHeader("content-type", "text/css");
      return res.end(process.env.ADDRESS_QA_CSS ? fs.readFileSync(process.env.ADDRESS_QA_CSS) : "");
    }
    res.end(
      '<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  let failed = 0;
  async function test(name, run) {
    const context = await browser.newContext({ viewport: { width: 390, height: 640 } });
    try {
      await context.addInitScript(() => {
        const timeout = AbortSignal.timeout.bind(AbortSignal);
        AbortSignal.timeout = (ms) => timeout(Math.min(ms, 1000));
        Object.defineProperty(navigator, "geolocation", {
          configurable: true,
          value: {
            getCurrentPosition(ok) {
              window.__geoSuccess = ok;
            },
          },
        });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(4500);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const mode = {
        list: [],
        save: "valid",
        remove: "valid",
        map: "valid",
        result: mapResult,
        writes: [],
        maps: [],
      };
      await page.route("**/*", async (r) => {
        const u = new URL(r.request().url());
        if (u.origin !== base) return r.abort();
        if (!u.pathname.startsWith("/api/")) return r.continue();
        if (u.pathname === "/api/cuenta/ubicacion") {
          if (mode.map === "delayed")
            return new Promise((resolve) =>
              mode.maps.push(async () => {
                await r.fulfill({ json: mode.result }).catch(() => {});
                resolve();
              }),
            );
          mode.maps.push(true);
          return r.fulfill({ json: mode.result });
        }
        const method = r.request().method();
        if (method === "GET") {
          if (mode.list === "network") return r.abort();
          return r.fulfill({ json: mode.list });
        }
        mode.writes.push({ method, body: r.request().postData() });
        const type = method === "DELETE" ? mode.remove : mode.save;
        if (type === "network") return r.abort();
        if (type === "timeout") {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return r.fulfill({ json: {} }).catch(() => {});
        }
        if (type === "invalid") return r.fulfill({ json: {} });
        if (type === "unauthorized")
          return r.fulfill({ status: 401, json: { message: "Sin sesión" } });
        if (method === "DELETE") {
          mode.list = [];
          return r.fulfill({ status: 204 });
        }
        const data = r.request().postDataJSON();
        mode.list = [{ ...address, ...data, id: method === "POST" ? "qa-new" : "qa-1" }];
        return r.fulfill({
          status: method === "POST" ? 201 : 200,
          json: method === "POST" ? { id: "qa-new" } : { ok: true },
        });
      });
      await run({ page, mode });
      assert.deepEqual(errors, []);
      console.log(`PASS ${name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${name}: ${e.stack}`);
    } finally {
      await context.close();
    }
  }
  async function open(page) {
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await page.getByRole("dialog", { name: "Nueva dirección", exact: true }).waitFor();
  }
  async function fill(page) {
    for (const [name, value] of [
      ["Etiqueta (Casa, Oficina…)", "Casa nueva QA"],
      ["Calle", "Calle escrita"],
      ["Estado", "Estado QA"],
      ["Código postal", "06060"],
    ])
      await page.getByLabel(name, { exact: true }).fill(value);
  }
  try {
    await test("old map response cannot overwrite a reopened address form", async ({
      page,
      mode,
    }) => {
      mode.map = "delayed";
      await page.goto(base);
      await open(page);
      await page.getByLabel("Buscar dirección en el mapa").fill("Consulta vieja");
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect.poll(() => mode.maps.length).toBe(1);
      await page.getByRole("button", { name: "Cerrar", exact: true }).click();
      await open(page);
      await page.getByLabel("Calle", { exact: true }).fill("Nueva dirección manual");
      await mode.maps[0]();
      await expect(page.getByLabel("Calle", { exact: true })).toHaveValue("Nueva dirección manual");
    });
    await test("manual edits made during lookup survive while untouched fields fill", async ({
      page,
      mode,
    }) => {
      mode.map = "delayed";
      await page.goto(base);
      await open(page);
      await page.getByLabel("Buscar dirección en el mapa").fill("Consulta");
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect.poll(() => mode.maps.length).toBe(1);
      await page.getByLabel("Calle", { exact: true }).fill("Mi corrección manual");
      await mode.maps[0]();
      await expect(page.getByLabel("Estado", { exact: true })).toHaveValue("Estado del mapa");
      await expect(page.getByLabel("Calle", { exact: true })).toHaveValue("Mi corrección manual");
      await expect(page.getByLabel("Código postal", { exact: true })).toHaveValue("06060");
    });
    await test("late geolocation permission cannot populate a different modal session", async ({
      page,
      mode,
    }) => {
      await page.goto(base);
      await open(page);
      await page.getByRole("button", { name: "Usar mi ubicación actual", exact: true }).click();
      await page.getByRole("button", { name: "Cerrar", exact: true }).click();
      await open(page);
      await page.getByLabel("Calle", { exact: true }).fill("Nueva dirección manual");
      await page.evaluate(() =>
        window.__geoSuccess({ coords: { latitude: 19.4326, longitude: -99.1332, accuracy: 10 } }),
      );
      await expect(page.getByLabel("Calle", { exact: true })).toHaveValue("Nueva dirección manual");
      assert.equal(mode.maps.length, 0);
    });
    await test("malformed save never closes or clears the form", async ({ page, mode }) => {
      mode.save = "invalid";
      await page.goto(base);
      await open(page);
      await fill(page);
      await page.getByRole("button", { name: "Guardar dirección", exact: true }).click();
      await page.getByRole("alert").waitFor();
      await expect(page.getByLabel("Calle", { exact: true })).toHaveValue("Calle escrita");
    });
    await test("save timeout unlocks the form and retains leading-zero postal code", async ({
      page,
      mode,
    }) => {
      mode.save = "timeout";
      await page.goto(base);
      await open(page);
      await fill(page);
      await page.getByRole("button", { name: "Guardar dirección", exact: true }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: /confirmar/ })
        .waitFor();
      await expect(
        page.getByRole("button", { name: "Guardar dirección", exact: true }),
      ).toBeEnabled();
      await expect(page.getByLabel("Código postal", { exact: true })).toHaveValue("06060");
    });
    await test("repeated submit sends only one address mutation", async ({ page, mode }) => {
      mode.save = "timeout";
      await page.goto(base);
      await open(page);
      await fill(page);
      await page.locator("form").evaluate((f) => {
        for (let n = 0; n < 3; n++)
          f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await page.getByRole("alert").waitFor();
      assert.equal(mode.writes.length, 1);
    });
    await test("failed initial load does not falsely claim there are no addresses", async ({
      page,
      mode,
    }) => {
      mode.list = "network";
      await page.goto(base);
      await page.getByRole("alert").waitFor();
      await expect(
        page.getByText("Aún no tienes direcciones guardadas", { exact: true }),
      ).toHaveCount(0);
      mode.list = [];
      await page.getByRole("button", { name: "Volver a cargar direcciones", exact: true }).click();
      await page.getByText("Aún no tienes direcciones guardadas", { exact: true }).waitFor();
    });
    await test("delete timeout recovers without removing the saved card", async ({
      page,
      mode,
    }) => {
      mode.list = [address];
      mode.remove = "timeout";
      await page.goto(base);
      await page.getByRole("button", { name: "Eliminar", exact: true }).click();
      await page.getByRole("button", { name: "¿Seguro? Sí, eliminar", exact: true }).click();
      await page.getByRole("alert").waitFor();
      await page.getByText("Casa QA", { exact: true }).waitFor();
      await expect(
        page.getByRole("button", { name: "¿Seguro? Sí, eliminar", exact: true }),
      ).toBeEnabled();
      assert.equal(mode.writes.length, 1);
    });
    await test("partial map clears stale postal data instead of mixing two addresses", async ({
      page,
      mode,
    }) => {
      mode.result = { ...mapResult, address: { road: "Nueva calle", state: "Nuevo estado" } };
      await page.goto(base);
      await open(page);
      await page.getByLabel("Código postal", { exact: true }).fill("99999");
      await page.getByLabel("Buscar dirección en el mapa").fill("Otra dirección");
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect(page.getByLabel("Calle", { exact: true })).toHaveValue("Nueva calle");
      await expect(page.getByLabel("Código postal", { exact: true })).toHaveValue("");
    });
    await test("invalid map coordinates preserve manual fields and show a safe fallback", async ({
      page,
      mode,
    }) => {
      mode.result = { ...mapResult, lat: "NaN" };
      await page.goto(base);
      await open(page);
      await fill(page);
      await page.getByLabel("Buscar dirección en el mapa").fill("Consulta");
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: /mapa/ }).waitFor();
      await expect(page.getByLabel("Calle", { exact: true })).toHaveValue("Calle escrita");
    });
    await test("expired session retains the complete address and permits explicit retry", async ({
      page,
      mode,
    }) => {
      mode.save = "unauthorized";
      await page.goto(base);
      await open(page);
      await fill(page);
      await page.getByRole("button", { name: "Guardar dirección", exact: true }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: /sesión venció/ })
        .waitFor();
      await expect(page.getByLabel("Código postal", { exact: true })).toHaveValue("06060");
      mode.save = "valid";
      await page.getByRole("button", { name: "Guardar dirección", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.getByText("Casa nueva QA", { exact: true }).waitFor();
    });
    await test("confirmed creation update and deletion refresh the saved list", async ({
      page,
    }) => {
      await page.goto(base);
      await open(page);
      await fill(page);
      await page.getByRole("button", { name: "Guardar dirección", exact: true }).click();
      await page.getByText("Casa nueva QA", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      await page.getByLabel("Calle", { exact: true }).fill("Calle editada QA");
      await page.getByRole("button", { name: "Guardar dirección", exact: true }).click();
      await page.getByText(/Calle editada QA.*CP 06060/).waitFor();
      await page.getByRole("button", { name: "Eliminar", exact: true }).click();
      await page.getByRole("button", { name: "¿Seguro? Sí, eliminar", exact: true }).click();
      await page.getByText("Aún no tienes direcciones guardadas", { exact: true }).waitFor();
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  if (failed) process.exitCode = 1;
  else
    console.log(
      "PASS 12 address recovery groups; synthetic data only, no external requests or account writes",
    );
})().catch((e) => {
  console.error(`Address QA setup failed: ${e.name}`);
  process.exitCode = 1;
});
