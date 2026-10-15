/** Full local UI workflows against a disposable PostgreSQL database.
 * Run: pnpm exec dotenv -e .env -- node scripts/testing/run-platform-workflows.cjs
 * Requires localhost PostgreSQL with CREATE DATABASE. Never uses production data or provider keys.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { Client } = require(`${process.cwd()}/apps/api/node_modules/pg`);
const repo = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gaes-platform-flows-"));
fs.chmodSync(temp, 0o700);
const source = new URL(process.env.DATABASE_URL_MASTER);
if (!["localhost", "127.0.0.1"].includes(source.hostname))
  throw Error("Only localhost databases allowed");
const dbName = `qa_platform_${Date.now()}`;
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
  if (/STRIPE|CONEKTA|RESEND|SMTP|SENTRY|OPENAI|ANTHROPIC|KIMI|AWS_/.test(key)) delete env[key];
const children = [];
function command(args) {
  const r = spawnSync("pnpm", args, { cwd: repo, env, stdio: "inherit" });
  if (r.status !== 0) throw Error(`QA command failed: ${args[0]}`);
}
function start(args, name) {
  const fd = fs.openSync(path.join(temp, name), "w", 0o600);
  const child = spawn("pnpm", args, { cwd: repo, env, detached: true, stdio: ["ignore", fd, fd] });
  fs.closeSync(fd);
  children.push(child);
  return child;
}
async function ready(url, child) {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw Error("QA server failed to start");
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw Error("QA server startup timed out");
}
(async () => {
  const pg = new Client({ connectionString: source.href });
  await pg.connect();
  let created = false;
  try {
    // Fail if the fixed QA ports are already occupied; do not reuse an unknown server.
    for (const url of ["http://127.0.0.1:3059/health", "http://127.0.0.1:5179"]) {
      let occupied = false;
      try {
        await fetch(url, { signal: AbortSignal.timeout(1000) });
        occupied = true;
      } catch {}
      if (occupied) throw Error("QA ports 3059/5179 are in use");
    }
    await pg.query(`CREATE DATABASE "${dbName}"`);
    created = true;
    command(["--filter", "@gaespos/db", "prisma:migrate:deploy"]);
    command(["--filter", "@gaespos/db", "seed:master"]);
    const fixture = path.join(temp, "api.mts");
    fs.writeFileSync(
      fixture,
      `
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hash } from '${repo}/apps/api/node_modules/@node-rs/argon2/index.js';
import { masterPrisma } from '${repo}/packages/db/src/index.ts';
import { buildTestApp } from '${repo}/apps/api/test/helpers.ts';
const accounts=[];
for(const role of ['superadmin','support','billing']) {
 const email='qa-flow-'+role+'@example.invalid',password=randomBytes(18).toString('base64url');
 const a=await masterPrisma.adminUser.create({data:{email,passwordHash:await hash(password),role,name:'QA flows '+role}});
 accounts.push({id:a.id,email,password,role});
}
fs.writeFileSync(process.env.PLATFORM_FLOW_ACCOUNTS!,JSON.stringify(accounts),{mode:0o600});
const app=await buildTestApp();await app.listen({host:'127.0.0.1',port:3059});
process.on('SIGTERM',async()=>{await app.close();await masterPrisma.$disconnect();process.exit(0)});
`,
      { mode: 0o600 },
    );
    const api = start(["--filter", "@gaespos/api", "exec", "tsx", fixture], "api.log");
    await ready("http://127.0.0.1:3059/health", api);
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
    command(["exec", "node", "scripts/testing/platform-workflows.cjs"]);
  } finally {
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
