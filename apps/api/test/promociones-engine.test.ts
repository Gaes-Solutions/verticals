import type { TicketCalculado } from "@gaespos/pricing";
import { describe, expect, it } from "vitest";
import {
  type PromoEvaluable,
  aplicarPromocionesATicket,
} from "../src/modules/tenant/promociones/service.js";

function promo(overrides: Partial<PromoEvaluable>): PromoEvaluable {
  return {
    id: "promo-1",
    tipo: "regalo_con_compra",
    acciones: {},
    condiciones: {},
    prioridad: 100,
    stackConOtras: false,
    horarios: null,
    canales: ["todos"],
    sucursalesAplicables: [],
    productosIncluidos: new Set(),
    productosExcluidos: new Set(),
    productosComprados: new Set(),
    productosRegalo: new Set(),
    ...overrides,
  };
}

/** Ticket de dos líneas: A = disparador (comprado), B = regalo. */
function ticketDosLineas(qtyA: number, puA: number, qtyB: number, puB: number): TicketCalculado {
  const subA = qtyA * puA;
  const subB = qtyB * puB;
  return {
    lineas: [
      {
        productoVarianteId: "var-A",
        cantidad: qtyA,
        precioBase: puA,
        precioUnitario: puA,
        precioMinimoViolado: false,
        subtotal: subA,
        descuentos: [],
      },
      {
        productoVarianteId: "var-B",
        cantidad: qtyB,
        precioBase: puB,
        precioUnitario: puB,
        precioMinimoViolado: false,
        subtotal: subB,
        descuentos: [],
      },
    ],
    subtotal: subA + subB,
    descuentosTicket: [],
    total: subA + subB,
  };
}

const varianteAProducto = new Map([
  ["var-A", "prod-A"],
  ["var-B", "prod-B"],
]);

describe("regalo_con_compra", () => {
  it("regala gratis (100%) la unidad de regalo al cumplir la compra", () => {
    const p = promo({
      acciones: { cantidadRequerida: 3, cantidadRegalo: 1, descuentoPct: 100 },
      productosComprados: new Set(["prod-A"]),
      productosRegalo: new Set(["prod-B"]),
    });
    const res = aplicarPromocionesATicket(ticketDosLineas(3, 10, 1, 20), [p], varianteAProducto);
    expect(res.descuentoPromoTotal).toBe("20.0000");
    expect(res.ticket.total).toBe("30");
    expect(res.aplicaciones[0]?.productosAfectados).toEqual(["var-B"]);
  });

  it("aplica descuento parcial configurable (50%) sobre el regalo", () => {
    const p = promo({
      acciones: { cantidadRequerida: 2, cantidadRegalo: 1, descuentoPct: 50 },
      productosComprados: new Set(["prod-A"]),
      productosRegalo: new Set(["prod-B"]),
    });
    const res = aplicarPromocionesATicket(ticketDosLineas(2, 10, 1, 20), [p], varianteAProducto);
    expect(res.descuentoPromoTotal).toBe("10.0000");
    expect(res.ticket.total).toBe("30");
  });

  it("no aplica si no se alcanza la cantidad requerida", () => {
    const p = promo({
      acciones: { cantidadRequerida: 3, cantidadRegalo: 1, descuentoPct: 100 },
      productosComprados: new Set(["prod-A"]),
      productosRegalo: new Set(["prod-B"]),
    });
    const res = aplicarPromocionesATicket(ticketDosLineas(2, 10, 1, 20), [p], varianteAProducto);
    expect(res.descuentoPromoTotal).toBe("0.0000");
    expect(res.aplicaciones).toHaveLength(0);
  });

  it("escala el regalo: comprar 6 con req 3 regala 2 unidades", () => {
    const p = promo({
      acciones: { cantidadRequerida: 3, cantidadRegalo: 1, descuentoPct: 100 },
      productosComprados: new Set(["prod-A"]),
      productosRegalo: new Set(["prod-B"]),
    });
    const res = aplicarPromocionesATicket(ticketDosLineas(6, 10, 2, 20), [p], varianteAProducto);
    expect(res.descuentoPromoTotal).toBe("40.0000");
    expect(res.ticket.total).toBe("60");
  });

  it("no regala más unidades de las que hay en el ticket", () => {
    const p = promo({
      acciones: { cantidadRequerida: 3, cantidadRegalo: 2, descuentoPct: 100 },
      productosComprados: new Set(["prod-A"]),
      productosRegalo: new Set(["prod-B"]),
    });
    // gana 2 regalos pero solo hay 1 unidad de B en el ticket → tope a 1
    const res = aplicarPromocionesATicket(ticketDosLineas(3, 10, 1, 20), [p], varianteAProducto);
    expect(res.descuentoPromoTotal).toBe("20.0000");
  });
});
