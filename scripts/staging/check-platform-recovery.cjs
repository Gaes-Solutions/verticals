/** Platform recovery checks. Requires a disposable superadmin session in PLATFORM_QA_ACCOUNTS.
 * No business mutations: Marketplace data and write endpoint are synthetic browser fixtures.
 */
const base = process.env.PLATFORM_TEST_URL || "https://web-superadmin-staging.up.railway.app";
if (
  !["localhost", "127.0.0.1", "web-superadmin-staging.up.railway.app"].includes(
    new URL(base).hostname,
  )
)
  throw Error("Only staging or local URLs");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const account = JSON.parse(fs.readFileSync(process.env.PLATFORM_QA_ACCOUNTS)).find(
  (a) => a.role === "superadmin",
);
(async () => {
  const b = await chromium.launch();
  try {
    for (const mode of ["offline", "malformed", "timeout"]) {
      const p = await b.newPage();
      await p.addInitScript((t) => localStorage.setItem("gaespos_super_token", t), account.token);
      await p.route("**/api/admin/metrics/dashboard", async (route) => {
        if (mode === "offline") return route.abort("internetdisconnected");
        if (mode === "malformed")
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: "invalid JSON",
          });
        await new Promise((r) => setTimeout(r, 31000));
        try {
          await route.abort();
        } catch {}
      });
      await p.goto(base);
      await p
        .getByRole("alert")
        .filter({ hasText: "No se pudo cargar esta pantalla" })
        .waitFor({ timeout: 35000 });
      await p.unroute("**/api/admin/metrics/dashboard");
      await p.getByRole("button", { name: "Reintentar", exact: true }).click();
      await p.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
      await p.close();
      console.log(`PASS ${mode} request shows error and retries successfully`);
    }
    const p = await b.newPage();
    await p.addInitScript((t) => localStorage.setItem("gaespos_super_token", t), account.token);
    let writes = 0;
    await p.route("**/api/marketplace/admin/pendientes", (r) =>
      r.fulfill({
        json: {
          perfiles: [
            {
              id: "qa-preview",
              nombrePublico: "QA perfil sintético",
              tipo: "medico_humano",
              especialidades: [],
              updatedAt: new Date().toISOString(),
            },
          ],
          resenas: [],
        },
      }),
    );
    await p.route("**/api/marketplace/admin/perfiles/**/validar", (r) => {
      writes++;
      return r.fulfill({ json: { ok: true } });
    });
    p.on("dialog", (d) => d.dismiss());
    await p.goto(base);
    await p.getByRole("button", { name: /Marketplace/ }).click();
    await p.getByRole("button", { name: "Rechazar", exact: true }).click();
    await p.waitForTimeout(300);
    assert.equal(writes, 0);
    await p.getByText("QA perfil sintético", { exact: true }).waitFor();
    console.log(
      "PASS cancel profile rejection sends no write and preserves pending profile (synthetic fixture)",
    );
    await p.close();
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
