/** Real role sessions against the runner's disposable database, never a shared environment. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { authenticator } = require(`${process.cwd()}/apps/api/node_modules/otplib`);
const { hash } = require(`${process.cwd()}/apps/api/node_modules/@node-rs/argon2`);
const { PrismaClient } = require(`${process.cwd()}/packages/db/src/generated/master/index.js`);
const url = new URL(process.env.DATABASE_URL_MASTER);
assert(
  ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/qa_platform_\d+$/.test(url.pathname),
);
const base = process.env.PLATFORM_TEST_URL;
assert.equal(new URL(base).hostname, "127.0.0.1");
const db = new PrismaClient();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gaes-role-screens-"));
fs.chmodSync(dir, 0o700);
async function post(route, data, token) {
  const response = await fetch(`${base}/api${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  assert.equal(response.status, 200, `Role authentication ${route}`);
  return response.json();
}
(async () => {
  const accounts = [];
  try {
    for (const role of ["superadmin", "support", "billing"]) {
      const email = `qa-role-screen-${role}@example.invalid`;
      const password = randomBytes(20).toString("base64url");
      const secret = authenticator.generateSecret();
      await db.adminUser.create({
        data: {
          email,
          passwordHash: await hash(password),
          name: `QA ${role}`,
          role,
          mfaSecret: secret,
          mfaVerifiedAt: new Date(),
        },
      });
      const challenge = await post("/auth/login", { email, password });
      if (Date.now() % 30000 > 26000) await new Promise((r) => setTimeout(r, 4500));
      const session = await post(
        "/auth/mfa/verify",
        { code: authenticator.generate(secret) },
        challenge.mfaToken,
      );
      assert(session.accessToken);
      accounts.push({ role, token: session.accessToken });
    }
    const file = path.join(dir, "accounts.json");
    fs.writeFileSync(file, JSON.stringify(accounts), { mode: 0o600 });
    const env = { ...process.env, PLATFORM_QA_ACCOUNTS: file };
    execFileSync(process.execPath, ["scripts/staging/check-platform-screens.cjs"], {
      env,
      stdio: "inherit",
      timeout: 480000,
    });
    execFileSync(process.execPath, ["scripts/staging/check-platform-recovery.cjs"], {
      env,
      stdio: "inherit",
      timeout: 180000,
    });
  } finally {
    await db.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
