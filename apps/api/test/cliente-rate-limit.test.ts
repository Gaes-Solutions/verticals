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
