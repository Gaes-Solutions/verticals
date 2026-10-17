/** Public, read-only check of the existing Gaesland platform hostname. */
const assert = require("node:assert/strict");
const dns = require("node:dns/promises");
const { randomUUID } = require("node:crypto");
(async () => {
  const host = "gaesland.shop.angaes.com";
  const records = await dns.resolveCname(host);
  assert(records.length > 0, "Shop CNAME is missing");
  const response = await fetch(`https://${host}/api/tienda-config`, {
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200);
  const config = await response.json();
  assert.equal(config.nombre?.toUpperCase(), "GAESLAND", "Hostname routes to a different store");
  console.log("PASS existing Gaesland hostname: DNS, trusted HTTPS and correct business");
  const unknown = `qa-unassigned-${randomUUID()}.shop.angaes.com`;
  const rejected = await fetch(`https://${unknown}/api/tienda-config`, {
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(rejected.status, 503, "Unassigned hostname must not display another store");
  console.log("PASS unassigned wildcard hostname does not serve a different business");
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
