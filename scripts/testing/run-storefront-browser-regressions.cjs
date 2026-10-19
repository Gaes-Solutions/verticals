/** Controlled-response storefront regression checks; never enables real order/provider writes. */
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const output = "/tmp/gaes-full-storefront-audit";
fs.mkdirSync(output, { recursive: true });
const css = "/tmp/gaes-audit-storefront.css";
if (!fs.existsSync(css))
  throw Error("Generate the storefront Tailwind CSS before running this check");
const cases = [
  ["address-recovery", "ADDRESS"],
  ["cart-verification-ui", "VERIFICATION"],
  ["cupon-ui", "CUPON"],
  ["payment-forms-ui", "PAYMENT"],
  ["perfil-ui"],
  ["passkeys-ui", "PASSKEY"],
  ["notificaciones-ui", "NOTIFICACIONES"],
  ["tarjetas-ui", "TARJETAS"],
  ["invoice-ui", "INVOICE"],
  ["order-actions", "ORDER_ACTION"],
  ["order-chat", "CHAT"],
  ["order-status"],
  ["shipping-reference-ui", "SHIPPING"],
  ["preferencias-ui", "PREFERENCIAS"],
];
const results = [];
let index = 0;
async function worker() {
  for (;;) {
    const current = cases[index++];
    if (!current) return;
    const [name, prefix] = current;
    const env = { ...process.env, ...(prefix ? { [`${prefix}_QA_CSS`]: css } : {}) };
    // Optional published modes must not silently change which fixture harness runs.
    for (const key of [
      "VERIFICATION_QA_URL",
      "RECOVERY_QA_URL",
      "SUGGESTIONS_QA_URL",
      "PREFERENCIAS_QA_URL",
    ])
      delete env[key];
    const start = Date.now();
    const result = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [path.join("scripts/staging", `check-${name}.cjs`)],
        { cwd: process.cwd(), env, timeout: 180000, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => {
          fs.writeFileSync(path.join(output, `${name}.log`), `${stdout}\n${stderr}`);
          resolve({
            name,
            ok: !error,
            seconds: Math.round((Date.now() - start) / 1000),
            ...(error ? { code: error.code, signal: error.signal } : {}),
          });
        },
      );
    });
    results.push(result);
    console.log(JSON.stringify(result));
  }
}
(async () => {
  await Promise.all([worker(), worker()]);
  fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(results, null, 2));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
})();
