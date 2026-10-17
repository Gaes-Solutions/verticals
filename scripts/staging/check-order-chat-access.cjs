/** Staging access smoke. Private JSON {email,password} via CHAT_QA_ACCOUNT.
 * No authenticated chat POST, no order read-marking, no messages to staff. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { request } = require("@playwright/test");
const baseURL = "https://web-tienda-staging.up.railway.app";
let stage = "private account input";
(async () => {
  const account = JSON.parse(fs.readFileSync(process.env.CHAT_QA_ACCOUNT, "utf8"));
  const api = await request.newContext({ baseURL, timeout: 25000 });
  const route = "/api/cuenta/pedidos/QA-NONEXISTENT-CHAT-CHECK/mensajes";
  try {
    stage = "guest access";
    for (const method of ["get", "post"]) {
      const res = await api[method](
        route,
        method === "post" ? { data: { cuerpo: "NOT SENT: guest authorization check" } } : {},
      );
      assert.equal(res.status(), 401);
      assert.match(res.headers()["cache-control"], /private.*no-store/);
    }
    console.log("PASS real guest GET/POST require a session and forbid private caching");
    stage = "buyer login";
    const login = await api.post("/api/cuenta/login", {
      data: { email: account.email, password: account.password },
    });
    assert.equal(login.status(), 200);
    const me = await api.get("/api/cuenta/me");
    assert.equal(me.status(), 200);
    assert.equal((await me.json()).email, account.email);
    stage = "authenticated missing order";
    const res = await api.get(route);
    assert.equal(res.status(), 404);
    assert.match(res.headers()["cache-control"], /private.*no-store/);
    assert.deepEqual(await res.json(), {
      message: "Este pedido no está disponible para tu cuenta.",
    });
    console.log(
      "PASS real authenticated missing-order GET returns private 404, no fabricated empty conversation",
    );
    stage = "fresh context";
    const guest = await request.newContext({ baseURL, timeout: 25000 });
    try {
      assert.equal((await guest.get(route)).status(), 401);
    } finally {
      await guest.dispose();
    }
    console.log(
      "PASS separate guest context has no access; no authenticated message POST performed",
    );
  } finally {
    await api.dispose();
  }
})().catch(() => {
  console.error(`FAIL chat access at ${stage}; credentials withheld`);
  process.exitCode = 1;
});
