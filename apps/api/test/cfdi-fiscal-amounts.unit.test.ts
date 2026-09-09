import { describe, expect, it } from "vitest";
import {
  type FiscalSaleLine,
  buildFiscalAmounts,
  buildRefundFiscalAmounts,
  prorateFiscalLine,
} from "../src/modules/tenant/cfdis/fiscal-amounts.js";

const snapshot = {
  nombreProducto: "Servicio",
  claveSat: "78102203",
  claveUnidadSat: "E48",
  aplicaIva: true,
  tasaIva: "16",
  aplicaIeps: false,
  tasaIeps: null,
};
function line(overrides: Partial<FiscalSaleLine> = {}): FiscalSaleLine {
  return {
    cantidad: "1",
    precioUnitario: "116",
    precioOriginal: "116",
    descuentoUnitario: "0",
    subtotal: "116",
    ivaTotal: "16",
    iepsTotal: "0",
    snapshotProducto: snapshot,
    ...overrides,
  };
}
function sale(lines: FiscalSaleLine[], total = "116", iva = "16", ieps = "0", discount = "0") {
  return { lineas: lines, total, ivaTotal: iva, iepsTotal: ieps, descuentoTotal: discount };
}
describe("frozen fiscal amounts", () => {
  it("preserves mixed actual IVA rates and pre-tax SAT bases", () => {
    const result = buildFiscalAmounts(
      sale(
        [
          line(),
          line({ subtotal: "108", ivaTotal: "8", snapshotProducto: { ...snapshot, tasaIva: "8" } }),
        ],
        "224",
        "24",
      ),
    );
    expect(result.subtotal).toBe("200.00");
    expect(result.conceptos.map((c) => c.tasaIva)).toEqual(["0.160000", "0.080000"]);
    expect(result.conceptos[0]).toMatchObject({
      claveUnidad: "E48",
      valorUnitario: "100.000000",
      ivaBase: "100.000000",
      ivaImporte: "16.00",
    });
  });
  it("distinguishes taxable zero from undefined exemption", () => {
    const zero = line({
      subtotal: "100",
      ivaTotal: "0",
      snapshotProducto: { ...snapshot, tasaIva: "0" },
    });
    expect(buildFiscalAmounts(sale([zero], "100", "0")).conceptos[0]).toMatchObject({
      aplicaIva: true,
      tasaIva: "0.000000",
      objetoImpuesto: "02",
    });
    zero.snapshotProducto = { ...snapshot, aplicaIva: false };
    expect(() => buildFiscalAmounts(sale([zero], "100", "0"))).toThrow(/objeto/);
    zero.snapshotProducto = { ...snapshot, aplicaIva: false, objetoImpuesto: "01" };
    expect(buildFiscalAmounts(sale([zero], "100", "0")).conceptos[0]?.objetoImpuesto).toBe("01");
  });
  it("preserves percentage IEPS and IVA base including IEPS", () => {
    const result = buildFiscalAmounts(
      sale(
        [
          line({
            subtotal: "125.28",
            ivaTotal: "17.28",
            iepsTotal: "8",
            snapshotProducto: {
              ...snapshot,
              aplicaIeps: true,
              tasaIeps: { tipo: "porcentaje", valor: "8" },
            },
          }),
        ],
        "125.28",
        "17.28",
        "8",
      ),
    );
    expect(result.conceptos[0]).toMatchObject({
      iepsBase: "100.000000",
      tasaIeps: "0.080000",
      iepsImporte: "8.00",
      ivaBase: "108.000000",
      iepsCuota: false,
    });
  });
  it("preserves recorded quota IEPS without converting quota to percent", () => {
    const result = buildFiscalAmounts(
      sale(
        [
          line({
            cantidad: "2",
            subtotal: "119",
            iepsTotal: "3",
            snapshotProducto: {
              ...snapshot,
              aplicaIeps: true,
              tasaIeps: { tipo: "cuota_por_unidad", valor: "1.5" },
            },
          }),
        ],
        "119",
        "16",
        "3",
      ),
    );
    expect(result.conceptos[0]).toMatchObject({
      iepsBase: "2.000000",
      tasaIeps: "1.500000",
      iepsCuota: true,
    });
  });
  it("converts frozen coupon gross discount into pre-tax discount", () => {
    const result = buildFiscalAmounts(
      sale(
        [
          line({
            subtotal: "104.40",
            ivaTotal: "14.4",
            descuentosAplicados: [{ fuente: "checkout", monto: "11.60" }],
          }),
        ],
        "104.40",
        "14.4",
        "0",
        "11.60",
      ),
    );
    expect(result).toMatchObject({
      subtotal: "100.00",
      descuento: "10.00",
      iva: "14.40",
      total: "104.40",
    });
    expect(result.conceptos[0]).toMatchObject({
      importe: "100.00",
      descuento: "10.00",
      ivaBase: "90.000000",
    });
  });
  // La identidad que el SAT valida sin tolerancia sobre los importes ya
  // redondeados. Antes se redondeaba cada componente por su cuenta y el
  // comprobante podía salir descuadrado por un centavo.
  it.each([
    { desc: "descuento de línea con residuo", sub: "12.15", iva: "1.6759", desc2: "1.35" },
    { desc: "precio con centavo impar", sub: "13.33", iva: "1.8386", desc2: "0" },
    { desc: "tres decimales al prorratear", sub: "99.99", iva: "13.7917", desc2: "0.01" },
  ])("cuadra la identidad del comprobante: $desc", ({ sub, iva, desc2 }) => {
    const r = buildFiscalAmounts(
      sale(
        [line({ subtotal: sub, ivaTotal: iva, descuentoUnitario: desc2 })],
        sub,
        iva,
        "0",
        desc2,
      ),
    );
    const identidad = Number(r.subtotal) - Number(r.descuento) + Number(r.iva) + Number(r.ieps);
    expect(identidad.toFixed(2)).toBe(r.total);
    // Y el encabezado debe ser exactamente la suma de los conceptos.
    const sumaImportes = r.conceptos.reduce((a, c) => a + Number(c.importe), 0);
    expect(sumaImportes.toFixed(2)).toBe(r.subtotal);
  });

  it("factura una venta con descuento de ticket (cupón sobre el total)", () => {
    // Dos líneas de 58.00 y un cupón de 16.00 sobre el ticket: el motor de
    // precios baja el total pero NO el subtotal de las líneas. Antes esto era
    // 409 permanente y ninguna venta con cupón se podía facturar.
    const r = buildFiscalAmounts(
      sale(
        [line({ subtotal: "58", ivaTotal: "8" }), line({ subtotal: "58", ivaTotal: "8" })],
        "100",
        "16",
        "0",
        "16",
      ),
    );
    expect(r.total).toBe("100.00");
    expect(r.descuento).toBe("16.00");
    const identidad = Number(r.subtotal) - Number(r.descuento) + Number(r.iva);
    expect(identidad.toFixed(2)).toBe("100.00");
    // El descuento del ticket se reparte entre las dos líneas, no cae en una.
    expect(r.conceptos.map((c) => c.descuento)).toEqual(["8.00", "8.00"]);
  });

  it.each([
    line({ snapshotProducto: {} }),
    line({ snapshotProducto: { ...snapshot, tasaIva: "8" } }),
    line({ snapshotProducto: { ...snapshot, claveSat: null } }),
  ])("rejects insufficient or inconsistent fiscal snapshots", (item) => {
    expect(() => buildFiscalAmounts(sale([item]))).toThrow();
  });
  it("blocks historical unallocated discounts and tax header mismatches", () => {
    expect(() => buildFiscalAmounts(sale([line()], "116", "16", "0", "10"))).toThrow(/descuento/);
    expect(() => buildFiscalAmounts(sale([line()], "116", "8"))).toThrow(/IVA total/);
  });
});

describe("refund fiscal allocation", () => {
  it("prorates quantity, frozen coupon, taxes and SAT metadata from original line", () => {
    const original = line({
      cantidad: "2",
      subtotal: "208.8",
      ivaTotal: "28.8",
      descuentosAplicados: [{ fuente: "checkout", monto: "23.2" }],
    });
    const result = buildRefundFiscalAmounts([prorateFiscalLine(original, "1")], "104.4");
    expect(result).toMatchObject({
      subtotal: "100.00",
      descuento: "10.00",
      iva: "14.40",
      total: "104.40",
    });
    expect(result.conceptos[0]).toMatchObject({
      cantidad: "1",
      claveUnidad: "E48",
      ivaBase: "90.000000",
    });
  });
  it("rejects excess quantity and incomplete historical snapshots", () => {
    expect(() => prorateFiscalLine(line(), "2")).toThrow(/Cantidad/);
    expect(() =>
      buildRefundFiscalAmounts([prorateFiscalLine(line({ snapshotProducto: {} }), "1")], "116"),
    ).toThrow(/Faltan/);
  });
});
