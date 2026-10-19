/** Local browser regressions with synthetic accounts and notification responses.
 * Start web-admin Vite locally; no external request or business write is allowed.
 */
const assert = require("node:assert/strict");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const base = process.env.ADMIN_LOCAL_QA_URL || "http://127.0.0.1:5417";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const notices = [
  {
    id: "synthetic",
    tipo: "pedido",
    titulo: "Pedido de prueba local",
    cuerpo: "Fixture de QA",
    link: "/pedidos/synthetic",
    leida: false,
    createdAt: "2026-10-18T00:00:00Z",
  },
];
(async () => {
  const browser = await chromium.launch();
  let passed = 0;
  let unexpectedWrites = 0;
  const errors = [];
  const contexts = [];
  async function fixture(options = {}) {
    const context = await browser.newContext();
    contexts.push(context);
    await context.addInitScript(() => {
      // Preserve changes/revocation on reload.
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("gaespos_admin_token", "synthetic-a");
        localStorage.setItem("gaespos_admin_permisos", JSON.stringify(["*"]));
        localStorage.setItem("gaespos_admin_uid", "old-owner");
        sessionStorage.setItem("seeded", "yes");
      }
    });
    const state = {
      permissions: ["productos.leer"],
      meStatus: 200,
      noticeStatus: 200,
      writeStatus: 200,
      writes: 0,
      ...options,
    };
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/auth/tenant/me") {
        if (state.meGate) await state.meGate;
        return route.fulfill({
          status: state.meStatus,
          json:
            state.meStatus === 200
              ? (state.meBody ?? {
                  id: "verified-user",
                  nombre:
                    request.headers().authorization === "Bearer synthetic-b"
                      ? "Cuenta B"
                      : "Cuenta verificada",
                  tenantSlug: "synthetic-store",
                  permissions: state.permissions,
                })
              : { message: "Synthetic unavailable" },
        });
      }
      if (state.handle && (await state.handle(route, url))) return;
      if (request.method() !== "GET") {
        if (!/^\/api\/t\/notificaciones\/(synthetic\/leer|leer-todas)$/.test(url.pathname)) {
          unexpectedWrites++;
          return route.abort();
        }
        state.writes++;
        if (state.writeGate) await state.writeGate;
        return route.fulfill({
          status: state.writeStatus,
          json: state.writeStatus === 200 ? { ok: true } : { message: "Synthetic unavailable" },
        });
      }
      if (url.pathname === "/api/t/notificaciones/realtime")
        return route.fulfill({ body: "", contentType: "text/event-stream" });
      if (url.pathname === "/api/t/notificaciones")
        return route.fulfill({
          status: state.noticeStatus,
          json: state.noticeStatus === 200 ? { items: notices, noLeidas: 1 } : {},
        });
      if (url.pathname === "/api/t/productos")
        return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 30 } });
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    return { context, page, state };
  }
  async function check(name, run) {
    await run();
    passed++;
    console.log(`PASS ${name}`);
  }
  const bell = (page) => page.getByRole("button", { name: "Notificaciones", exact: true }).last();
  try {
    await check(
      "cached owner permissions are withheld until current access is verified",
      async () => {
        let release;
        const f = await fixture({
          meGate: new Promise((resolve) => {
            release = resolve;
          }),
        });
        await f.page.goto(base);
        await f.page.getByText("Cargando…", { exact: true }).waitFor();
        assert.equal(
          await f.page.getByRole("button", { name: "Configuración", exact: true }).count(),
          0,
        );
        release();
        await f.page.getByRole("button", { name: /Cuenta verificada/ }).waitFor();
        assert.deepEqual(
          await f.page.evaluate(() => JSON.parse(localStorage.getItem("gaespos_admin_permisos"))),
          ["productos.leer"],
        );
        assert.equal(
          await f.page.evaluate(() => localStorage.getItem("gaespos_admin_uid")),
          "verified-user",
        );
      },
    );
    await check(
      "failed access verification blocks cached pages and offers a working retry",
      async () => {
        const f = await fixture({ meStatus: 503 });
        await f.page.goto(base);
        await f.page
          .getByRole("alert")
          .filter({ hasText: "No pudimos verificar tu acceso" })
          .waitFor();
        assert.equal(await f.page.locator("nav").count(), 0);
        f.state.meStatus = 200;
        await f.page.getByRole("button", { name: "Reintentar", exact: true }).click();
        await f.page.getByRole("button", { name: /Cuenta verificada/ }).waitFor();
      },
    );

    for (const malformed of [
      { id: "x", nombre: {}, tenantSlug: "x", permissions: [] },
      { id: "x", nombre: "Cuenta", tenantSlug: "x", permissions: "*" },
      { id: "x", nombre: "Cuenta", tenantSlug: "x", permissions: ["productos.leer", 7] },
    ]) {
      await check(
        "invalid successful account response blocks cached access and recovers on retry",
        async () => {
          const f = await fixture({ meBody: malformed });
          await f.page.goto(base);
          await f.page
            .getByRole("alert")
            .filter({ hasText: "No pudimos verificar tu acceso" })
            .waitFor();
          assert.equal(await f.page.locator("nav").count(), 0);
          assert.deepEqual(
            await f.page.evaluate(() => JSON.parse(localStorage.getItem("gaespos_admin_permisos"))),
            [],
          );
          f.state.meBody = null;
          await f.page.getByRole("button", { name: "Reintentar", exact: true }).click();
          await f.page.getByRole("button", { name: /Cuenta verificada/ }).waitFor();
          assert.deepEqual(
            await f.page.evaluate(() => JSON.parse(localStorage.getItem("gaespos_admin_permisos"))),
            ["productos.leer"],
          );
        },
      );
    }
    await check("focus revalidation removes revoked pages and controls", async () => {
      const f = await fixture();
      await f.page.goto(base);
      await f.page.getByRole("button", { name: "Productos", exact: true }).click();
      await f.page.getByRole("heading", { name: "Productos", exact: true }).waitFor();
      assert.equal(await f.page.getByRole("button", { name: /Nuevo producto/ }).count(), 0);
      f.state.permissions = [];
      await f.page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await f.page
        .getByRole("button", { name: "Productos", exact: true })
        .waitFor({ state: "detached" });
      assert.equal(
        await f.page.getByRole("heading", { name: "Productos", exact: true }).count(),
        0,
      );
    });
    await check("another tab changes the account without keeping the previous screen", async () => {
      const f = await fixture();
      await f.page.goto(base);
      await f.page.getByRole("button", { name: "Productos", exact: true }).click();
      const tab = await f.context.newPage();
      await tab.goto(`${base}/?other-tab`);
      await tab.evaluate(() => localStorage.setItem("gaespos_admin_token", "synthetic-b"));
      await f.page.getByRole("button", { name: /Cuenta B/ }).waitFor();
      assert.equal(
        await f.page.getByRole("heading", { name: "Productos", exact: true }).count(),
        0,
      );
    });
    await check(
      "notification read failure is visible and never shown as an empty inbox",
      async () => {
        const f = await fixture({ noticeStatus: 503 });
        await f.page.goto(base);
        await bell(f.page).click();
        await f.page.getByRole("alert").filter({ hasText: "No se pudieron actualizar" }).waitFor();
        assert.equal(await f.page.getByText("Sin notificaciones", { exact: true }).count(), 0);
        f.state.noticeStatus = 200;
        await f.page.getByRole("button", { name: "Volver a cargar" }).click();
        await f.page.getByText("Pedido de prueba local", { exact: true }).waitFor();
      },
    );
    await check(
      "failed mark-read preserves unread count and current page; retry succeeds",
      async () => {
        const f = await fixture({ writeStatus: 503 });
        await f.page.goto(base);
        await bell(f.page).click();
        await f.page.getByRole("button", { name: /Pedido de prueba local/ }).click();
        await f.page
          .getByRole("alert")
          .filter({ hasText: "No se pudo marcar la notificación" })
          .waitFor();
        assert.equal(await bell(f.page).innerText(), "1");
        assert.equal(
          await f.page.getByRole("heading", { name: "Pedidos online", exact: true }).count(),
          0,
        );
        f.state.writeStatus = 200;
        await f.page.getByRole("button", { name: /Pedido de prueba local/ }).click();
        await f.page
          .getByRole("button", { name: /Pedido de prueba local/ })
          .waitFor({ state: "hidden" });
        assert.equal(await bell(f.page).innerText(), "");
      },
    );
    await check(
      "failed mark-all preserves unread data and rapid repeats send one write",
      async () => {
        const f = await fixture({ writeStatus: 503 });
        await f.page.goto(base);
        await bell(f.page).click();
        await f.page.getByRole("button", { name: "Marcar todas" }).click();
        await f.page
          .getByRole("alert")
          .filter({ hasText: "No se pudieron marcar las notificaciones" })
          .waitFor();
        assert.equal(await bell(f.page).innerText(), "1");
        let release;
        f.state.writeStatus = 200;
        f.state.writeGate = new Promise((resolve) => {
          release = resolve;
        });
        await f.page.getByRole("button", { name: "Marcar todas" }).evaluate((button) => {
          button.click();
          button.click();
        });
        await f.page.waitForTimeout(100);
        assert.equal(f.state.writes, 2); // One failed attempt, one retry.
        release();
        await f.page.getByRole("button", { name: "Marcar todas" }).waitFor({ state: "hidden" });
        assert.equal(await bell(f.page).innerText(), "");
      },
    );

    const list = (id) => ({
      id,
      codigo: id,
      nombre: `Lista ${id}`,
      tipo: "publico",
      items: [{ varianteId: "v", precio: "50.00", variante: { id: "v", sku: "SKU-local" } }],
    });
    const prices = async (options = {}) => {
      const f = await fixture({ permissions: ["precios.leer"], ...options });
      f.state.handle = async (route, url) => {
        if (url.pathname === "/api/t/precios/listas") {
          await route.fulfill({ json: [list("A"), list("B")] });
          return true;
        }
        const id = url.pathname.match(/^\/api\/t\/precios\/listas\/([AB])$/)?.[1];
        if (id) {
          if (f.state.detailGate && id === "A") await f.state.detailGate;
          await route.fulfill({ status: f.state.detailStatus || 200, json: list(id) });
          return true;
        }
        if (url.pathname === "/api/t/productos") {
          await route.fulfill({ status: 503, json: {} });
          return true;
        }
        return false;
      };
      await f.page.goto(base);
      await f.page.getByRole("button", { name: "Listas de precios", exact: true }).click();
      return f;
    };
    await check("price readers can inspect amounts without add/remove controls", async () => {
      const f = await prices();
      await f.page.getByRole("button", { name: /^Lista A/ }).click();
      await f.page.getByRole("heading", { name: "Lista A", exact: true }).waitFor();
      assert.equal(await f.page.getByRole("button", { name: "Quitar", exact: true }).count(), 0);
      assert.equal(await f.page.getByPlaceholder("Buscar producto…").count(), 0);
      assert.equal(await f.page.getByRole("button", { name: /Nueva lista/ }).count(), 0);
      assert.equal(await f.page.getByText("$50.00", { exact: true }).count(), 1);
    });
    await check(
      "failed price detail is explicit and retry restores the selected list",
      async () => {
        const f = await prices({ detailStatus: 503 });
        await f.page.getByRole("button", { name: /^Lista A/ }).click();
        await f.page.getByRole("button", { name: "Reintentar lista" }).waitFor();
        f.state.detailStatus = 200;
        await f.page.getByRole("button", { name: "Reintentar lista" }).click();
        await f.page.getByRole("heading", { name: "Lista A", exact: true }).waitFor();
      },
    );
    await check("late price detail cannot replace a more recently selected list", async () => {
      let release;
      const f = await prices({
        detailGate: new Promise((resolve) => {
          release = resolve;
        }),
      });
      await f.page.getByRole("button", { name: /^Lista A/ }).click();
      await f.page.getByRole("button", { name: /^Lista B/ }).click();
      await f.page.getByRole("heading", { name: "Lista B", exact: true }).waitFor();
      release();
      await f.page.waitForTimeout(100);
      assert.equal(await f.page.getByRole("heading", { name: "Lista A", exact: true }).count(), 0);
      await f.page.getByRole("heading", { name: "Lista B", exact: true }).waitFor();
    });
    await check("price search failure is visible without an uncaught async error", async () => {
      const f = await prices({ permissions: ["precios.leer", "precios.modificar"] });
      await f.page.getByRole("button", { name: /^Lista A/ }).click();
      await f.page.getByPlaceholder("Buscar producto…").fill("lampara");
      await f.page
        .getByText("No se pudieron buscar los productos. Inténtalo de nuevo.", { exact: true })
        .waitFor();
    });
    await check("late sales report cannot relabel stale totals as the current period", async () => {
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const f = await fixture({ permissions: ["reportes.ventas"] });
      f.state.handle = async (route, url) => {
        if (url.pathname !== "/api/t/reportes/resumen") return false;
        const days = Number(url.searchParams.get("dias"));
        if (days === 7) await gate;
        await route.fulfill({
          json: {
            desde: "2026-10-01",
            hasta: "2026-10-18",
            dias: days,
            totalPeriodo: days * 10,
            numTickets: 0,
            ticketPromedio: 0,
            ivaPeriodo: 0,
            porDia: [],
            porCanal: [],
            topProductos: [],
          },
        });
        return true;
      };
      await f.page.goto(base);
      await f.page.getByRole("button", { name: "Reportes", exact: true }).click();
      await f.page.getByText("$300.00", { exact: true }).waitFor();
      const pending = f.page.waitForRequest((request) => request.url().includes("resumen?dias=7"));
      await f.page.getByRole("button", { name: "7 días", exact: true }).click();
      await pending;
      await f.page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll("button")).find((button) =>
            button.textContent.includes("Imprimir / PDF"),
          )?.disabled,
      );
      await f.page.getByRole("button", { name: "90 días", exact: true }).click();
      await f.page.getByText("$900.00", { exact: true }).waitFor();
      release();
      await f.page.waitForTimeout(100);
      assert.equal(await f.page.getByText("$70.00", { exact: true }).count(), 0);
      await f.page.getByText("$900.00", { exact: true }).waitFor();
    });
    assert.equal(unexpectedWrites, 0);
    assert.deepEqual(errors, []);
    console.log(
      `${passed} local browser groups passed; all account and notification responses synthetic; 0 remote writes.`,
    );
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
