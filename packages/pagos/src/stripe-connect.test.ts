import { afterEach, describe, expect, it, vi } from "vitest";
import { StripeConnectClient } from "./stripe-connect.js";
import { PagoError } from "./types.js";

const OPTS = { apiKey: "sk_test_123" };

function mockFetch(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

afterEach(() => vi.restoreAllMocks());

describe("StripeConnectClient", () => {
  it("rechaza apiKey stub", () => {
    expect(() => new StripeConnectClient({ apiKey: "stub-x" })).toThrowError(PagoError);
  });

  it("crearCuenta → devuelve accountId y pide capabilities", async () => {
    const spy = mockFetch(200, { id: "acct_1" });
    const client = new StripeConnectClient(OPTS);
    const r = await client.crearCuenta({ email: "n@test.mx", businessName: "Abarrotes SA" });
    expect(r).toEqual({ accountId: "acct_1" });
    const body = (spy.mock.calls[0]?.[1]?.body as string) ?? "";
    expect(body).toContain("type=express");
    expect(body).toContain("country=MX");
    expect(body).toContain("capabilities");
  });

  it("crearAccountLink → devuelve url", async () => {
    mockFetch(200, { url: "https://connect.stripe.com/setup/x" });
    const client = new StripeConnectClient(OPTS);
    const r = await client.crearAccountLink({
      accountId: "acct_1",
      refreshUrl: "https://app/refresh",
      returnUrl: "https://app/return",
    });
    expect(r).toEqual({ url: "https://connect.stripe.com/setup/x" });
  });

  it("getEstadoCuenta → normaliza flags", async () => {
    mockFetch(200, {
      id: "acct_1",
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
    });
    const client = new StripeConnectClient(OPTS);
    expect(await client.getEstadoCuenta("acct_1")).toEqual({
      accountId: "acct_1",
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
    });
  });

  it("error de Stripe → PagoError", async () => {
    mockFetch(400, { error: { message: "Country not supported" } });
    const client = new StripeConnectClient(OPTS);
    await expect(client.crearCuenta({ email: "n@test.mx" })).rejects.toThrowError(PagoError);
  });
});
