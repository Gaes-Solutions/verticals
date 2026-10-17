/** Staging PostgreSQL advisory-lock smoke. SELECT and transactions only;
 * no order/return records are created or modified. */
const { execFileSync } = require("node:child_process");
async function remote() {
  const assert = require("node:assert/strict");
  assert(
    process.env.RAILWAY_PROJECT_ID === "267fca4e-67c2-4c3a-9c54-0044f8834c1a" &&
      process.env.RAILWAY_ENVIRONMENT_NAME === "staging",
  );
  const url = new URL(process.env.DATABASE_URL_TENANT);
  assert.equal(url.hostname, "postgres-sywn.railway.internal");
  url.searchParams.set("schema", "tenant_gaesland");
  const { PrismaClient } = require("/app/node_modules/@gaespos/db/src/generated/tenant/index.js");
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const peer = new PrismaClient({ datasources: { db: { url: url.href } } });
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':solicitud_devolucion', 7710024))`;
      const [during] =
        await peer.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ':solicitud_devolucion', 7710024)) AS acquired`;
      assert.equal(during.acquired, false);
      const [other] =
        await peer.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended('qa_other_tenant:solicitud_devolucion', 7710024)) AS acquired`;
      assert.equal(other.acquired, true);
    });
    const [after] =
      await peer.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ':solicitud_devolucion', 7710024)) AS acquired`;
    assert.equal(after.acquired, true);
    console.log(
      "PASS real PostgreSQL: same-tenant lock excludes a second connection, releases on commit and separates another tenant key",
    );
  } finally {
    await db.$disconnect();
    await peer.$disconnect();
  }
}
try {
  const output = execFileSync(
    "railway",
    [
      "ssh",
      "--project",
      "267fca4e-67c2-4c3a-9c54-0044f8834c1a",
      "--environment",
      "staging",
      "--service",
      "verticals",
      "--",
      "node",
      "-e",
      `(${remote.toString()})().catch(()=>{console.error('Staging lock check failed');process.exitCode=1;})`,
    ],
    { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] },
  );
  console.log(
    output
      .split("\n")
      .filter((line) => line.startsWith("PASS "))
      .join("\n"),
  );
} catch {
  console.error("FAIL guarded staging PostgreSQL lock check; connection details withheld");
  process.exitCode = 1;
}
