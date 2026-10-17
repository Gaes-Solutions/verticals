/** Read-only staging invoice-route smoke. Private JSON {email,password} in
 * STOREFRONT_INVOICE_ACCOUNT. No authenticated invoice POST or fiscal issuance. */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { request } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
let stage = "private account input";
(async () => {
  const account = JSON.parse(fs.readFileSync(process.env.STOREFRONT_INVOICE_ACCOUNT, "utf8"));
  const api = await request.newContext({ baseURL: base });
  const route = "/api/cuenta/pedidos/QA-NONEXISTENT-INVOICE-CHECK/factura";
  try {
    stage = "guest routes";
    for (const [method, url] of [
      ["get", route],
      ["post", route],
      ["get", `${route}/pdf`],
    ]) {
      const response = await api[method](url, { data: method === "post" ? {} : undefined });
      assert.equal(response.status(), 401);
      assert.match(response.headers()["cache-control"], /private.*no-store/);
    }
    console.log(
      "PASS guest: state, issuance and PDF require a session and disable private caching",
    );
    stage = "real buyer login";
    const login = await api.post("/api/cuenta/login", {
      data: { email: account.email, password: account.password },
    });
    assert.equal(login.status(), 200);
    const me = await api.get("/api/cuenta/me");
    assert.equal(me.status(), 200);
    assert.equal((await me.json()).email, account.email);
    stage = "authenticated missing invoice";
    const state = await api.get(route);
    assert.equal(state.status(), 200);
    assert.equal(await state.json(), null);
    const pdf = await api.get(`${route}/pdf`);
    assert.equal(pdf.status(), 404);
    assert.match(pdf.headers()["cache-control"], /private.*no-store/);
    assert.match(pdf.headers()["content-type"], /application\/json/);
    console.log(
      "PASS real buyer: missing invoice returns null state and private PDF 404, no fabricated document",
    );
    stage = "session removal";
    const guest = await request.newContext({ baseURL: base });
    try {
      assert.equal((await guest.get(`${route}/pdf`)).status(), 401);
    } finally {
      await guest.dispose();
    }
    console.log("PASS separate unauthenticated context cannot download a PDF");
    console.log(
      "PASS published invoice access; no authenticated issuance request, no fiscal/email/order writes",
    );
  } finally {
    await api.dispose();
  }
})().catch(() => {
  console.error(`FAIL invoice access at ${stage}; credentials withheld`);
  process.exitCode = 1;
});
