import { describe, expect, it } from "vitest";
import {
  DUNNING_MAX_ATTEMPTS,
  aplicarCupon,
  calcularProrrateo,
  formatInvoiceNumber,
  siguienteDunning,
  siguientePeriodo,
} from "./index.js";

describe("calcularProrrateo", () => {
  it("upgrade a mitad de período cobra ~50% del diff", () => {
    const r = calcularProrrateo({
      oldUnitAmount: 39900,
      newUnitAmount: 79900,
      periodStart: new Date("2026-05-01T00:00:00Z"),
      periodEnd: new Date("2026-05-31T00:00:00Z"),
      changeAt: new Date("2026-05-16T00:00:00Z"),
    });
    expect(r.daysInPeriod).toBe(30);
    expect(r.daysRemaining).toBe(15);
    // diff = (79900-39900)/30 * 15 = 20000
    expect(r.amount).toBe(20000);
  });

  it("downgrade retorna crédito (amount negativo)", () => {
    const r = calcularProrrateo({
      oldUnitAmount: 149900,
      newUnitAmount: 79900,
      periodStart: new Date("2026-05-01T00:00:00Z"),
      periodEnd: new Date("2026-05-31T00:00:00Z"),
      changeAt: new Date("2026-05-16T00:00:00Z"),
    });
    expect(r.amount).toBeLessThan(0);
  });

  it("cambio justo al final del período ⇒ amount = 0", () => {
    const r = calcularProrrateo({
      oldUnitAmount: 39900,
      newUnitAmount: 79900,
      periodStart: new Date("2026-05-01T00:00:00Z"),
      periodEnd: new Date("2026-05-31T00:00:00Z"),
      changeAt: new Date("2026-05-31T00:00:00Z"),
    });
    expect(r.amount).toBe(0);
  });
});

describe("aplicarCupon", () => {
  it("percent calcula porcentaje correctamente", () => {
    const r = aplicarCupon(10000, { discountType: "percent", discountValue: 20 });
    expect(r.discountApplied).toBe(2000);
    expect(r.amountAfter).toBe(8000);
  });

  it("percent fuera de rango ⇒ clamp a 0..100", () => {
    expect(aplicarCupon(10000, { discountType: "percent", discountValue: 150 }).amountAfter).toBe(
      0,
    );
    expect(aplicarCupon(10000, { discountType: "percent", discountValue: -10 }).amountAfter).toBe(
      10000,
    );
  });

  it("fixed descuento mayor que el monto ⇒ amountAfter no es negativo", () => {
    const r = aplicarCupon(5000, { discountType: "fixed", discountValue: 8000 });
    expect(r.amountAfter).toBe(0);
    expect(r.discountApplied).toBe(5000);
  });

  it("fixed normal", () => {
    const r = aplicarCupon(10000, { discountType: "fixed", discountValue: 2500 });
    expect(r.amountAfter).toBe(7500);
    expect(r.discountApplied).toBe(2500);
  });
});

describe("siguienteDunning", () => {
  const due = new Date("2026-05-01T00:00:00Z");

  it("primer intento: reintenta día +1", () => {
    const r = siguienteDunning({ attemptsSoFar: 0, dueDate: due });
    expect(r.action).toBe("retry");
    if (r.action === "retry") {
      expect(r.attemptNumber).toBe(1);
      expect(r.nextRetryAt.toISOString()).toBe("2026-05-02T00:00:00.000Z");
    }
  });

  it("segundo intento: día +3", () => {
    const r = siguienteDunning({ attemptsSoFar: 1, dueDate: due });
    if (r.action === "retry") expect(r.nextRetryAt.toISOString()).toBe("2026-05-04T00:00:00.000Z");
  });

  it("tercer intento: día +7", () => {
    const r = siguienteDunning({ attemptsSoFar: 2, dueDate: due });
    if (r.action === "retry") expect(r.nextRetryAt.toISOString()).toBe("2026-05-08T00:00:00.000Z");
  });

  it(`tras ${DUNNING_MAX_ATTEMPTS} intentos ⇒ suspend`, () => {
    const r = siguienteDunning({ attemptsSoFar: DUNNING_MAX_ATTEMPTS, dueDate: due });
    expect(r.action).toBe("suspend");
  });
});

describe("siguientePeriodo", () => {
  it("mensual avanza un mes", () => {
    const r = siguientePeriodo(new Date("2026-05-15T00:00:00Z"), "monthly");
    expect(r.end.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });
  it("anual avanza un año", () => {
    const r = siguientePeriodo(new Date("2026-05-15T00:00:00Z"), "yearly");
    expect(r.end.toISOString()).toBe("2027-05-15T00:00:00.000Z");
  });
});

describe("formatInvoiceNumber", () => {
  it("formato INV-YYYY-NNNNNN", () => {
    expect(formatInvoiceNumber(2026, 42)).toBe("INV-2026-000042");
  });
});
