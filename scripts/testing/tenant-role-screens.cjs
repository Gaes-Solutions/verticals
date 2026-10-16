/** Read every permitted store-admin screen using six real roles in the disposable QA tenant. */
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const { hash } = require(`${process.cwd()}/apps/api/node_modules/@node-rs/argon2`);
const { PrismaClient } = require(`${process.cwd()}/packages/db/src/generated/master/index.js`);
const { PrismaClient: TenantClient } = require(
  `${process.cwd()}/packages/db/src/generated/tenant/index.js`,
);
const url = new URL(process.env.DATABASE_URL_MASTER);
assert(
  ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/qa_platform_\d+$/.test(url.pathname),
);
const base = "http://127.0.0.1:5180";
const master = new PrismaClient();
let currentScreen = "setup";
(async () => {
  let tenant;
  const browser = await chromium.launch();
  let checks = 0;
  let forms = 0;
  try {
    const store = await master.tenant.findUniqueOrThrow({ where: { slug: "qa-ui-store" } });
    const tenantUrl = new URL(url.href);
    tenantUrl.searchParams.set("schema", store.schemaName);
    tenant = new TenantClient({ datasources: { db: { url: tenantUrl.href } } });
    const roles = ["dueno", "gerente", "cajero", "vendedor", "almacen", "contador_interno"].filter(
      (role) => !process.env.QA_TENANT_SCREEN_ROLE || process.env.QA_TENANT_SCREEN_ROLE === role,
    );
    assert(roles.length > 0, "Unknown QA_TENANT_SCREEN_ROLE");
    for (const role of roles) {
      const email = `qa-screen-${role}@example.invalid`;
      const password = randomBytes(20).toString("base64url");
      const preset = await tenant.rol.findUniqueOrThrow({ where: { codigo: role } });
      await tenant.usuario.create({
        data: {
          email,
          nombre: `QA ${role}`,
          passwordHash: await hash(password),
          tipoUsuario: "empleado",
          roles: { create: { rolId: preset.id } },
        },
      });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const response = await context.request.post(`${base}/api/auth/tenant/login`, {
        data: { tenantSlug: store.slug, email, password },
      });
      assert.equal(response.status(), 200);
      const session = await response.json();
      assert(session.accessToken);
      const page = await context.newPage();
      const errors = [];
      const pending = new Set();
      page.on("request", (request) => {
        if (request.url().includes("/api/") && !request.url().includes("/notificaciones/realtime"))
          pending.add(request);
      });
      page.on("requestfinished", (request) => pending.delete(request));
      page.on("requestfailed", (request) => pending.delete(request));
      const settled = async () => {
        const deadline = Date.now() + 15000;
        let quiet = Date.now();
        while (Date.now() < deadline) {
          if (pending.size > 0) quiet = Date.now();
          else if (Date.now() - quiet > 180) return;
          await page.waitForTimeout(40);
        }
        throw new Error(
          `${currentScreen}: reads still pending: ${[...pending].map((request) => new URL(request.url()).pathname).join(", ")}`,
        );
      };
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript((session) => {
        localStorage.setItem("gaespos_admin_token", session.accessToken);
        localStorage.setItem("gaespos_admin_permisos", JSON.stringify(session.user.permissions));
      }, session);
      const initialFailures = [];
      const initialResponse = (response) => {
        if (response.url().includes("/api/") && response.status() >= 400)
          initialFailures.push(`${new URL(response.url()).pathname}: ${response.status()}`);
      };
      page.on("response", initialResponse);
      await page.goto(base);
      await page.locator("aside nav button").first().waitFor();
      const tour = page.getByRole("button", { name: "Cerrar recorrido", exact: true });
      await tour.waitFor({ state: "visible", timeout: 1500 }).catch(() => {});
      if (await tour.isVisible()) await tour.click();
      await settled();
      page.off("response", initialResponse);
      assert.deepEqual(initialFailures, [], `${role}: initial screen API failures`);
      const labels = await page.locator("aside nav button").allTextContents();
      assert(labels.length > 0);
      assert.equal(
        labels.some((label) => label.trim() === "Mi suscripción"),
        role === "dueno",
      );
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const label of labels) {
          currentScreen = `${role} ${width}px ${label.trim()}`;
          const failed = [];
          const listener = (response) => {
            const pathname = new URL(response.url()).pathname;
            const missingFiscalSetup =
              response.status() === 404 &&
              pathname === "/api/t/cfdis/config" &&
              label.trim() === "Facturación";
            if (response.url().includes("/api/") && response.status() >= 400 && !missingFiscalSetup)
              failed.push(`${new URL(response.url()).pathname}: ${response.status()}`);
          };
          page.on("response", listener);
          if (width === 390)
            await page.getByRole("button", { name: "Menú del sistema", exact: true }).click();
          await page.locator("aside nav button").filter({ hasText: label }).first().click();
          await page.waitForTimeout(350);
          await settled();
          const main = await page.locator("main").innerText();
          assert(
            main.length > 10 && !/^Cargando[.…]*$/.test(main.trim()),
            `${role}: ${label} stuck loading`,
          );
          assert.deepEqual(failed, [], `${role}: ${label} API failures`);
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
            `${role}: ${label} horizontal page overflow at ${width}px`,
          );
          assert.deepEqual(errors, [], `${role}: ${label} browser errors`);
          const can = (permission) =>
            session.user.permissions.includes("*") || session.user.permissions.includes(permission);
          const form = [
            ["Productos", "productos.crear", "+ Nuevo producto"],
            ["Inventario", "inventario.ajustar", "+ Entrada de inventario"],
            ["Compras (OC)", "compras_oc.crear", "+ Nueva orden"],
          ].find(([section, permission]) => label.trim() === section && can(permission));
          if (form) {
            await page.getByRole("button", { name: form[2], exact: true }).click();
            const modal = page.locator(".gx-modal-panel");
            await modal.waitFor();
            await settled();
            assert.deepEqual(failed, [], `${currentScreen}: form dependency reads failed`);
            await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
            await modal.waitFor({ state: "hidden" });
            forms++;
          }
          page.off("response", listener);
          checks++;
        }
        console.log(`PASS ${role}: ${labels.length} permitted screens at ${width}px`);
      }
      console.log(`PASS ${role}: ${labels.length} permitted admin screens at desktop/mobile`);
      await context.close();
    }
    console.log(
      `PASS ${checks} store-admin role screen checks and ${forms} form open/cancel checks; no business writes`,
    );
  } finally {
    await browser.close();
    await tenant?.$disconnect();
    await master.$disconnect();
  }
})().catch((error) => {
  console.error(currentScreen, error.message);
  process.exitCode = 1;
});
