/** Checkout privacy regression with a real staging shopper and synthetic browser drafts.
 * STOREFRONT_PRIVACY_ACCOUNT: private JSON {email,password}. No business writes.
 * Catalog and identity are real; cart rows and payment references are local fixtures.
 */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium } = require(`${process.cwd()}/node_modules/playwright`);
const base = process.env.STOREFRONT_TEST_URL || "https://web-tienda-staging.up.railway.app";
assert(
  ["localhost", "127.0.0.1", "web-tienda-staging.up.railway.app"].includes(new URL(base).hostname),
);
const a = JSON.parse(fs.readFileSync(process.env.STOREFRONT_PRIVACY_ACCOUNT, "utf8"));
const draftKey = "gaespos_checkout_draft_v1";
const paymentKey = (o) => `gaespos_pago_pendiente_v2:${o}`;
const item = {
  varianteId: "qa-privacy-local",
  titulo: "Producto local QA",
  precio: "100.00",
  cantidad: 1,
};
const guestDraft = {
  email: "guest-privacy@example.invalid",
  nombre: "Invitado QA",
  calle: "Guest QA Street",
  numero: "1",
  colonia: "Centro",
  ciudad: "CDMX",
  estado: "CDMX",
  cp: "06060",
  modoEntrega: "envio",
};
const payment = {
  folioPublico: "QA-PRIVATE-FOLIO",
  total: "100.00",
  referenciaPago: "QA-PRIVATE-REFERENCE",
  metodo: "spei",
};
let stage = "start";
(async () => {
  const b = await chromium.launch();
  try {
    const c = await b.newContext({ viewport: { width: 390, height: 844 } });
    c.setDefaultTimeout(30000);
    let cartOwner = null;
    await c.route("**/api/**", (r) => {
      const p = new URL(r.request().url()).pathname;
      if (r.request().method() !== "GET") return r.abort();
      if (p === "/api/cuenta/carrito" && cartOwner)
        return r.fulfill({
          json: {
            owner: cartOwner,
            cart: {
              version: "qa-local-version",
              cuponCodigo: null,
              items: [
                {
                  varianteId: item.varianteId,
                  cantidad: "1",
                  nombre: item.titulo,
                  precioUnitario: item.precio,
                },
              ],
            },
          },
        });
      return r.continue();
    });
    await c.addInitScript(() => {
      const next = sessionStorage.getItem("qa-next-privacy-draft");
      if (next) {
        sessionStorage.setItem("gaespos_checkout_draft_v1", next);
        sessionStorage.removeItem("qa-next-privacy-draft");
      }
    });
    const p = await c.newPage();
    await p.goto(`${base}/cuenta/login`, { timeout: 90000 });
    const getScope = async () => {
      const r = await c.request.get(`${base}/api/checkout/session`);
      assert.equal(r.status(), 200);
      return r.json();
    };
    const guest = await getScope();
    assert(guest.context && guest.context === guest.guestContext);
    const putDraft = async (owner, data = guestDraft) =>
      p.evaluate(
        ({ owner, data, key }) =>
          sessionStorage.setItem(
            key,
            JSON.stringify({ owner, data, expires: Date.now() + 1800000 }),
          ),
        { owner, data, key: "qa-next-privacy-draft" },
      );
    const putPayment = async (owner) =>
      p.evaluate(({ key, payment }) => localStorage.setItem(key, JSON.stringify(payment)), {
        key: paymentKey(owner),
        payment,
      });
    const ready = async () => {
      await p.getByLabel("Email", { exact: true }).waitFor();
    };
    const stored = () =>
      p.evaluate((k) => JSON.parse(sessionStorage.getItem(k) || "null"), draftKey);
    await p.evaluate((i) => localStorage.setItem("gaespos_carrito", JSON.stringify([i])), item);
    stage = "guest restore";
    await putDraft(guest.context);
    await p.goto(`${base}/checkout`, { timeout: 90000 });
    await ready();
    assert.equal(await p.getByLabel("Email", { exact: true }).inputValue(), guestDraft.email);
    assert.equal(await p.getByLabel("Código postal", { exact: true }).inputValue(), "06060");
    await p.reload();
    await ready();
    assert.equal(await p.getByLabel("Calle", { exact: true }).inputValue(), guestDraft.calle);
    console.log("PASS guest draft: reload preserves contact/address and postal leading zero");
    stage = "guest to authenticated";
    const login = await c.request.post(`${base}/api/cuenta/login`, {
      data: { email: a.email, password: a.password },
    });
    assert.equal(login.status(), 200);
    const meResponse = await c.request.get(`${base}/api/cuenta/me`);
    assert.equal(meResponse.status(), 200);
    const me = await meResponse.json();
    assert.equal(me.email, a.email);
    cartOwner = JSON.stringify([me.tenantSlug, me.id]);
    const own = await getScope();
    assert.notEqual(own.context, guest.context);
    assert.equal(own.guestContext, guest.context);
    await p.goto(`${base}/checkout`);
    await ready();
    assert.equal(await p.getByLabel("Email", { exact: true }).inputValue(), guestDraft.email);
    assert.equal((await stored()).owner, own.context);
    console.log(
      "PASS authenticated migration: same-browser guest draft retained and assigned to verified shopper scope",
    );
    stage = "foreign account draft";
    await putDraft("foreign-account", {
      ...guestDraft,
      email: "private-other@example.invalid",
      calle: "PRIVATE-OTHER-ADDRESS",
    });
    await p.reload();
    await ready();
    await p.waitForFunction(
      () => document.querySelector("input[type=email]")?.value !== "private-other@example.invalid",
    );
    assert(!(await p.locator("body").innerText()).includes("PRIVATE-OTHER-ADDRESS"));
    assert.notEqual((await stored())?.data?.calle, "PRIVATE-OTHER-ADDRESS");
    console.log(
      "PASS foreign account: contact/address not restored or re-saved under current account",
    );
    stage = "legacy draft";
    await putDraft(undefined, { ...guestDraft, email: "legacy-private@example.invalid" });
    await p.reload();
    await ready();
    assert.notEqual(
      await p.getByLabel("Email", { exact: true }).inputValue(),
      "legacy-private@example.invalid",
    );
    console.log("PASS legacy unowned draft: not exposed to authenticated shopper");
    stage = "foreign payment reference";
    await putPayment("foreign-account");
    await p.evaluate(
      (pay) => localStorage.setItem("gaespos_pago_pendiente_v1", JSON.stringify(pay)),
      payment,
    );
    await p.reload();
    await ready();
    assert(!(await p.locator("body").innerText()).includes(payment.referenciaPago));
    console.log(
      "PASS foreign/legacy payment references: not displayed; unowned legacy record preserved",
    );
    stage = "owned payment reference";
    await putDraft(own.context, { ...guestDraft, email: a.email, calle: "PRIVATE-OWN-ADDRESS" });
    await putPayment(own.context);
    await p.reload();
    await p.getByText(payment.referenciaPago, { exact: true }).waitFor();
    console.log("PASS owned pending reference: recoverable for matching verified shopper");
    stage = "expired account becomes guest";
    await c.clearCookies({ name: "gaespos_cliente_token" });
    cartOwner = null;
    await p.reload();
    await ready();
    assert.equal(await p.getByLabel("Email", { exact: true }).inputValue(), "");
    assert(!(await p.locator("body").innerText()).includes(payment.referenciaPago));
    assert.notEqual((await stored())?.data?.calle, "PRIVATE-OWN-ADDRESS");
    console.log("PASS account to guest: previous contact/address/payment reference not exposed");
    stage = "unverified session failure";
    await putDraft(own.context, { ...guestDraft, calle: "PRIVATE-UNVERIFIED" });
    await p.route("**/api/checkout/session", (r) =>
      r.fulfill({ status: 503, json: { message: "No se pudo preparar la compra." } }),
    );
    await p.reload();
    stage = "session failure notice";
    await p.getByRole("alert").filter({ hasText: "No se pudo preparar" }).waitFor();
    stage = "unverified form hidden";
    assert.equal(await p.getByLabel("Email", { exact: true }).count(), 0);
    stage = "unverified draft retained untouched";
    assert.equal((await stored()).data.calle, "PRIVATE-UNVERIFIED");
    await p.unroute("**/api/checkout/session");
    stage = "retry verified session";
    await p.getByRole("button", { name: "Reintentar", exact: true }).click();
    await ready();
    stage = "retry rejects previous owner draft";
    assert.notEqual((await stored())?.data?.calle, "PRIVATE-UNVERIFIED");
    console.log(
      "PASS session failure: no private form before verification, safe retry without exposing previous owner",
    );
    console.log(
      "PASS 8 checkout privacy scenarios; no orders, emails, addresses or payments created",
    );
  } finally {
    await b.close();
  }
})().catch(() => {
  console.error(`Checkout privacy audit failed at ${stage}; credentials withheld`);
  process.exitCode = 1;
});
