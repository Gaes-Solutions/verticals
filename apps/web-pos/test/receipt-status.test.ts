import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Session } from "../src/App.js";
import { Recibo } from "../src/components/Recibo.js";
import type { VentaDetalle } from "../src/lib/types.js";
const session = {
  sucursal: { nombre: "<script>alert(1)</script>" },
  caja: { codigo: "CAJA" },
  cajeroNombre: "Test",
} as Session;
const sale: VentaDetalle = {
  id: "sale",
  folio: "F-1",
  estado: "cobrada",
  total: "100",
  subtotal: "100",
  ivaTotal: "0",
  iepsTotal: "0",
  lineas: [],
  pagos: [],
};
const render = (estado: string) =>
  renderToStaticMarkup(createElement(Recibo, { session, venta: { ...sale, estado } }));
describe("print receipt status", () => {
  it("marks cancelled and draft sales so they cannot look like paid receipts", () => {
    expect(render("cancelada")).toContain("VENTA CANCELADA");
    expect(render("borrador")).toContain("NO ES COMPROBANTE DE PAGO");
    expect(render("unknown")).toContain("ESTADO DE VENTA NO VERIFICADO");
    expect(render("cobrada")).not.toContain("VENTA CANCELADA");
  });
  it("escapes receipt names rather than interpreting injected HTML", () => {
    expect(render("cobrada")).toContain("&lt;script&gt;");
    expect(render("cobrada")).not.toContain("<script>");
  });
});
