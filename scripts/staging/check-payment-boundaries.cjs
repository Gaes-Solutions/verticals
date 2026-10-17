/** Anonymous, non-paying probes against the fixed staging endpoints. */
const assert = require("node:assert/strict");
const api = "https://verticals-staging.up.railway.app";
const shop = "https://web-tienda-staging.up.railway.app";

async function check(path, expected, body, headers = {}) {
  const response = await fetch(`${api}${path}`, {
    method: body ? "POST" : "GET",
    signal: AbortSignal.timeout(20000),
    headers: { "content-type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, expected, `${path}: unexpected status`);
  console.log(`PASS ${path}: ${expected}`);
}

(async () => {
  for (const route of ["/webhooks/stripe", "/webhooks/stripe/commerce"]) {
    const body = { id: "evt_qa_unsigned_boundary", type: "payment_intent.succeeded", data: {} };
    await check(route, 401, body);
    await check(route, 401, body, { "stripe-signature": "t=1,v1=invalid" });
  }
  await check("/billing/webhook", 404, { invoiceId: "qa-nonexistent-boundary" });
  for (const path of ["/billing/me", "/billing/invoices", "/admin/tenants"]) await check(path, 401);
  for (const path of [
    "/billing/payment-methods",
    "/billing/setup-intent",
    "/billing/connect/onboard",
  ])
    await check(path, 401, {});
  const response = await fetch(`${shop}/api/tienda-config`, {
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200);
  const config = await response.json();
  assert.equal(config.proveedorPago, "stripe");
  assert(Array.isArray(config.metodosPago));
  if (config.metodosPago.includes("tarjeta")) {
    assert(config.pagoPublicKey?.startsWith("pk_test_"));
    assert(config.stripeAccountId?.startsWith("acct_"));
    console.log("PASS card checkout advertises a test publishable key and merchant");
  } else {
    assert.equal(config.pagoPublicKey, null);
    console.log("PASS unavailable Stripe merchant does not advertise card checkout");
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
