import { afterEach, describe, expect, it, vi } from "vitest";
import { FacturamaClient } from "./facturama.js";
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
      tasaIva: "0.08",
      ivaImporte: "8",
      ivaBase: "100",
      objetoImpuesto: "02",
      total: "108",
    },
  ],
  subtotal: "100",
  descuento: "0",
  iva: "16",
  ieps: "0",
  total: "116",
};

function requiredConcept() {
  const concept = baseInput.conceptos[0];
  if (!concept) throw new Error("Missing fixture");
  return concept;
}
afterEach(() => vi.unstubAllGlobals());
describe("Facturama fiscal payload (no network)", () => {
  it("sends real tax amounts, bases and quotas instead of zero taxes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            Id: "fake",
            Folio: "1",
            Complemento: {
              TimbreFiscalDigital: {
                UUID: "fake",
                FechaTimbrado: "2026-09-08T00:00:00Z",
                SelloCFD: "x",
                SelloSAT: "y",
                NoCertificadoSAT: "z",
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockImplementation(async () => new Response("mock document"));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      ...baseInput,
      cfdisRelacionados: { tipoRelacion: "03" as const, uuids: ["original-uuid"] },
      conceptos: [
        {
          ...requiredConcept(),
          aplicaIeps: true,
          tasaIeps: "1.5",
          iepsBase: "2",
          iepsImporte: "3",
          iepsCuota: true,
        },
      ],
    };
    await new FacturamaClient({ apiKey: "fake:fake", ambiente: "sandbox" }).emitir(input);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
    expect(body.Relations).toEqual({ Type: "03", Cfdis: [{ Uuid: "original-uuid" }] });
    expect(body.Items[0]).toMatchObject({
      TaxObject: "02",
      Total: "108",
      Taxes: [
        { Name: "IVA", Rate: "0.08", Base: "100", Total: "8", IsQuota: false },
        { Name: "IEPS", Rate: "1.5", Base: "2", Total: "3", IsQuota: true },
      ],
    });
  });
  it("rejects incomplete fiscal concepts before any provider request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { ivaImporte: _omitted, ...incomplete } = requiredConcept();
    const input = { ...baseInput, conceptos: [incomplete] };
    await expect(
      new FacturamaClient({ apiKey: "fake", ambiente: "sandbox" }).emitir(input),
    ).rejects.toMatchObject({ code: "FISCAL_SNAPSHOT_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
