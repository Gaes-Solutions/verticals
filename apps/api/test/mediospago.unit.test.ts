import { describe, expect, it } from "vitest";
import {
  enmascararMedioPago,
  esDuplicadoMedioPago,
} from "../src/modules/cliente-portal/medios-pago-service.js";
import { iniciarCheckoutSchema } from "../src/modules/tenant/checkout/schemas.js";

// Lógica pura de "Mis tarjetas" (sin DB): exclusividad token/tarjeta guardada
// en el schema del checkout, enmascarado del DTO e idempotencia por unique.

const BASE = {
  carritoId: "cart_1",
  emailComprador: "comprador@correo.mx",
  metodoPago: "tarjeta",
  proveedorPago: "conekta",
  metodoEnvio: "paqueteria",
} as const;

function parse(body: unknown) {
  return iniciarCheckoutSchema.safeParse(body);
}

describe("iniciarCheckoutSchema — tarjeta guardada", () => {
  it("acepta tarjeta con token (flujo actual)", () => {
    expect(parse({ ...BASE, cardTokenId: "tok_123" }).success).toBe(true);
  });

  it("acepta tarjeta con medioPagoGuardadoId", () => {
    expect(parse({ ...BASE, medioPagoGuardadoId: "cmp_1" }).success).toBe(true);
  });

  it("exige exactamente una fuente con proveedor real: ninguna → error", () => {
    const r = parse(BASE);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/exactamente una fuente/);
  });

  it("exige exactamente una fuente con proveedor real: ambas → error", () => {
    const r = parse({ ...BASE, cardTokenId: "tok_1", medioPagoGuardadoId: "cmp_1" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const mensajes = r.error.issues.map((i) => i.message).join(" | ");
      expect(mensajes).toMatch(/no ambas/);
    }
  });

  it("conserva el flujo mock/demo sin token ni guardada", () => {
    expect(parse({ ...BASE, proveedorPago: "mock" }).success).toBe(true);
    expect(parse({ ...BASE, proveedorPago: "mock", cardTokenId: "tok_1" }).success).toBe(true);
  });

  it("rechaza medioPagoGuardadoId con método distinto a tarjeta", () => {
    const r = parse({ ...BASE, metodoPago: "oxxo", medioPagoGuardadoId: "cmp_1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/solo aplica/);
  });

  it("oxxo/spei con conekta no requieren token (flujo referenciado intacto)", () => {
    expect(parse({ ...BASE, metodoPago: "oxxo" }).success).toBe(true);
    expect(parse({ ...BASE, metodoPago: "spei" }).success).toBe(true);
  });
});

describe("enmascararMedioPago", () => {
  it("expone solo id y máscara (marca/last4/expiración)", () => {
    const dto = enmascararMedioPago({
      id: "cmp_1",
      marca: "visa",
      last4: "4242",
      expMes: 12,
      expAnio: 2028,
    });
    expect(dto).toEqual({ id: "cmp_1", marca: "visa", last4: "4242", expMes: 12, expAnio: 2028 });
  });

  it("el DTO solo contiene id y máscara (nada de ids de proveedor/cliente)", () => {
    const dto = enmascararMedioPago({
      id: "cmp_1",
      marca: "mastercard",
      last4: "5555",
      expMes: 1,
      expAnio: 2030,
    });
    expect(Object.keys(dto).sort()).toEqual(["expAnio", "expMes", "id", "last4", "marca"]);
  });
});

describe("esDuplicadoMedioPago", () => {
  it("detecta la violación de unique de Prisma (P2002)", () => {
    expect(esDuplicadoMedioPago({ code: "P2002", clientVersion: "6" })).toBe(true);
  });

  it("otros errores no son duplicado", () => {
    expect(esDuplicadoMedioPago({ code: "P2025" })).toBe(false);
    expect(esDuplicadoMedioPago(new Error("red"))).toBe(false);
    expect(esDuplicadoMedioPago(null)).toBe(false);
    expect(esDuplicadoMedioPago("P2002")).toBe(false);
  });
});
