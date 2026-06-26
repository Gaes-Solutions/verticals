import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { firmaValida, normalizar, publicKeyPem } from "./conekta-routes.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();

function firmar(body: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(body, "utf8");
  signer.end();
  return signer.sign(privateKey, "base64");
}

describe("firmaValida (RSA-SHA256 estilo Conekta)", () => {
  const body = JSON.stringify({ type: "order.paid", data: { object: { id: "ord_1" } } });

  it("acepta una firma válida del body", () => {
    expect(firmaValida(body, firmar(body), pem)).toBe(true);
  });

  it("rechaza si el body fue alterado", () => {
    expect(firmaValida(`${body} `, firmar(body), pem)).toBe(false);
  });

  it("rechaza si falta el header Digest", () => {
    expect(firmaValida(body, undefined, pem)).toBe(false);
  });

  it("rechaza una firma basura sin lanzar", () => {
    expect(firmaValida(body, "no-es-base64-valido", pem)).toBe(false);
  });
});

describe("publicKeyPem (normaliza PEM de Conekta)", () => {
  afterEach(() => {
    process.env.CONEKTA_WEBHOOK_PUBLIC_KEY = "";
  });

  it("reconstruye un PEM de una sola línea y verifica firmas", () => {
    const body = JSON.stringify({ type: "order.paid", data: { object: { id: "ord_x" } } });
    process.env.CONEKTA_WEBHOOK_PUBLIC_KEY = pem.replace(/\n/g, "");
    const normalizado = publicKeyPem();
    expect(normalizado).toContain("\n");
    expect(firmaValida(body, firmar(body), normalizado as string)).toBe(true);
  });

  it("acepta PEM con saltos escapados (\\n)", () => {
    process.env.CONEKTA_WEBHOOK_PUBLIC_KEY = pem.replace(/\n/g, "\\n");
    expect(publicKeyPem()).toContain("-----BEGIN PUBLIC KEY-----\n");
  });

  it("sin env → null", () => {
    expect(publicKeyPem()).toBeNull();
  });
});

describe("normalizar evento Conekta", () => {
  const obj = { id: "ord_9", amount: 15000 };

  it("order.paid → confirmado con monto", () => {
    expect(normalizar({ type: "order.paid", data: { object: obj } })).toEqual({
      intentId: "ord_9",
      status: "confirmado",
      montoCentavos: 15000,
    });
  });

  it("order.expired → fallido", () => {
    expect(normalizar({ type: "order.expired", data: { object: obj } })?.status).toBe("fallido");
  });

  it("order.refunded → reembolsado", () => {
    expect(normalizar({ type: "order.refunded", data: { object: obj } })?.status).toBe(
      "reembolsado",
    );
  });

  it("evento no relevante → null", () => {
    expect(normalizar({ type: "order.created", data: { object: obj } })).toBeNull();
  });

  it("sin id de orden → null", () => {
    expect(normalizar({ type: "order.paid", data: { object: {} } })).toBeNull();
  });
});
