import { describe, expect, it } from "vitest";
import { esRespuestaCheckout } from "../src/lib/checkout-response";
const result = { folioPublico: "QA-ORDER", total: "150.00", intentStatus: "confirmado" };
describe("checkout result verification", () => {
  it.each(["confirmado", "pendiente", "requiere_accion", "fallido"])(
    "accepts a complete %s result",
    (intentStatus) => {
      expect(esRespuestaCheckout({ ...result, intentStatus })).toBe(true);
    },
  );
  it.each(
    [
      null,
      [],
      {},
      { ...result, folioPublico: " " },
      { ...result, folioPublico: "x".repeat(101) },
      { ...result, total: "NaN" },
      { ...result, total: "-1" },
      { ...result, total: "1.001" },
      { ...result, total: 150 },
      { ...result, total: "1e3" },
      { ...result, intentStatus: ["confirmado"] },
      { ...result, intentStatus: "ok" },
      { ...result, referenciaPago: "" },
      { ...result, referenciaPago: "x".repeat(513) },
      { ...result, clientSecret: {} },
      { ...result, stripeAccountId: [] },
      { ...result, pagoAlRecoger: "true" },
    ].map((value) => ({ value })),
  )("rejects an unverifiable result %#", ({ value }) => {
    expect(esRespuestaCheckout(value)).toBe(false);
  });
  it("accepts referenced and Stripe pending results", () => {
    expect(
      esRespuestaCheckout({
        ...result,
        intentStatus: "pendiente",
        referenciaPago: "123456789012345678",
      }),
    ).toBe(true);
    expect(
      esRespuestaCheckout({
        ...result,
        intentStatus: "requiere_accion",
        paymentProvider: "stripe",
        clientSecret: "qa_secret",
        stripeAccountId: null,
      }),
    ).toBe(true);
  });
});
