/**
 * Entire API suite on disposable localhost PostgreSQL databases, without provider credentials.
 * Node 24: pnpm exec dotenv -e .env -- node scripts/testing/run-api-isolated.cjs
 * Optional: --shards 2 (default), --shards 1, or --incidents-only (fixed persistence suite).
 * --release-fixes-only runs incident, WebAuthn, marketplace and appointment reminder regressions.
 * Each shard gets its own DB; runs sequentially.
 * This verifies mock integrations only. It does not contact payment, mail, or AI providers.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const repo = path.resolve(__dirname, "../..");
const { Client } = require(path.join(repo, "apps/api/node_modules/pg"));

function configuration(input = process.env, args = process.argv.slice(2)) {
  const incidentsOnly = args.length === 1 && args[0] === "--incidents-only";
  const releaseFixesOnly = args.length === 1 && args[0] === "--release-fixes-only";
  if (
    !incidentsOnly &&
    !releaseFixesOnly &&
    args.length &&
    (args.length !== 2 || args[0] !== "--shards" || !["1", "2"].includes(args[1]))
  ) {
    throw Error(
      "Usage: node scripts/testing/run-api-isolated.cjs [--shards 1|2 | --incidents-only | --release-fixes-only]",
    );
  }
  let source;
  try {
    source = new URL(input.DATABASE_URL_MASTER);
  } catch {
    throw Error("DATABASE_URL_MASTER must be a localhost PostgreSQL URL");
  }
  if (
    !["postgresql:", "postgres:"].includes(source.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)
  ) {
    throw Error("Only localhost PostgreSQL is allowed");
  }
  // Never inherit Prisma schema/host overrides through the connection query string.
  source.search = "";
  source.hash = "";
  source.pathname = "/postgres";
  return {
    source,
    shards: incidentsOnly || releaseFixesOnly ? 1 : Number(args[1] ?? 2),
    files: releaseFixesOnly
      ? [
          "test/incidents-persistence.test.ts",
          "test/customer-passkeys.test.ts",
          "test/marketplace.test.ts",
          "test/tenant-recordatorios-citas.test.ts",
        ]
      : incidentsOnly
        ? ["test/incidents-persistence.test.ts"]
        : undefined,
  };
}
function decoder(tool, input) {
  return (input.PATH ?? "")
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
}
function childEnvironment(input, temp, qaUrl) {
  // An allowlist is intentional: arbitrary provider endpoints, keys, seed overrides,
  // node injection flags and personal CLI credentials must not reach test processes.
  const env = {
    PATH: input.PATH ?? "/usr/bin:/bin",
    HOME: path.join(temp, "home"),
    TMPDIR: path.join(temp, "tmp"),
    LANG: "C.UTF-8",
    TZ: "UTC",
    CI: "true",
    NO_COLOR: "1",
    NODE_ENV: "test",
    JWT_SECRET: "test-jwt-secret-must-be-at-least-32-chars-long",
    JWT_REFRESH_SECRET: "test-refresh-secret-must-be-at-least-32-chars-long",
    COOKIE_SECRET: "test-cookie-secret-must-be-at-least-32-chars-long",
    DATABASE_URL_MASTER: qaUrl,
    DATABASE_URL_TENANT: qaUrl,
    REDIS_URL: "redis://127.0.0.1:1",
    PAGOS_ALLOW_MOCK: "true",
    BILLING_SCHEDULER_ENABLED: "false",
    FLOWS_SCHEDULER_ENABLED: "false",
    RECORDATORIOS_SCHEDULER_ENABLED: "false",
    INCIDENT_AUDITOR_ENABLED: "false",
    AGENT_RUNNER_ENABLED: "false",
    SEED_ADMIN_EMAIL: "admin@gaessoft.local",
    SEED_ADMIN_PASSWORD: "ChangeMe!2026",
  };
  const browserCache = path.join(os.homedir(), ".cache", "ms-playwright");
  if (fs.existsSync(browserCache)) env.PLAYWRIGHT_BROWSERS_PATH = fs.realpathSync(browserCache);
  for (const [key, tool] of [
    ["KIOSKO_FFMPEG", "ffmpeg"],
    ["KIOSKO_FFPROBE", "ffprobe"],
  ]) {
    const executable = decoder(tool, input);
    if (executable) env[key] = fs.realpathSync(executable);
  }
  return env;
}
function terminateGroup(pid) {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {}
  const kill = setTimeout(() => {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {}
  }, 5000);
  kill.unref();
}
function privateDirectory() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gaes-api-isolated-"));
  fs.chmodSync(temp, 0o700);
  for (const subdir of ["home", "tmp"]) fs.mkdirSync(path.join(temp, subdir), { mode: 0o700 });
  return temp;
}
function removeSessions(temp) {
  for (const subdir of ["home", "tmp"])
    fs.rmSync(path.join(temp, subdir), { recursive: true, force: true });
}
function testFiles(config) {
  return (
    config.files ??
    fs
      .readdirSync(path.join(repo, "apps/api/test"), { recursive: true })
      .filter((file) => file.endsWith(".test.ts"))
      .sort()
      .map((file) => `test/${file.split(path.sep).join("/")}`)
  );
}
async function main() {
  const config = configuration(); // Validate before touching disk or opening a DB connection.
  const files = testFiles(config);
  if (!files.length) throw Error("No API test files found");
  const temp = privateDirectory();
  const results = {
    database: "disposable-localhost",
    providerCredentialsInherited: false,
    files: files.length,
    shards: [],
    cleanup: false,
  };
  const pg = new Client({ connectionString: config.source.href });
  let connected = false;
  let currentChild;
  let interrupted = false;
  let created;
  const stop = () => {
    interrupted = true;
    if (currentChild) terminateGroup(currentChild.pid);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const run = (args, env, log) =>
    new Promise((resolve, reject) => {
      if (interrupted) return reject(Error("QA interrupted"));
      const fd = fs.openSync(log, "a", 0o600);
      const child = spawn("pnpm", args, {
        cwd: repo,
        env,
        detached: true,
        stdio: ["ignore", fd, fd],
      });
      currentChild = child;
      fs.closeSync(fd);
      const timeout = setTimeout(() => terminateGroup(child.pid), 15 * 60_000);
      timeout.unref();
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("close", (code, signal) => {
        clearTimeout(timeout);
        currentChild = undefined;
        if (code === 0 && !interrupted) resolve();
        else reject(Error(`QA command failed (${signal ?? code}); inspect private shard log`));
      });
    });
  console.log(`API isolated evidence: ${temp}`);
  try {
    await pg.connect();
    connected = true;
    for (let i = 0; i < config.shards; i++) {
      if (interrupted) throw Error("QA interrupted");
      const selected = files.filter((_, index) => index % config.shards === i);
      const dbName = `qa_api_${Date.now()}_${randomBytes(6).toString("hex")}`;
      const qaUrl = new URL(config.source);
      qaUrl.pathname = `/${dbName}`;
      const env = childEnvironment(process.env, temp, qaUrl.href);
      const log = path.join(temp, `shard-${i + 1}.log`);
      const result = { shard: i + 1, files: selected, passed: false, log, databaseDropped: false };
      results.shards.push(result);
      try {
        await pg.query(`CREATE DATABASE "${dbName}"`);
        created = dbName;
        console.log(`Preparing isolated shard ${i + 1}/${config.shards}: ${selected.length} files`);
        await run(["--filter", "@gaespos/db", "prisma:migrate:deploy"], env, log);
        await run(["--filter", "@gaespos/db", "seed:master"], env, log);
        await run(["--filter", "@gaespos/api", "exec", "vitest", "run", ...selected], env, log);
        result.passed = true;
      } catch (error) {
        result.error = error.message;
        process.exitCode = 1;
      } finally {
        if (created === dbName) {
          await pg.query(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
            [dbName],
          );
          await pg.query(`DROP DATABASE "${dbName}"`);
          created = undefined;
          result.databaseDropped = true;
        }
        fs.writeFileSync(path.join(temp, "results.json"), JSON.stringify(results, null, 2), {
          mode: 0o600,
        });
      }
      console.log(
        `Shard ${i + 1}: ${result.passed ? "PASS" : "FAIL"}; disposable database removed`,
      );
    }
  } finally {
    if (connected) await pg.end();
    results.cleanup = !created;
    fs.writeFileSync(path.join(temp, "results.json"), JSON.stringify(results, null, 2), {
      mode: 0o600,
    });
    // Keep private diagnostic logs/results, remove transient sessions and CLI caches.
    removeSessions(temp);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
  if (
    results.shards.length !== config.shards ||
    results.shards.some((shard) => !shard.passed || !shard.databaseDropped)
  )
    process.exitCode = 1;
}
if (require.main === module)
  main().catch(() => {
    // PostgreSQL errors may contain configured connection details; do not print them.
    console.error("Isolated API verification failed; no configured connection details printed");
    process.exitCode = 1;
  });
module.exports = { configuration, childEnvironment, testFiles };
