/** Staging-only cart durability with real API writes. No order or payment is submitted. */
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
assert.equal(new URL(base).hostname, "web-tienda-staging.up.railway.app");
const email = `qa-cart-audit-${Date.now()}@example.invalid`;
let shopper;
function cleanup() {
  if (!shopper) return;
  const source = `const assert=require('node:assert/strict');assert(process.env.RAILWAY_ENVIRONMENT_NAME==='staging'&&process.env.RAILWAY_PROJECT_ID==='267fca4e-67c2-4c3a-9c54-0044f8834c1a'&&new URL(process.env.DATABASE_URL_MASTER).hostname==='postgres-sywn.railway.internal');const {PrismaClient}=require('/app/node_modules/@gaespos/db/src/generated/tenant/index.js');const u=new URL(process.env.DATABASE_URL_TENANT);u.searchParams.set('schema','tenant_gaesland');const db=new PrismaClient({datasources:{db:{url:u.href}}});(async()=>{try{const c=await db.cliente.findUnique({where:{id:${JSON.stringify(shopper.id)}},include:{_count:{select:{ventas:true,pedidosEcommerce:true}}}});if(!c)return;assert(c.emailPrincipal===${JSON.stringify(email)}&&c.nombre==='QA Cart Audit'&&c._count.ventas===0&&c._count.pedidosEcommerce===0);await db.$transaction(async tx=>{await tx.carritoEcommerce.deleteMany({where:{clienteId:c.id}});await tx.cliente.delete({where:{id:c.id}})});console.log('PASS temporary cart and shopper cleaned');}finally{await db.$disconnect()}})().catch(()=>{console.error('Guarded cart cleanup failed');process.exitCode=1});`;
  const result = execFileSync(
    "railway",
    [
      "ssh",
      "--project",
      "267fca4e-67c2-4c3a-9c54-0044f8834c1a",
      "--service",
      "verticals",
      "--environment",
      "staging",
      "--",
      "node",
      "-e",
      source,
    ],
    { encoding: "utf8", timeout: 60000 },
  );
  console.log(
    result
      .split("\n")
      .filter((line) => line.startsWith("PASS"))
      .join("\n"),
  );
}
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const reg = await context.request.post(`${base}/api/cuenta/registro`, {
      data: { nombre: "QA Cart Audit", email, password: randomBytes(24).toString("base64url") },
    });
    assert.equal(reg.status(), 200);
    shopper = (await reg.json()).cliente;
    const page = await context.newPage();
    const remote = async () => {
      const r = await context.request.get(`${base}/api/cuenta/carrito`);
      assert.equal(r.status(), 200);
      return r.json();
    };
    const read = () =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((key) =>
          key.startsWith("gaespos_carrito_cuenta:"),
        );
        return key ? JSON.parse(localStorage.getItem(key)) : [];
      });
    await page.goto(`${base}/producto/demo-lampara`, { waitUntil: "networkidle" });
    const block = (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue();
    await page.route("**/api/cuenta/carrito", block);
    await page.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
    await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Finalizar compra", exact: true }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Finalizar compra", exact: true }).waitFor();
    assert.equal((await read())[0]?.cantidad, 1);
    console.log(
      "PASS rapid navigation and reload preserve unsaved account items while cart POST is offline",
    );
    await page.unroute("**/api/cuenta/carrito", block);
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await page.waitForFunction(
      () => !Object.keys(localStorage).some((key) => key.startsWith("gaespos_carrito_pendiente:")),
    );
    const saved = await remote();
    assert.equal(Number(saved.cart.items[0].cantidad), 1);
    console.log("PASS retry saves the same account cart and clears its pending edits");
    await page.goto(`${base}/producto/demo-lampara`, { waitUntil: "networkidle" });
    await page.route("**/api/cuenta/carrito", block);
    await page.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
    const other = await context.request.post(`${base}/api/cuenta/carrito`, {
      headers: { origin: base },
      data: {
        owner: saved.owner,
        expectedVersion: saved.cart.version,
        items: [{ varianteId: saved.cart.items[0].varianteId, cantidad: 3 }],
      },
    });
    assert.equal(other.status(), 200);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText(/El carrito cambió en otro dispositivo/).waitFor();
    assert.equal((await read())[0]?.cantidad, 3);
    assert.equal(Number((await remote()).cart.items[0].cantidad), 3);
    await page.getByRole("button", { name: "Agregar a este carrito", exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    console.log(
      "PASS a changed remote cart wins; conflicting local work stays available without silent overwrite",
    );
  } finally {
    await browser.close();
    cleanup();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
