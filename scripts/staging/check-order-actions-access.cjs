/** Real staging authorization smoke. No authenticated cancellation/return POST. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { request } = require("@playwright/test");
const baseURL = "https://web-tienda-staging.up.railway.app";
let stage = "private account input";
(async () => {
  const account = JSON.parse(fs.readFileSync(process.env.ORDER_ACTION_QA_ACCOUNT, "utf8"));
  const api = await request.newContext({ baseURL, timeout: 25000 });
  try {
    stage = "guest routes";
    for (const accion of ["cancelar", "devoluciones"])
      for (const method of ["get", "post"]) {
        const r = await api[method](
          `/api/cuenta/pedidos/QA-NONEXISTENT-ACTION-CHECK/${accion}`,
          method === "post" ? { data: {} } : {},
        );
        assert.equal(r.status(), 401);
        assert.match(r.headers()["cache-control"], /private.*no-store/);
      }
    console.log(
      "PASS guest: both status checks and operations require a session; private caching disabled",
    );
    stage = "buyer login";
    assert.equal(
      (
        await api.post("/api/cuenta/login", {
          data: { email: account.email, password: account.password },
        })
      ).status(),
      200,
    );
    const me = await api.get("/api/cuenta/me");
    assert.equal(me.status(), 200);
    assert.equal((await me.json()).email, account.email);
    stage = "missing order status";
    for (const accion of ["cancelar", "devoluciones"]) {
      const r = await api.get(`/api/cuenta/pedidos/QA-NONEXISTENT-ACTION-CHECK/${accion}`);
      assert.equal(r.status(), 404);
      assert.match(r.headers()["cache-control"], /private.*no-store/);
      const data = await r.json();
      assert.equal(data.confirmada, undefined);
      assert.equal(data.permitida, undefined);
    }
    console.log(
      "PASS real buyer: nonexistent order is 404 for both status checks, never confirms or unlocks an operation",
    );
  } finally {
    await api.dispose();
  }
})().catch(() => {
  console.error(`FAIL order action access at ${stage}; credentials withheld`);
  process.exitCode = 1;
});
