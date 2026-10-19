const assert = require("node:assert/strict");
const test = require("node:test");
const { configuration, childEnvironment, testFiles } = require("./run-api-isolated.cjs");

test("refuses non-local DBs and unsafe CLI arguments before connecting", () => {
  for (const url of [
    "postgres://user:secret@production.example/db",
    "https://localhost/db",
    "not a URL",
    undefined,
  ]) {
    assert.throws(() => configuration({ DATABASE_URL_MASTER: url }, []));
  }
  assert.throws(() =>
    configuration({ DATABASE_URL_MASTER: "postgres://localhost/dev" }, ["test/auth.test.ts"]),
  );
  assert.throws(() =>
    configuration({ DATABASE_URL_MASTER: "postgres://localhost/dev" }, ["--shards", "99"]),
  );
});

test("maintenance connection never uses configured business database or query overrides", () => {
  const { source, shards } = configuration(
    {
      DATABASE_URL_MASTER:
        "postgresql://user:password@127.0.0.1:5432/business?schema=private&host=production.example#x",
    },
    ["--shards", "2"],
  );
  assert.equal(source.hostname, "127.0.0.1");
  assert.equal(source.pathname, "/postgres");
  assert.equal(source.search, "");
  assert.equal(source.hash, "");
  assert.equal(shards, 2);
});

test("children receive only controlled QA settings; no providers, injection flags, personal home or seed overrides", () => {
  const env = childEnvironment(
    {
      PATH: "",
      HOME: "/personal",
      JWT_SECRET: "business-secret",
      JWT_REFRESH_SECRET: "business-refresh-secret",
      COOKIE_SECRET: "business-cookie-secret",
      NODE_OPTIONS: "--require /malicious.cjs",
      PLAYWRIGHT_BROWSERS_PATH: "/production/secrets",
      OPENAI_API_KEY: "private",
      EMAIL_REMITENTE: "real@example.com",
      PAYMENT_SERVICE_URL: "https://production.example",
      SEED_ADMIN_PASSWORD: "real",
      DATABASE_URL_TENANT: "postgres://production/real",
    },
    "/tmp/private-qa",
    "postgres://localhost/qa_api_generated",
  );
  assert.equal(env.HOME, "/tmp/private-qa/home");
  assert.equal(env.DATABASE_URL_TENANT, "postgres://localhost/qa_api_generated");
  assert.equal(env.DATABASE_URL_MASTER, env.DATABASE_URL_TENANT);
  assert.equal(env.PAGOS_ALLOW_MOCK, "true");
  assert.equal(env.JWT_SECRET, "test-jwt-secret-must-be-at-least-32-chars-long");
  assert.equal(env.JWT_REFRESH_SECRET, "test-refresh-secret-must-be-at-least-32-chars-long");
  assert.equal(env.COOKIE_SECRET, "test-cookie-secret-must-be-at-least-32-chars-long");
  assert.equal(env.SEED_ADMIN_PASSWORD, "ChangeMe!2026");
  assert.equal(env.INCIDENT_AUDITOR_ENABLED, "false");
  assert.equal(env.AGENT_RUNNER_ENABLED, "false");
  assert.notEqual(env.PLAYWRIGHT_BROWSERS_PATH, "/production/secrets");
  for (const key of ["OPENAI_API_KEY", "EMAIL_REMITENTE", "PAYMENT_SERVICE_URL", "NODE_OPTIONS"])
    assert.equal(Object.hasOwn(env, key), false);
});

test("incidents-only selection is fixed; does not accept arbitrary paths or combined overrides", () => {
  const input = { DATABASE_URL_MASTER: "postgres://localhost/dev" };
  const config = configuration(input, ["--incidents-only"]);
  assert.equal(config.shards, 1);
  assert.deepEqual(config.files, ["test/incidents-persistence.test.ts"]);
  assert.throws(() => configuration(input, ["--incidents-only", "test/other.test.ts"]));
  assert.throws(() => configuration(input, ["--incidents-only", "--shards", "2"]));
});

test("release fixes mode runs exactly incident persistence, browser passkey and marketplace regressions", () => {
  const input = { DATABASE_URL_MASTER: "postgres://localhost/dev" };
  const config = configuration(input, ["--release-fixes-only"]);
  assert.equal(config.shards, 1);
  assert.deepEqual(testFiles(config), [
    "test/incidents-persistence.test.ts",
    "test/customer-passkeys.test.ts",
    "test/marketplace.test.ts",
  ]);
  assert.throws(() => configuration(input, ["--release-fixes-only", "test/other.test.ts"]));
  assert.throws(() => configuration(input, ["--release-fixes-only", "--shards", "2"]));
  const allFiles = testFiles(configuration(input, []));
  assert.ok(allFiles.length >= 117);
  assert.ok(allFiles.includes("test/incidents-persistence.test.ts"));
});
