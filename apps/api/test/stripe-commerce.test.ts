import { createHmac, randomUUID } from "node:crypto";
import { getTenantClient, masterPrisma } from "@gaespos/db";
import { StripeClient } from "@gaespos/pagos";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const slug = "test-stripe-commerce";
const account = "acct_merchant";
const secret = "whsec_commerce_test";
let app: FastifyInstance;
let token: string;
let other: string;
let branch: string;
let variant: string;
let current: Record<string, unknown>;
let pi = 0;
let attempts = 0;
const auth = () => ({ authorization: `Bearer ${token}` });
const request = (key: string, who = token) =>
  app.inject({
    method: "GET",
    url: `/t/checkout/intentos/${key}`,
    headers: { authorization: `Bearer ${who}` },
  });
async function start() {
  const cart = await app.inject({
    method: "POST",
    url: "/t/tienda",
    headers: auth(),
    payload: {
      sessionIdAnonimo: randomUUID(),
      canal: "web",
      items: [{ varianteId: variant, cantidad: 1 }],
    },
  });
  expect(cart.statusCode).toBe(201);
  const key = randomUUID();
  const res = await app.inject({
    method: "POST",
    url: "/t/checkout/iniciar",
    headers: auth(),
    payload: {
      carritoId: cart.json().id,
      idempotencyKey: key,
      emailComprador: "qa@example.invalid",
      metodoPago: "tarjeta",
      proveedorPago: "stripe",
      metodoEnvio: "click_collect",
      sucursalPickupId: branch,
    },
  });
  return { res, key };
}
function webhook(signatureValid = true, eventAccount = account) {
  const payload = JSON.stringify({
    type: "payment_intent.succeeded",
    account: eventAccount,
    data: { object: current },
  });
  const t = Math.floor(Date.now() / 1000);
  const signature = `t=${t},v1=${createHmac("sha256", signatureValid ? secret : "wrong")
    .update(`${t}.${payload}`)
    .digest("hex")}`;
  return app.inject({
    method: "POST",
    url: "/webhooks/stripe/commerce",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    payload,
  });
}
beforeAll(async () => {
  vi.stubEnv("STRIPE_API_KEY", "sk_test_commerce");
  vi.stubEnv("STRIPE_COMMERCE_WEBHOOK_SECRET", secret);
  app = await buildTestApp(
    {},
    {
      pagoProviderFactory: () =>
        new StripeClient({ apiKey: "sk_test_commerce", webhookSecret: secret }),
    },
  );
  await createTestTenant(slug);
  await masterPrisma.tenant.update({
    where: { slug },
    data: { stripeAccountId: account, stripeAccountStatus: "enabled" },
  });
  for (const email of ["owner-commerce@test.local", "other-commerce@test.local"]) {
    await createTenantUser(slug, { email, password: "ChangeMe!2026", rolCodigo: "dueno" });
    const session = await loginTenantUser(app, slug, email, "ChangeMe!2026");
    if (email.startsWith("owner")) token = session.accessToken;
    else other = session.accessToken;
  }
  branch = (await getTenantClient(slug).sucursal.findFirstOrThrow()).id;
  const product = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(),
    payload: {
      skuPadre: "STRIPE-QA",
      nombre: "Stripe QA",
      precioBase: "100",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  expect(product.statusCode).toBe(201);
  variant = product.json().variantes[0].id;
  await getTenantClient(slug).inventarioSucursal.create({
    data: { varianteId: variant, sucursalId: branch, stockActual: "100" },
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});
function providerMock() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    expect(url).toContain("https://api.stripe.com/v1/payment_intents");
    expect((init?.headers as Record<string, string>)["Stripe-Account"]).toBe(account);
    if (init?.method === "POST") {
      const form = new URLSearchParams(String(init.body));
      attempts++;
      current = {
        id: `pi_${++pi}`,
        client_secret: `pi_${pi}_secret_test`,
        status: "requires_payment_method",
        amount: Number(form.get("amount")),
        amount_received: 0,
        currency: form.get("currency"),
        metadata: {
          pedidoId: form.get("metadata[pedidoId]"),
          tenantSlug: form.get("metadata[tenantSlug]"),
        },
      };
      expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
        `checkout_${(current.metadata as Record<string, string>).pedidoId}`,
      );
    }
    return new Response(JSON.stringify(current));
  });
}
describe("store Stripe reconciliation", () => {
  it("requires merchant Connect before any intent; never charges platform fallback", async () => {
    providerMock();
    await masterPrisma.tenant.update({ where: { slug }, data: { stripeAccountStatus: "pending" } });
    try {
      const n = attempts;
      const { res } = await start();
      expect(res.statusCode).toBe(503);
      expect(attempts).toBe(n);
    } finally {
      await masterPrisma.tenant.update({
        where: { slug },
        data: { stripeAccountStatus: "enabled" },
      });
    }
  });
  it("persists intent before confirmation, denies another owner, resumes declined card on same intent", async () => {
    providerMock();
    const { res, key } = await start();
    expect(res.statusCode).toBe(201);
    expect(res.json().clientSecret).toContain("_secret_");
    expect((await request(key, other)).statusCode).toBe(404);
    const n = attempts;
    const pending = await request(key);
    expect(pending.statusCode).toBe(200);
    expect(pending.json().intentId).toBe(current.id);
    expect(pending.json().intentStatus).toBe("pendiente");
    expect(attempts).toBe(n);
    current = { ...current, status: "succeeded", amount_received: current.amount };
    const paid = await request(key);
    expect(paid.statusCode, paid.body).toBe(200);
    expect(paid.json().intentStatus).toBe("confirmado");
    expect(paid.json().clientSecret).toBeUndefined();
    const client = getTenantClient(slug);
    const before = await client.venta.count();
    await request(key);
    expect(await client.venta.count()).toBe(before);
  });
  it.each(["amount", "currency", "metadata", "amount_received"])(
    "rejects a provider receipt with wrong %s",
    async (field) => {
      providerMock();
      const { res, key } = await start();
      expect(res.statusCode).toBe(201);
      current = {
        ...current,
        status: "succeeded",
        amount_received: current.amount,
        [field]:
          field === "currency"
            ? "usd"
            : field === "metadata"
              ? { pedidoId: "foreign", tenantSlug: slug }
              : 1,
      };
      expect((await request(key)).statusCode).toBe(422);
      expect(
        (
          await getTenantClient(slug).pedidoEcommerce.findUniqueOrThrow({
            where: { id: res.json().pedidoId },
          })
        ).statusPago,
      ).toBe("pendiente");
    },
  );
  it("fulfills from signed webhook without browser and deduplicates redelivery", async () => {
    providerMock();
    const { res } = await start();
    expect(res.statusCode).toBe(201);
    current = { ...current, status: "succeeded", amount_received: current.amount };
    expect((await webhook(false)).statusCode).toBe(401);
    expect((await webhook(true, "acct_foreign")).statusCode).toBe(503);
    expect((await webhook()).statusCode).toBe(200);
    const client = getTenantClient(slug);
    const p = await client.pedidoEcommerce.findUniqueOrThrow({
      where: { id: res.json().pedidoId },
    });
    expect(p.statusPago).toBe("pago_confirmado");
    expect(p.ventaIdGenerada).toBeTruthy();
    const count = await client.venta.count();
    expect((await webhook()).statusCode).toBe(200);
    expect(await client.venta.count()).toBe(count);
  });
});
