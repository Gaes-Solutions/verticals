import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildTestApp } from "./helpers.js";

let app: FastifyInstance;
let proxied: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp({ RATE_LIMIT_MAX: 2, TRUST_PROXY_HOPS: 1 });
  proxied = await buildTestApp({ RATE_LIMIT_MAX: 2, TRUST_PROXY_PEERS: "loopback" });
});
afterAll(async () => {
  await app?.close();
  await proxied?.close();
});

it("does not let forged forwarding headers rotate an anonymous request budget", async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await app.inject({
      url: "/health",
      remoteAddress: "198.51.100.10",
      headers: {
        "x-forwarded-for": `203.0.113.${attempt}`,
        "x-real-ip": `203.0.113.${attempt}`,
        "x-forwarded-host": "attacker.invalid",
      },
    });
    expect(response.statusCode).toBe(attempt <= 2 ? 200 : 429);
  }
});

it("keeps a separate budget for an actually different socket peer", async () => {
  const response = await app.inject({
    url: "/health",
    remoteAddress: "198.51.100.11",
    headers: { "x-forwarded-for": "203.0.113.3" },
  });
  expect(response.statusCode).toBe(200);
});

it("accepts forwarded identity only from an explicitly configured peer", async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await proxied.inject({
      url: "/health",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "203.0.113.20" },
    });
    expect(response.statusCode).toBe(attempt <= 2 ? 200 : 429);
  }
  const other = await proxied.inject({
    url: "/health",
    remoteAddress: "127.0.0.1",
    headers: { "x-forwarded-for": "203.0.113.21" },
  });
  expect(other.statusCode).toBe(200);
});

it("rejects header rotation from a peer outside the configured proxy range", async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await proxied.inject({
      url: "/health",
      remoteAddress: "198.51.100.30",
      headers: { "x-forwarded-for": `203.0.113.${attempt + 30}` },
    });
    expect(response.statusCode).toBe(attempt <= 2 ? 200 : 429);
  }
});
