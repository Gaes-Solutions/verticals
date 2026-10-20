/** CLI safety guards stop before connecting, even with an unreachable synthetic DB. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const root = path.resolve(__dirname, "../..");
const script = path.join(__dirname, "run-platform-workflows.cjs");
function refuses(args, url, message, cwd = root) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { PATH: process.env.PATH, DATABASE_URL_MASTER: url, HOME: "/tmp" },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, message);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|connect ENETUNREACH|ENOTFOUND/);
  assert.doesNotMatch(result.stdout, /CREATE DATABASE|seed-master|Prisma/);
}
test("unknown and additional workflow arguments fail before connecting", () => {
  for (const args of [
    ["--unknown"],
    ["--shopper-e2e", "extra"],
    ["--retail-e2e", "--shopper-order-e2e"],
    ["--shopper-order-e2e", "--help"],
  ]) {
    refuses(args, "postgresql://qa:synthetic-only@127.0.0.1:1/postgres", /Invalid workflow mode/);
  }
});
test("every allowed workflow rejects query host overrides and fragments before connecting", () => {
  for (const args of [[], ["--retail-e2e"], ["--shopper-e2e"], ["--shopper-order-e2e"]]) {
    for (const suffix of ["?host=business.invalid", "?schema=business", "#business"])
      refuses(
        args,
        `postgresql://qa:synthetic-only@127.0.0.1:1/postgres${suffix}`,
        /query parameters and fragments are forbidden/,
      );
  }
});
test("remote hosts, misleading authority, non-PostgreSQL protocols and malformed URLs are rejected", () => {
  for (const url of [
    "postgresql://qa:synthetic-only@business.invalid/db",
    "postgresql://localhost@business.invalid/db",
    "https://127.0.0.1:1/db",
  ])
    refuses(["--shopper-order-e2e"], url, /Only localhost PostgreSQL/);
  refuses([], "not a URL", /localhost PostgreSQL URL is required/);
});

test("legacy API mode permits existing named tests, but refuses flags, traversal, missing files and symlinks", () => {
  for (const file of ["test/health.test.ts", "test/incident-worker.unit.ts"])
    refuses(
      ["--api-tests", file],
      "postgresql://qa:q@127.0.0.1:1/postgres?host=business.invalid",
      /query parameters and fragments are forbidden/,
    );
  for (const file of [
    "--help",
    "--config",
    "/tmp/absolute.test.ts",
    "test/../health.test.ts",
    "test/nonexistent-example.test.ts",
  ])
    refuses(
      ["--api-tests", file],
      "postgresql://qa:q@127.0.0.1:1/postgres",
      /Invalid API test file argument|API test file must exist/,
    );
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "qa-workflow-guard-"));
  try {
    const tests = path.join(temporary, "apps/api/test");
    fs.mkdirSync(tests, { recursive: true });
    const target = path.join(temporary, "outside.test.ts");
    fs.writeFileSync(target, "// synthetic");
    fs.symlinkSync(target, path.join(tests, "linked.test.ts"));
    refuses(
      ["--api-tests", "test/linked.test.ts"],
      "postgresql://qa:q@127.0.0.1:1/postgres",
      /API test file must exist and must not be a symlink/,
      temporary,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
