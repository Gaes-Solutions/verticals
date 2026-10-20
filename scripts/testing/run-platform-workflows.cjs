/** Full local UI workflows against a disposable PostgreSQL database.
 * Run with a dedicated localhost QA PostgreSQL URL; never source a business .env.
 * Requires localhost PostgreSQL with CREATE DATABASE. Never uses production data or provider keys.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const repo = process.cwd();
const args = process.argv.slice(2);
const apiTests = args[0] === "--api-tests";
const allowedModes = new Set([
  "--retail-e2e",
  "--shopper-e2e",
  "--shopper-order-e2e",
  "--owner-onboarding-e2e",
]);
if (apiTests) {
  for (const file of args.slice(1)) {
    if (!/^test\/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:test|unit)\.ts$/.test(file) || file.includes(".."))
      throw Error("Invalid API test file argument");
    try {
      const target = path.join(repo, "apps/api", file);
      for (const parent of ["apps", "apps/api", "apps/api/test"])
        if (fs.lstatSync(path.join(repo, parent)).isSymbolicLink()) throw Error("symlink parent");
      if (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isFile())
        throw Error("invalid file");
    } catch {
      throw Error("API test file must exist and must not be a symlink");
    }
  }
} else if (args.length > 1 || (args.length === 1 && !allowedModes.has(args[0])))
  throw Error(
    "Invalid workflow mode: use no arguments, --retail-e2e, --shopper-e2e, --shopper-order-e2e, --owner-onboarding-e2e or --api-tests",
  );
let source;
try {
  source = new URL(process.env.DATABASE_URL_MASTER);
} catch {
  throw Error("A localhost PostgreSQL URL is required");
}
if (
  !["postgres:", "postgresql:"].includes(source.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)
)
  throw Error("Only localhost PostgreSQL databases allowed");
if (source.search || source.hash)
  throw Error("Database URL query parameters and fragments are forbidden");
const { Client } = require(`${repo}/apps/api/node_modules/pg`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gaes-platform-flows-"));
fs.chmodSync(temp, 0o700);
const dbName = `qa_platform_${Date.now()}${Math.floor(Math.random() * 1e9)}`;
const qaUrl = new URL(source);
qaUrl.pathname = `/${dbName}`;
qaUrl.search = "";
const env = {
  ...process.env,
  DATABASE_URL_MASTER: qaUrl.href,
  DATABASE_URL_TENANT: qaUrl.href,
  NODE_ENV: "test",
  PAGOS_ALLOW_MOCK: "true",
  PLATFORM_FLOW_ACCOUNTS: path.join(temp, "accounts.json"),
  PLATFORM_TEST_URL: "http://127.0.0.1:5179",
  VITE_API_URL: "http://127.0.0.1:3059",
};
for (const key of Object.keys(env))
  if (
    /STRIPE|CONEKTA|FACTURAMA|SAAS_FISCAL|RESEND|BREVO|SMTP|SENTRY|OPENAI|ANTHROPIC|KIMI|AWS_/.test(
      key,
    )
  )
    delete env[key];
// Local non-root installs may live outside /usr/bin. Preserve decoder isolation.
for (const [key, tool] of [
  ["KIOSKO_FFMPEG", "ffmpeg"],
  ["KIOSKO_FFPROBE", "ffprobe"],
]) {
  if (env[key]) continue;
  const executable = (env.PATH ?? "")
    .split(path.delimiter)
    .map((dir) => path.join(dir, tool))
    .find((candidate) => {
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return fs.statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
  if (executable) env[key] = fs.realpathSync(executable);
}
const ownerOnboarding = process.argv[2] === "--owner-onboarding-e2e";
const shopperOrder = process.argv[2] === "--shopper-order-e2e" || ownerOnboarding;
const shopper = process.argv[2] === "--shopper-e2e" || shopperOrder;
if (shopper)
  Object.assign(env, {
    SHOPPER_FLOW_TESTS: "true",
    API_URL: "http://127.0.0.1:3059",
    SHOPPER_TEST_URL: "http://127.0.0.1:3058",
    TIENDA_TENANT_SLUG: ownerOnboarding ? "qa-new-owner" : "test-e2e-shopper",
    STOREFRONT_SERVICE_KEY: require("node:crypto").randomBytes(32).toString("hex"),
    SHOPPER_FIXTURE_FILE: path.join(temp, "shopper.json"),
  });
if (shopperOrder)
  Object.assign(env, {
    SHOPPER_ORDER_FLOW_TESTS: "true",
    SHOPPER_ORDER_RESULT_FILE: path.join(temp, "shopper-order-result.json"),
    SHOPPER_ORDER_PROVIDER_FILE: path.join(temp, "shopper-order-providers.json"),
  });
if (ownerOnboarding)
  Object.assign(env, {
    OWNER_ONBOARDING_FLOW_TESTS: "true",
    PRODUCTOS_MEDIA_ROOT: path.join(temp, "product-media"),
    OWNER_ONBOARDING_RESULT_FILE: path.join(temp, "owner-result.json"),
    STOREFRONT_APEX: "shops.example.test",
  });
const retail = process.argv[2] === "--retail-e2e";
if (retail)
  Object.assign(env, {
    RETAIL_FLOW_TESTS: "true",
    E2E_API: "http://127.0.0.1:3059",
    E2E_ADMIN: "http://127.0.0.1:5180",
    E2E_POS: "http://127.0.0.1:5181",
    E2E_EXTERNAL_SERVERS: "true",
    E2E_TENANT: "test-e2e-retail",
    E2E_POS_EMAIL: "cajero@e2e.local",
    E2E_POS_PASSWORD: "E2ePruebas!2026",
    E2E_REPO_ROOT: repo,
  });
const children = [];
function command(args) {
  const r = spawnSync("pnpm", args, { cwd: repo, env, stdio: "inherit" });
  if (r.status !== 0) throw Error(`QA command failed: ${args[0]}`);
}
function start(args, name, overrides = {}) {
  const fd = fs.openSync(path.join(temp, name), "w", 0o600);
  const child = spawn("pnpm", args, {
    cwd: repo,
    env: { ...env, ...overrides },
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  fs.closeSync(fd);
  child.qaLog = path.join(temp, name);
  children.push(child);
  return child;
}
async function ready(url, child) {
  for (let i = 0; i < (shopper ? 900 : 150); i++) {
    if (child.exitCode !== null) {
      if (shopper) fs.copyFileSync(child.qaLog, "/tmp/gaes-shopper-server-failure.log");
      throw Error(
        `QA server failed to start${shopper ? "; diagnostic: /tmp/gaes-shopper-server-failure.log" : ""}`,
      );
    }
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw Error("QA server startup timed out");
}
async function assertPortsUnused() {
  // Fail if the fixed QA ports are already occupied; do not reuse an unknown server.
  const targets = apiTests
    ? []
    : [
        "http://127.0.0.1:3059/health",
        ...(shopper
          ? ["http://127.0.0.1:3058"]
          : ["http://127.0.0.1:5179", "http://127.0.0.1:5180"]),
        ...(retail ? ["http://127.0.0.1:5181"] : []),
        ...(ownerOnboarding ? ["http://127.0.0.1:5180", "http://127.0.0.1:5181"] : []),
      ];
  for (const url of targets) {
    let occupied = false;
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000) });
      occupied = true;
    } catch {}
    if (occupied) throw Error(`QA port is in use: ${new URL(url).port}`);
  }
}
async function stopChildren() {
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
  }
}
function retainOwnerDiagnostics() {
  const diagnostics = path.join(os.tmpdir(), "gaes-owner-onboarding");
  fs.mkdirSync(diagnostics, { recursive: true, mode: 0o700 });
  for (const name of ["api.log", "owner-web.log", "shopper-web.log", "pos-web.log"]) {
    const file = path.join(temp, name);
    if (!fs.existsSync(file)) continue;
    const data = fs.readFileSync(file);
    fs.writeFileSync(path.join(diagnostics, name), data.subarray(-2 * 1024 * 1024), {
      mode: 0o600,
    });
  }
}
(async () => {
  const pg = new Client({ connectionString: source.href });
  await pg.connect();
  let created = false;
  try {
    await assertPortsUnused();
    await pg.query(`CREATE DATABASE "${dbName}"`);
    created = true;
    command(["--filter", "@gaespos/db", "prisma:migrate:deploy"]);
    command(["--filter", "@gaespos/db", "seed:master"]);
    if (apiTests) {
      command(["--filter", "@gaespos/api", "exec", "vitest", "run", ...args.slice(1)]);
      return;
    }
    const fixture = path.join(temp, "api.mts");
    fs.writeFileSync(
      fixture,
      `
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hash } from '${repo}/apps/api/node_modules/@node-rs/argon2/index.js';
import { masterPrisma, getTenantClient } from '${repo}/packages/db/src/index.ts';
import { buildTestApp, createTestTenant, createTenantUser } from '${repo}/apps/api/test/helpers.ts';
if(process.env.RETAIL_FLOW_TESTS==='true') {
 await createTestTenant('test-e2e-retail','QA Retail','free');
 await createTenantUser('test-e2e-retail',{email:'dueno@e2e.local',password:'E2ePruebas!2026',rolCodigo:'dueno',nombre:'QA Dueño'});
 await createTenantUser('test-e2e-retail',{email:'cajero@e2e.local',password:'E2ePruebas!2026',rolCodigo:'cajero',nombre:'QA Cajero'});
}
const accounts=[];
for(const role of ['superadmin','support','billing']) {
 const email='qa-flow-'+role+'@example.invalid',password=randomBytes(18).toString('base64url');
 const a=await masterPrisma.adminUser.create({data:{email,passwordHash:await hash(password),role,name:'QA flows '+role}});
 accounts.push({id:a.id,email,password,role});
}
fs.writeFileSync(process.env.PLATFORM_FLOW_ACCOUNTS!,JSON.stringify(accounts),{mode:0o600});
const providerCalls={payment:0,email:0};
const orderOnly=process.env.SHOPPER_ORDER_FLOW_TESTS==='true';
function forbiddenProvider(kind) {
 providerCalls[kind]++;
 fs.writeFileSync(process.env.SHOPPER_ORDER_PROVIDER_FILE!,JSON.stringify(providerCalls),{mode:0o600});
 throw new Error('No external provider is allowed in shopper order QA');
}
if(orderOnly) fs.writeFileSync(process.env.SHOPPER_ORDER_PROVIDER_FILE!,JSON.stringify(providerCalls),{mode:0o600});
const ownerOnly=process.env.OWNER_ONBOARDING_FLOW_TESTS==='true';
if(ownerOnly && await masterPrisma.tenant.count()!==0) throw new Error('Owner onboarding QA must start without tenants');
const app=await buildTestApp(ownerOnly ? {VERTICALES_ACTIVAS:['retail_mayoreo']} : {});
if(process.env.SHOPPER_FLOW_TESTS==='true' && !ownerOnly) {
 const seed=(await import('${repo}/scripts/testing/shopper-fixture.cjs')).default;
 const fixture=await seed(app,{createTestTenant,createTenantUser,hash},{getTenantClient});
 fs.writeFileSync(process.env.SHOPPER_FIXTURE_FILE!,JSON.stringify(fixture),{mode:0o600});
}
if(orderOnly) {
 app.pagoProviderFactory=()=>forbiddenProvider('payment');
 app.emailProviderFactory=ownerOnly
  ? ()=>({codigo:'mock',enviar:async()=>forbiddenProvider('email'),enviarPlantilla:async()=>forbiddenProvider('email')})
  : ()=>forbiddenProvider('email');
}
await app.listen({host:'127.0.0.1',port:3059});
process.on('SIGTERM',async()=>{await app.close();await masterPrisma.$disconnect();process.exit(0)});
`,
      { mode: 0o600 },
    );
    const api = start(["--filter", "@gaespos/api", "exec", "tsx", fixture], "api.log");
    await ready("http://127.0.0.1:3059/health", api);
    if (ownerOnboarding) {
      const admin = start(
        [
          "--filter",
          "@gaespos/web-admin",
          "exec",
          "vite",
          "--host",
          "127.0.0.1",
          "--port",
          "5180",
          "--strictPort",
        ],
        "owner-web.log",
      );
      await ready("http://127.0.0.1:5180", admin);
      const pos = start(
        [
          "--filter",
          "@gaespos/web-pos",
          "exec",
          "vite",
          "--host",
          "127.0.0.1",
          "--port",
          "5181",
          "--strictPort",
        ],
        "pos-web.log",
      );
      await ready("http://127.0.0.1:5181", pos);
      command(["exec", "node", "scripts/testing/owner-onboarding-workflows.cjs"]);
    }
    if (shopper) {
      const shop = start(
        [
          "--filter",
          "@gaespos/web-tienda",
          "exec",
          "next",
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          "3058",
        ],
        "shopper-web.log",
        { NODE_ENV: "production" },
      );
      await ready(env.SHOPPER_TEST_URL, shop);
      if (shopperOrder) command(["exec", "node", "scripts/testing/shopper-order-workflows.cjs"]);
      else {
        command(["exec", "node", "scripts/testing/shopper-workflows.cjs"]);
        command(["exec", "node", "scripts/testing/shopper-recovery-workflows.cjs"]);
      }
      const invariant = path.join(temp, "shopper-invariants.mts");
      fs.writeFileSync(
        invariant,
        `
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {masterPrisma,getTenantClient,disconnectAllTenantClients} from '${repo}/packages/db/src/index.ts';
const fixture=JSON.parse(fs.readFileSync(process.env.SHOPPER_FIXTURE_FILE!,'utf8'));
const tc=getTenantClient(process.env.TIENDA_TENANT_SLUG!);
try {
 const current={orders:await tc.pedido.count(),ecommerceOrders:await tc.pedidoEcommerce.count(),sales:await tc.venta.count(),inventory:(await tc.inventarioSucursal.findMany({where:{varianteId:fixture.varianteId}})).map(r=>({varianteId:r.varianteId,stock:String(r.stockActual),reserved:String(r.stockReservado)}))};
 if(process.env.SHOPPER_ORDER_FLOW_TESTS==='true') {
  const result=JSON.parse(fs.readFileSync(process.env.SHOPPER_ORDER_RESULT_FILE!,'utf8'));
  assert.deepEqual(Object.keys(result).sort(),['email','folioPublico','replayCount','total']);
  assert.equal(result.email,fixture.order.email);
  assert.equal(result.total,fixture.precio);
  assert.equal(result.replayCount,2);
  assert.deepEqual(current,{...fixture.baseline,ecommerceOrders:fixture.baseline.ecommerceOrders+1});
  assert.equal(await tc.checkoutAttempt.count(),fixture.order.checkoutAttempts+1);
  const orders=await tc.pedidoEcommerce.findMany();
  assert.equal(orders.length,1);
  const order=orders[0]!;
  assert.equal(order.folioPublico,result.folioPublico);
  assert.equal(order.emailComprador,result.email);
  assert.equal(Number(order.total),Number(fixture.precio));
  assert.equal(order.clienteId,null);
  assert.equal(order.statusPago,'pendiente');
  assert.equal(order.statusPedido,'recibido');
  assert.equal(order.metodoPago,'cod');
  assert.equal(order.metodoEnvio,'click_collect');
  assert.equal(order.sucursalPickupId,fixture.order.sucursalId);
  assert.equal(order.paymentProvider,null);
  assert.equal(order.paymentAccountId,null);
  assert.equal(order.ventaIdGenerada,null);
  assert.equal(order.paymentIntentId,'mostrador_'+result.folioPublico);
  const attempts=await tc.checkoutAttempt.findMany();
  assert.equal(attempts[0]?.pedidoId,order.id);
  assert.equal(attempts[0]?.status,'ready');
  assert.deepEqual(JSON.parse(fs.readFileSync(process.env.SHOPPER_ORDER_PROVIDER_FILE!,'utf8')),{payment:0,email:0});
  if(process.env.OWNER_ONBOARDING_FLOW_TESTS==='true') {
   assert.equal(await masterPrisma.tenant.count(),1);
   const tenant=await masterPrisma.tenant.findUniqueOrThrow({where:{slug:'qa-new-owner'},include:{subscriptions:true}});
   assert.equal(tenant.subscriptions.length,1);assert.equal(tenant.subscriptions[0]?.status,'trialing');
   assert.equal(await masterPrisma.paymentMethod.count(),0);assert.equal(await masterPrisma.invoice.count(),0);
   const allUsers=await tc.usuario.findMany({include:{roles:{include:{rol:true}}}});assert.equal(allUsers.length,3);
   const system=allUsers.find(user=>user.email==='tienda-en-linea@sistema.gaessoft.invalid');assert(system);assert.deepEqual(system.roles,[]);
   const users=allUsers.filter(user=>user.id!==system.id);assert.equal(users.length,2);
   const owner=users.find(user=>user.email==='new-owner@example.invalid');assert(owner?.mfaEnabled);
   assert.deepEqual(owner.roles.map(r=>r.rol.codigo),['dueno']);
   assert.deepEqual(users.find(user=>user.email==='cashier-new-owner@example.invalid')?.roles.map(r=>r.rol.codigo),['cajero']);
   assert.equal(await tc.producto.count(),2);assert.equal(await tc.productoImagen.count(),1);
   const published=await tc.productoPublicado.findMany();assert.equal(published.length,1);assert.equal((published[0]!.fotosArray as string[]).length,1);
   const config=await tc.configTiendaEcommerce.findFirstOrThrow();assert.equal(config.activa,true);assert.equal(config.dominioPropio,null);
   const branch=await tc.sucursal.findFirstOrThrow({where:{isDefault:true}});assert.equal(branch.emailContacto,'contact-owner@example.invalid');assert.equal((branch.direccion as {cp:string}).cp,'44100');
   const sale=await tc.venta.findFirstOrThrow();assert.equal(await tc.venta.count(),1);assert.equal(sale.estado,'cobrada');assert.equal(Number(sale.total),149.9);
   const secondary=await tc.inventarioSucursal.findFirstOrThrow({where:{variante:{sku:'QA-STOCK-PENDING'}}});assert.equal(Number(secondary.stockActual),7);
   console.log('PASS disposable owner DB invariant: one public signup, two scoped human users, internal storefront user without admin roles, MFA active, one cash sale, real published photo, contact/address retained, one pickup order, no external charges/email delivery');
  }
  console.log('PASS disposable DB order invariant: one unique unpaid pickup order/attempt; no providers, POS orders, sales or stock changes');
 } else {
  assert.deepEqual(current,fixture.baseline);
  console.log('PASS disposable DB invariant: no POS/ecommerce orders/sales/stock/reservations changed');
 }
} finally {await disconnectAllTenantClients()}
`,
        { mode: 0o600 },
      );
      command(["--filter", "@gaespos/api", "exec", "tsx", invariant]);
      return;
    }
    const web = start(
      [
        "--filter",
        "@gaespos/web-superadmin",
        "exec",
        "vite",
        "--host",
        "127.0.0.1",
        "--port",
        "5179",
        "--strictPort",
      ],
      "web.log",
    );
    await ready(env.PLATFORM_TEST_URL, web);
    if (!retail) command(["exec", "node", "scripts/testing/platform-workflows.cjs"]);
    const ownerWeb = start(
      [
        "--filter",
        "@gaespos/web-admin",
        "exec",
        "vite",
        "--host",
        "127.0.0.1",
        "--port",
        "5180",
        "--strictPort",
      ],
      "owner-web.log",
    );
    await ready("http://127.0.0.1:5180", ownerWeb);
    if (retail) {
      const pos = start(
        [
          "--filter",
          "@gaespos/web-pos",
          "exec",
          "vite",
          "--host",
          "127.0.0.1",
          "--port",
          "5181",
          "--strictPort",
        ],
        "pos-web.log",
      );
      await ready("http://127.0.0.1:5181", pos);
      command(["exec", "playwright", "test", "--config", "tests/e2e/playwright.config.ts"]);
      return;
    }
    command(["exec", "node", "scripts/testing/owner-billing.cjs"]);
    command(["exec", "node", "scripts/testing/tenant-role-screens.cjs"]);
    command(["exec", "node", "scripts/testing/platform-role-screens.cjs"]);
  } catch (error) {
    if (ownerOnboarding) retainOwnerDiagnostics();
    throw error;
  } finally {
    await stopChildren();
    if (created) {
      await pg.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
        [dbName],
      );
      await pg.query(`DROP DATABASE "${dbName}"`);
    }
    await pg.end();
    fs.rmSync(temp, { recursive: true, force: true });
    console.log("Cleaned disposable workflow database and private sessions");
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
