/** Staging only. Creates one QA shopper, one unpaid pickup order (then cancels it),
 * and notices owned by that shopper. Requires authenticated Railway CLI. No charges. */
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
require("node:fs").mkdirSync("/tmp/gaes-design", { recursive: true });
(async () => {
  const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
  if (
    !["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(
      new URL(base).hostname,
    )
  )
    throw Error("Only local or staging URLs");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const email = `qa-postsale-${Date.now()}@example.invalid`;
    const reg = await context.request.post(`${base}/api/cuenta/registro`, {
      data: { nombre: "Prueba posventa", email, password: "PostSaleQA2026!" },
    });
    assert.equal(reg.status(), 200);
    const shopper = (await reg.json()).cliente;
    assert.equal(shopper.email, email);
    await page.goto(`${base}/producto/demo-lampara`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
    await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Nombre completo", { exact: true }).fill("Prueba posventa");
    await page.getByRole("button", { name: "Recoger en tienda", exact: true }).click();
    await page.getByRole("radio", { name: /Sucursal principal/ }).check();
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: /Apartar pedido/ })
      .last()
      .click();
    const result = await response;
    const data = await result.json();
    assert.equal(result.status(), 200, JSON.stringify(data));
    assert.equal(data.pagoAlRecoger, true);
    assert.equal(data.intentStatus, "pendiente");
    const folio = data.folioPublico;
    await page.waitForURL("**/gracias?*");
    await page.goto(`${base}/cuenta/pedidos/${folio}`, { waitUntil: "networkidle" });
    const trigger = page.getByRole("button", { name: "Cancelar compra", exact: true });
    await trigger.click();
    await page.getByRole("dialog", { name: "Cancelar compra", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await trigger.evaluate((n) => document.activeElement === n), true);
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Motivo de cancelación").fill("Pedido de prueba, sin cobro");
    const cancelPath = `**/api/cuenta/pedidos/${folio}/cancelar`;
    await page.route(cancelPath, (r) => r.abort());
    await dialog.getByRole("button", { name: "Sí, cancelar", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "No pudimos confirmar" }).waitFor();
    assert.equal(
      await dialog.getByLabel("Motivo de cancelación").inputValue(),
      "Pedido de prueba, sin cobro",
    );
    assert.equal(
      await dialog.getByRole("button", { name: "Sí, cancelar", exact: true }).isEnabled(),
      true,
    );
    await page.unroute(cancelPath);
    await dialog.getByRole("button", { name: "Sí, cancelar", exact: true }).click();
    await page.getByText(/Este pedido fue cancelado/).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText(/Este pedido fue cancelado/).waitFor();
    const replay = await context.request.post(`${base}/api/cuenta/pedidos/${folio}/cancelar`, {
      data: { motivo: "Pedido de prueba, sin cobro" },
    });
    assert.equal(replay.status(), 200);
    assert.equal((await replay.json()).reembolsado, false);
    console.log(
      "PASS cancelación real en staging: pedido sin cobro, Escape y foco, error de red recuperable, estado persistente y repetición sin duplicados",
    );
    const seedNotices = (titles) => {
      const source = `const {PrismaClient}=require('/app/node_modules/@gaespos/db/src/generated/tenant/index.js');(async()=>{if(process.env.RAILWAY_ENVIRONMENT_NAME!=='staging')throw Error('Only staging');const u=new URL(process.env.DATABASE_URL_TENANT);u.searchParams.set('schema','tenant_gaesland');const db=new PrismaClient({datasources:{db:{url:u.toString()}}});try{const c=await db.cliente.findFirst({where:{id:${JSON.stringify(shopper.id)},emailPrincipal:${JSON.stringify(email)}}});if(!c||!/^qa-postsale-[0-9]+@example\\.invalid$/.test(c.emailPrincipal))throw Error('Not a QA shopper');await db.notificacion.createMany({data:${JSON.stringify(titles)}.map(titulo=>({destinatarioTipo:'cliente',clienteId:c.id,tipo:'qa_audit',titulo,cuerpo:'Aviso de prueba sin cobros.',metadata:{qaAudit:true}}))});console.log('QA notices ready');}finally{await db.$disconnect()}})().catch(()=>process.exit(1));`;
      const code = Buffer.from(source).toString("base64");
      try {
        execFileSync(
          "railway",
          [
            "ssh",
            "-s",
            "verticals",
            "-e",
            "staging",
            "-p",
            "267fca4e-67c2-4c3a-9c54-0044f8834c1a",
            `node -e 'eval(Buffer.from("${code}","base64").toString())'`,
          ],
          { stdio: ["ignore", "pipe", "pipe"], timeout: 45000 },
        );
      } catch {
        throw Error("Could not seed this staging QA shopper notices");
      }
    };
    seedNotices(["QA aviso uno", "QA aviso dos"]);
    await page.goto(`${base}/cuenta`, { waitUntil: "networkidle" });
    const bell = page.getByRole("button", { name: "Notificaciones", exact: true });
    await bell.click();
    await page.getByText("QA aviso uno", { exact: true }).waitFor();
    assert.equal(await bell.innerText(), "2");
    await page.route("**/api/cuenta/notificaciones/leer-todas", (r) =>
      r.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
    );
    await page.getByRole("button", { name: "Marcar todas", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "No pudimos marcar" }).waitFor();
    assert.equal(await bell.innerText(), "2");
    await page.unroute("**/api/cuenta/notificaciones/leer-todas");
    await page.getByRole("button", { name: "Marcar todas", exact: true }).click();
    await page.waitForFunction(() => {
      const b = document.querySelector('button[aria-label="Notificaciones"]');
      return b && b.innerText.trim() === "";
    });
    const notices = await context.request.get(`${base}/api/cuenta/notificaciones`);
    assert.equal((await notices.json()).noLeidas, 0);
    await page.keyboard.press("Escape");
    assert.equal(await bell.getAttribute("aria-expanded"), "false");
    console.log(
      "PASS avisos reales de la cuenta: error no borra pendientes, marcar todas persiste y Escape cierra",
    );
    seedNotices(["QA aviso nuevo"]);
    await bell.click();
    console.log("Esperando aviso nuevo por actualización de la campana, sin recargar…");
    await page.getByText("QA aviso nuevo", { exact: true }).waitFor({ timeout: 60000 });
    assert.equal(await bell.innerText(), "1");
    const noticeBounds = await page.getByText("QA aviso nuevo", { exact: true }).boundingBox();
    assert.ok(noticeBounds && noticeBounds.x >= 0 && noticeBounds.x + noticeBounds.width <= 390);
    await page.getByText("QA aviso nuevo", { exact: true }).click();
    await page.waitForFunction(() => {
      const b = document.querySelector('button[aria-label="Notificaciones"]');
      return b && b.innerText.trim() === "";
    });
    console.log("PASS aviso nuevo aparece sin recargar y se marca leído individualmente");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: "/tmp/gaes-design/postsale-account.png", fullPage: true });
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
