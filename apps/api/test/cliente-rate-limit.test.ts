import { expect, it } from "vitest";
import { buildTestApp } from "./helpers.js";

it("isolates verified shoppers, keeps token rotations in the same budget, and limits forged identities by IP", async () => {
  const app = await buildTestApp({ RATE_LIMIT_MAX: 2 });
  try {
    const token = (sub: string) =>
      app.jwt.sign({ sub, email: "qa@test.local", tenantSlug: "test-rate", kind: "cliente" });
    const a = token("shopper-a");
    const b = token("shopper-b");
    const get = (access: string) =>
      app.inject({ method: "GET", url: "/health", headers: { authorization: `Bearer ${access}` } });
    expect((await get(a)).statusCode).toBe(200);
    expect((await get(a)).statusCode).toBe(200);
    expect((await get(token("shopper-a"))).statusCode).toBe(429);
    expect((await get(b)).statusCode).toBe(200);
    expect((await get("unsigned.shopper-a.token")).statusCode).toBe(200);
    expect((await get("unsigned.shopper-b.token")).statusCode).toBe(200);
    expect((await get("unsigned.shopper-c.token")).statusCode).toBe(429);
    expect((await get(b)).statusCode).toBe(200);
  } finally {
    await app.close();
  }
});

it("bounds storefront reads per tenant and isolates them from write budgets", async () => {
  const app = await buildTestApp({ RATE_LIMIT_MAX: 2, STOREFRONT_READ_RATE_LIMIT_MAX: 4 });
  try {
    const access = app.jwt.sign({
      sub: "storefront",
      email: "store@test.local",
      tenantSlug: "store-a",
      kind: "tienda_web",
    });
    const get = () =>
      app.inject({ method: "GET", url: "/health", headers: { authorization: `Bearer ${access}` } });
    for (let i = 0; i < 4; i++) expect((await get()).statusCode).toBe(200);
    expect((await get()).statusCode).toBe(429);
    // An unauthorized write still reaches authorization, rather than inheriting
    // the exhausted read budget. It never gains permission to change anything.
    const write = await app.inject({
      method: "POST",
      url: "/t/productos",
      headers: { authorization: `Bearer ${access}` },
      payload: {},
    });
    expect(write.statusCode).toBe(401);
    const other = app.jwt.sign({
      sub: "storefront",
      email: "store@test.local",
      tenantSlug: "store-b",
      kind: "tienda_web",
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/health",
          headers: { authorization: `Bearer ${other}` },
        })
      ).statusCode,
    ).toBe(200);
  } finally {
    await app.close();
  }
});
