/** Browser recovery tests using intercepted POST responses; no email or password writes.
 * STOREFRONT_TEST_URL: staging (default) or localhost. No credentials required.
 */
const assert = require("node:assert/strict");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
assert(
  ["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(new URL(base).hostname),
);
const scenarios = [
  {
    name: "login",
    path: "/cuenta/login?next=%2Fcheckout",
    api: "login",
    button: "Entrar",
    width: 1280,
  },
  {
    name: "registro",
    path: "/cuenta/registro?next=%2Fcheckout",
    api: "registro",
    button: "Crear cuenta",
    width: 390,
  },
  {
    name: "recuperacion",
    path: "/cuenta/olvidar-contrasena",
    api: "olvidar-contrasena",
    button: "Enviar enlace",
    width: 390,
  },
  {
    name: "restablecer",
    path: `/cuenta/restablecer?token=${"a".repeat(64)}`,
    api: "restablecer-contrasena",
    button: "Guardar contraseña",
    width: 1280,
  },
];
let stage = "start";
(async () => {
  const b = await chromium.launch();
  let checks = 0;
  try {
    for (const s of scenarios) {
      const c = await b.newContext({ viewport: { width: s.width, height: 844 } });
      c.setDefaultTimeout(30000);
      await c.route("**/api/**", (r) =>
        r.request().method() === "GET" ? r.continue() : r.abort(),
      );
      const p = await c.newPage();
      stage = `${s.name} load`;
      await p.goto(base + s.path, { timeout: 90000 });
      if (s.name === "registro")
        await p.getByLabel("Tu nombre", { exact: true }).fill("QA formulario");
      if (s.name === "restablecer") {
        await p.getByLabel("Nueva contraseña (mín. 8)", { exact: true }).fill("QaOnly-2026!");
        await p.getByLabel("Confirma tu nueva contraseña", { exact: true }).fill("QaOnly-2026!");
      } else {
        await p.getByLabel("Correo", { exact: true }).fill("qa-auth@example.invalid");
        if (["login", "registro"].includes(s.name))
          await p.getByLabel("Contraseña", { exact: true }).fill("QaOnly-2026!");
      }
      const submit = p.getByRole("button", { name: s.button, exact: true });
      const pattern = `**/api/cuenta/${s.api}`;
      for (const mode of ["html200", "empty200", "http503", "network", "timeout", "duplicate"]) {
        stage = `${s.name} ${mode}`;
        let calls = 0;
        const handle = async (r) => {
          calls++;
          if (mode === "network") return r.abort("internetdisconnected");
          if (mode === "timeout") {
            await new Promise((resolve) => setTimeout(resolve, 20000));
            try {
              await r.abort();
            } catch {}
            return;
          }
          if (mode === "duplicate") await new Promise((resolve) => setTimeout(resolve, 300));
          if (mode === "html200")
            return r.fulfill({
              status: 200,
              contentType: "text/html",
              body: "<html>gateway</html>",
            });
          return r.fulfill({
            status: mode === "empty200" ? 200 : 503,
            json:
              mode === "empty200"
                ? {}
                : { message: "Servicio temporalmente no disponible. Inténtalo de nuevo." },
          });
        };
        await p.route(pattern, handle);
        if (mode === "duplicate")
          await submit.evaluate((button) => {
            const f = button.form;
            f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          });
        else await submit.click();
        await p.getByRole("alert").first().waitFor();
        assert.equal(await submit.isEnabled(), true);
        assert.equal(new URL(p.url()).pathname, new URL(base + s.path).pathname);
        assert.equal(calls, 1);
        if (s.name === "restablecer")
          assert.equal(
            await p.getByLabel("Nueva contraseña (mín. 8)", { exact: true }).inputValue(),
            "QaOnly-2026!",
          );
        else
          assert.equal(
            await p.getByLabel("Correo", { exact: true }).inputValue(),
            "qa-auth@example.invalid",
          );
        await p.unroute(pattern, handle);
        checks++;
      }
      for (const width of [390, 1280]) {
        await p.setViewportSize({ width, height: 844 });
        assert.equal(
          await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
      }
      if (["recuperacion", "restablecer"].includes(s.name)) {
        stage = `${s.name} successful retry fixture`;
        await p.route(pattern, (r) =>
          r.fulfill({ status: 200, json: { mensaje: "Solicitud confirmada" } }),
        );
        await submit.click();
        await p
          .getByRole("heading", {
            name: s.name === "recuperacion" ? "Revisa tu correo" : "Contraseña actualizada",
            exact: true,
          })
          .waitFor();
        checks++;
      }
      console.log(
        `PASS ${s.name}: malformed 200, empty 200, HTTP error, network, timeout, duplicate submit, retained input, desktop/mobile layout${["recuperacion", "restablecer"].includes(s.name) ? ", successful retry fixture" : ""}`,
      );
      await c.close();
    }
    assert.equal(checks, 26);
    console.log(
      `PASS ${checks} browser auth cases; all auth POSTs intercepted, no email or password changes`,
    );
  } finally {
    await b.close();
  }
})().catch(() => {
  console.error(`Browser auth audit failed at ${stage}; form values withheld`);
  process.exitCode = 1;
});
