import assert from "node:assert/strict";
import test from "node:test";
import { buildPlan, normalizeApiBase } from "./build-plan.mjs";

const csp =
  "default-src 'self'; connect-src 'self' https://old.example.test http://localhost:3000; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'";

test("normalizes explicit HTTPS API path and port", () => {
  assert.deepEqual(normalizeApiBase(" https://api.example.test:8443/api/// "), {
    base: "https://api.example.test:8443/api",
    origin: "https://api.example.test:8443",
  });
});
for (const value of [
  undefined,
  "",
  "/api",
  "http://localhost:3000/api",
  "https://user:pass@example.test/api",
  "https://@example.test",
  "https://*.example.test/api",
  "https://example.test/api?",
  "https://example.test/api?q=1",
  "https://example.test/api#",
  "https://example.test/api#fragment",
  "https://example.test\\evil",
  "https://example.test/ space",
  "javascript:alert(1)",
]) {
  test(`rejects unsafe or implicit API base ${String(value)}`, () =>
    assert.throws(() => normalizeApiBase(value)));
}
test("replaces connect-src and preserves all other CSP directives", () => {
  const plan = buildPlan("https://api.example.test/api", csp);
  assert.equal(
    plan.override.app.security.csp,
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.example.test",
  );
  assert.equal(plan.apiBase, "https://api.example.test/api");
  assert.deepEqual(plan.args, ["build"]);
});
test("passes fixed Tauri arguments instead of interpolating URL into shell code", () => {
  const plan = buildPlan("https://api.example.test/api;echo", csp, "windows", "win32");
  assert.deepEqual(plan.args, [
    "build",
    "--target",
    "x86_64-pc-windows-msvc",
    "--bundles",
    "msi,nsis",
  ]);
  assert.equal(plan.override.app.security.csp.includes("echo"), false);
  assert.equal(
    plan.args.some((value) => value.includes("example.test")),
    false,
  );
});
test("rejects cross-system packaging and free-form arguments", () => {
  assert.throws(() => buildPlan("https://api.example.test/api", csp, "windows", "linux"));
  assert.throws(() => buildPlan("https://api.example.test/api", csp, "--config evil", "linux"));
});
