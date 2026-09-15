import { describe, expect, it } from "vitest";
import { cardHtml, cardMessage } from "../src/ui/payments/card-html";
describe("card handoff", () => {
  it("only accepts token identifiers or explicit completion", () => {
    expect(cardMessage({ token: "tok_123456" })).toEqual({ token: "tok_123456" });
    expect(cardMessage({ token: "4111111111111111", cvc: "123" })).toBeNull();
    expect(cardMessage({ confirmed: "true" })).toBeNull();
    expect(cardMessage({ confirmed: true })).toEqual({ confirmed: true });
  });
  it("escapes embedded settings and keeps provider libraries inside the frame", () => {
    const html = cardHtml({ provider: "conekta", publicKey: '</script><img onerror="bad()">' });
    expect(html).not.toContain("</script><img");
    expect(html).toContain("Conekta.Token.create");
    expect(html).toContain("send({token:token.id})");
    expect(html).not.toContain("/cliente/");
  });
  it("binds Stripe Elements to the original account and existing intent", () => {
    const html = cardHtml({
      provider: "stripe",
      publicKey: "pk_test",
      clientSecret: "pi_existing_secret",
      stripeAccountId: "acct_original",
    });
    expect(html).toContain("pi_existing_secret");
    expect(html).toContain("acct_original");
    expect(html).toContain("send({confirmed:true})");
    expect(html).not.toContain('id="number"');
  });
});
