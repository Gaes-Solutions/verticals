import { describe, expect, it } from "vitest";
import { MockFacturamaClient } from "./mock.js";
import type { CfdiEmitirInput } from "./types.js";

const baseInput: CfdiEmitirInput = {
  folio: "1",
  fecha: new Date("2026-05-17T12:00:00Z"),
  lugarExpedicion: "44100",
  tipoComprobante: "I",
  metodoPago: "PUE",
  formaPago: "01",
  moneda: "MXN",
  emisor: {
    rfc: "AAA010101AAA",
    razonSocial: "Tienda Demo SA",
    regimenFiscal: "601",
  },
  receptor: {
    rfc: "XAXX010101000",
    razonSocial: "PÚBLICO EN GENERAL",
    codigoPostal: "44100",
    regimenFiscal: "616",
    usoCfdi: "G03",
  },
  conceptos: [
    {
      claveProdServ: "01010101",
      claveUnidad: "H87",
      cantidad: "1",
      unidad: "PZA",
      descripcion: "Producto demo",
      valorUnitario: "100",
      importe: "100",
      aplicaIva: true,
      tasaIva: "16",
    },
  ],
  subtotal: "100",
  descuento: "0",
  iva: "16",
  ieps: "0",
  total: "116",
};

describe("MockFacturamaClient", () => {
  it("emitir devuelve resultado determinista con UUID + xml + pdfBase64", async () => {
    const client = new MockFacturamaClient();
    const result = await client.emitir(baseInput);
    expect(result.folioFiscal).toMatch(/^[0-9A-F-]{36}$/);
    expect(result.facturamaId).toMatch(/^mock-/);
    expect(result.xml).toContain("cfdi:Comprobante");
    expect(result.xml).toContain(result.folioFiscal);
    expect(Buffer.from(result.pdfBase64, "base64").toString("utf-8")).toContain("PDF MOCK CFDI");
    expect(client.emitidos).toHaveLength(1);
  });

  it("cancelar devuelve estado Cancelado", async () => {
    const client = new MockFacturamaClient();
    const emit = await client.emitir(baseInput);
    const result = await client.cancelar({ facturamaId: emit.facturamaId, motivo: "02" });
    expect(result.estado).toBe("Cancelado");
    expect(result.acuse).toContain("Cancelado");
    expect(client.cancelados).toHaveLength(1);
  });

  it("failNextEmit dispara error y se desactiva", async () => {
    const client = new MockFacturamaClient({ failNextEmit: true });
    await expect(client.emitir(baseInput)).rejects.toThrow(/emitir falló/);
    const ok = await client.emitir(baseInput);
    expect(ok.folioFiscal).toBeTruthy();
  });
});
