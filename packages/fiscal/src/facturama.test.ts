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

const signedXml = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4">
<cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
Version="1.1" UUID="fake-uuid" FechaTimbrado="2026-09-08T00:00:00"
SelloCFD="seal-cfd" SelloSAT="seal-sat" NoCertificadoSAT="certificate-sat"
RfcProvCertif="AAA010101AAA" /></cfdi:Complemento></cfdi:Comprobante>`;

function documentResponse(url: string) {
  return new Response(
    JSON.stringify({
      Content: Buffer.from(url.includes("/xml/") ? signedXml : "%PDF-1.4 test").toString("base64"),
    }),
  );
}

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
          }),
          { status: 200 },
        ),
      )
      .mockImplementation(async (url: string) => documentResponse(url));
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
    const result = await new FacturamaClient({ apiKey: "fake:fake", ambiente: "sandbox" }).emitir(
      input,
    );
    expect(result).toMatchObject({
      xml: signedXml,
      pdfBase64: Buffer.from("%PDF-1.4 test").toString("base64"),
      folioFiscal: "fake-uuid",
      selloDigitalCfdi: "seal-cfd",
      selloSat: "seal-sat",
      noCertificadoSat: "certificate-sat",
      cadenaOriginalSat:
        "||1.1|fake-uuid|2026-09-08T00:00:00|AAA010101AAA|seal-cfd|certificate-sat||",
    });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://apisandbox.facturama.mx/api-lite/3/cfdis",
      "https://apisandbox.facturama.mx/api/Cfdi/xml/issuedLite/fake",
      "https://apisandbox.facturama.mx/api/Cfdi/pdf/issuedLite/fake",
    ]);
    for (const call of fetchMock.mock.calls)
      expect(call[1].headers).toMatchObject({
        Authorization: `Basic ${Buffer.from("fake:fake").toString("base64")}`,
        "User-Agent": "fake",
      });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
    expect(body.Receiver).toMatchObject({ TaxZipCode: "44100" });
    expect(body.Receiver).not.toHaveProperty("FiscalAddress");
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
  it("uses the multi-issuer cancellation endpoint and retains a pending SAT status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ Status: "pending" })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new FacturamaClient({
      apiKey: "user:password",
      ambiente: "sandbox",
    }).cancelar({ facturamaId: "a/b", motivo: "01", folioFiscalRelacionado: "replacement" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://apisandbox.facturama.mx/api-lite/cfdis/a%2Fb?motive=01&uuidReplacement=replacement",
    );
    expect(result.estado).toBe("EnProceso");
  });

  it.each(["canceled", "Cancelado"])("recognizes completed cancellation %s", async (Status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ Status }))));
    expect(
      (
        await new FacturamaClient({ apiKey: "user:password", ambiente: "sandbox" }).cancelar({
          facturamaId: "id",
          motivo: "02",
        })
      ).estado,
    ).toBe("Cancelado");
  });

  it.each(["", "not base64!", undefined])(
    "rejects missing or invalid file content %s",
    async (Content) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(new Response(JSON.stringify({ Id: "id", Folio: "1" })))
          .mockImplementation(async () => new Response(JSON.stringify({ Content }))),
      );
      await expect(
        new FacturamaClient({ apiKey: "user:password", ambiente: "sandbox" }).emitir(baseInput),
      ).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
    },
  );

  it.each(["<not-a-cfdi/>", "<!DOCTYPE x [<!ENTITY test SYSTEM 'file:///etc/passwd'>]><x/>"])(
    "rejects unsigned or unsafe XML",
    async (xml) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(new Response(JSON.stringify({ Id: "id", Folio: "1" })))
          .mockImplementation(
            async () =>
              new Response(
                JSON.stringify({
                  Content: Buffer.from(xml).toString("base64"),
                }),
              ),
          ),
      );
      await expect(
        new FacturamaClient({ apiKey: "user:password", ambiente: "sandbox" }).emitir(baseInput),
      ).rejects.toMatchObject({ code: expect.stringMatching(/INVALID_XML|MISSING_TIMBRE/) });
    },
  );
});
